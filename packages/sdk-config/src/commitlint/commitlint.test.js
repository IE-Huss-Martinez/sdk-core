import lint from "@commitlint/lint";
import load from "@commitlint/load";
import { describe, expect, it } from "vitest";
import config, { HEADER_MAX_LENGTH, PR_TITLE_MAX_LENGTH } from "./index.js";

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

// sdk-ci's pr-title action checks pull request titles against this preset's
// TYPES, SUBJECT_PATTERN and PR_TITLE_MAX_LENGTH, and sdk-ci's tests check
// that the two agree (test/pr-title.test.js there).
