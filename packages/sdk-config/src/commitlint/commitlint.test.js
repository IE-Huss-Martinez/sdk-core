import { spawnSync } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import lint from "@commitlint/lint";
import load from "@commitlint/load";
import { describe, expect, it } from "vitest";
import config, { HEADER_MAX_LENGTH, PR_TITLE_MAX_LENGTH, SUBJECT_PATTERN, TYPES } from "./index.js";

const PR_TITLE_WORKFLOW = new URL("../../../../.github/workflows/pr-title.yml", import.meta.url);

/**
 * @param {string} message
 * @returns {Promise<string[]>} Names of the rules the message breaks.
 */
async function errors(message) {
  const { rules, parserPreset, plugins } = await load(config);
  const result = await lint(message, rules, {
    ...(parserPreset?.parserOpts ? { parserOpts: parserPreset.parserOpts } : {}),
    plugins,
  });
  return result.errors.map((error) => error.name);
}

describe("commitlint preset", () => {
  it.each([
    "feat: add worker messaging",
    "fix(sdk-core): keep error codes across workers",
    "feat!: drop the legacy entry point",
    "fix: handle iOS file pickers",
    "build: pin typescript to 6.0\n\nTypeScript 7 has no compiler API yet.",
  ])("accepts %j", async (message) => {
    await expect(errors(message)).resolves.toEqual([]);
  });

  it.each([
    ["Add worker messaging", ["subject-empty", "type-empty"]],
    ["feat: Add worker messaging", ["hm/subject-pattern"]],
    ["feat: API cleanup", ["hm/subject-pattern"]],
    ["Feat: add worker messaging", ["type-case", "type-enum"]],
    ["style: format files", ["type-enum"]],
    ["feat:add worker messaging", ["subject-empty", "type-empty"]],
  ])("rejects %j", async (message, rules) => {
    await expect(errors(message)).resolves.toEqual(expect.arrayContaining(rules));
  });

  it("uses the same types and subject rule as the pr-title workflow", async () => {
    const workflow = await readFile(PR_TITLE_WORKFLOW, "utf8");
    const typesBlock = /^\s+types: \|\n((?:\s+\w+\n)+)/m.exec(workflow)?.[1] ?? "";
    const workflowTypes = typesBlock
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const workflowPattern = /^\s+subjectPattern: (.+)$/m.exec(workflow)?.[1];

    expect(workflowTypes).toEqual(TYPES);
    expect(workflowPattern).toBe(SUBJECT_PATTERN.source);
  });

  it(`limits the header to ${HEADER_MAX_LENGTH} characters`, async () => {
    const prefix = "docs: ";
    const fits = `${prefix}${"a".repeat(HEADER_MAX_LENGTH - prefix.length)}`;

    await expect(errors(fits)).resolves.toEqual([]);
    await expect(errors(`${fits}a`)).resolves.toEqual(["header-max-length"]);
  });

  it("leaves room for the pull request number in the squash commit title", () => {
    expect(PR_TITLE_MAX_LENGTH + " (#999)".length).toBe(HEADER_MAX_LENGTH);
  });
});

describe("pr-title workflow length check", () => {
  /**
   * Runs the workflow's length step with bash, with the step's own
   * environment and nothing inherited, as the runner does.
   *
   * @param {string} title
   * @param {Record<string, string>} [overrides] Environment changes, to test
   *   what the step's settings protect against.
   */
  async function checkTitle(title, overrides = {}) {
    const workflow = await readFile(PR_TITLE_WORKFLOW, "utf8");
    const step = /- name: Check the title length\n([\s\S]*?)\n\n/.exec(workflow)?.[1] ?? "";
    const envBlock = /env:\n((?:\s{10}.*\n)+?)\s{8}run:/.exec(step)?.[1] ?? "";
    /** @type {Record<string, string>} */
    const stepEnv = {};
    for (const [, name, value] of envBlock.matchAll(/^\s{10}([A-Z_]+): (.+)$/gm)) {
      if (name && value && !value.includes("${{")) {
        stepEnv[name] = value;
      }
    }
    const script = /run: \|\n((?:\s{10}.*\n?)+)/.exec(step)?.[1] ?? "";
    const cwd = await mkdtemp(join(tmpdir(), "hm-pr-title-"));
    try {
      const result = spawnSync("bash", ["-e", "-c", script], {
        cwd,
        encoding: "utf8",
        env: { PATH: process.env["PATH"], ...stepEnv, ...overrides, TITLE: title },
      });
      return { stepEnv, status: result.status, stdout: result.stdout, files: await readdir(cwd) };
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  }

  it("uses the preset's pull request title limit and a UTF-8 locale", async () => {
    const { stepEnv } = await checkTitle("docs: x");

    expect(stepEnv["MAX_LENGTH"]).toBe(String(PR_TITLE_MAX_LENGTH));
    expect(stepEnv["LC_ALL"]).toMatch(/\.UTF-8$/i);
  });

  it("accepts a title at the limit and rejects one over it", async () => {
    const fits = `docs: ${"a".repeat(PR_TITLE_MAX_LENGTH - 6)}`;

    await expect(checkTitle(fits)).resolves.toMatchObject({ status: 0 });
    const tooLong = await checkTitle(`${fits}a`);
    expect(tooLong.status).toBe(1);
    expect(tooLong.stdout).toContain(`has ${PR_TITLE_MAX_LENGTH + 1} characters`);
  });

  describe("with multibyte characters", () => {
    const title = `docs: ${"é".repeat(PR_TITLE_MAX_LENGTH - 6)}`;

    it("counts characters, not bytes", async () => {
      await expect(checkTitle(title)).resolves.toMatchObject({ status: 0 });
    });

    it("would count bytes without the step's locale", async () => {
      const result = await checkTitle(title, { LC_ALL: "C" });

      expect(result.status).toBe(1);
      expect(result.stdout).toContain(`has ${2 * PR_TITLE_MAX_LENGTH - 6} characters`);
    });
  });

  it("never runs the title as code", async () => {
    const result = await checkTitle('docs: $(touch pwned) `touch pwned2` "; touch pwned3; "');

    expect(result.status).toBe(0);
    expect(result.files).toEqual([]);
  });
});
