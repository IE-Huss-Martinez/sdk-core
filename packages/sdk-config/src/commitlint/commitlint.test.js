import { readFile } from "node:fs/promises";
import lint from "@commitlint/lint";
import load from "@commitlint/load";
import { describe, expect, it } from "vitest";
import config, { SUBJECT_PATTERN, TYPES } from "./index.js";

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
});
