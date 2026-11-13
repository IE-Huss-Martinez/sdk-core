// Runs language-neutral conformance cases in Vitest (sdk-core ADR 0045).
// Each SDK keeps its cases in conformance/*.json, and its TypeScript tests
// run those same files, so they can't drift from the reference
// implementation.
//
// Test code only: import it only from tests. It needs vitest and ajv, which
// are optional peer dependencies of this package.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";

const SCHEMA_URL = new URL("../../formats/hm-conformance/v1.schema.json", import.meta.url);

/**
 * @typedef {object} ConformanceCase
 * @property {string} name The case's name, shown as the test's name.
 * @property {unknown} input What the subject's function receives.
 * @property {unknown} expected The result, or `{ error: { code, reason? } }` for a rejection.
 * @property {number} [tolerance] The largest absolute difference allowed for every number.
 */

/**
 * @typedef {object} ConformanceFile
 * @property {"hm-conformance"} format
 * @property {1} version
 * @property {string} subject
 * @property {string} [description]
 * @property {ConformanceCase[]} cases
 */

/** The hm-conformance schema's validator, created on first use. @type {((value: unknown) => string[]) | undefined} */
let fileErrors;

/**
 * Creates a JSON Schema validator (draft 2020-12) for tests: of a conformance
 * file, or of an SDK's own format schema.
 *
 * @param {string | URL} schemaPath A JSON Schema file.
 * @returns {(value: unknown) => string[]} The validation errors, empty when valid.
 */
export function schemaValidator(schemaPath) {
  const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
  const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);
  return (value) =>
    validate(value)
      ? []
      : (validate.errors ?? []).map(
          (error) => `${error.instancePath || "/"} ${error.message ?? "is invalid"}`,
        );
}

/**
 * Reads a conformance file, and throws if it doesn't match the
 * `hm-conformance` schema, or if two cases share a name.
 *
 * @param {string | URL} path
 * @returns {ConformanceFile}
 */
export function readConformance(path) {
  const file = JSON.parse(readFileSync(path, "utf8"));
  fileErrors ??= schemaValidator(SCHEMA_URL);
  const problems = fileErrors(file);
  const where = typeof path === "string" ? path : fileURLToPath(path);
  if (problems.length > 0) {
    throw new TypeError(`${where} isn't a valid hm-conformance file:\n${problems.join("\n")}`);
  }
  const names = new Set();
  for (const { name } of file.cases) {
    if (names.has(name)) {
      throw new TypeError(`${where} has two cases named ${JSON.stringify(name)}.`);
    }
    names.add(name);
  }
  return file;
}

/**
 * Whether two JSON values are equal, with numbers within `tolerance` when
 * it's given, and exactly otherwise.
 *
 * @param {unknown} actual
 * @param {unknown} expected
 * @param {number} [tolerance]
 * @returns {boolean}
 */
export function conforms(actual, expected, tolerance) {
  if (typeof expected === "number" && typeof actual === "number") {
    return tolerance === undefined ? actual === expected : Math.abs(actual - expected) <= tolerance;
  }
  if (Array.isArray(expected)) {
    return (
      Array.isArray(actual) &&
      actual.length === expected.length &&
      expected.every((item, index) => conforms(actual[index], item, tolerance))
    );
  }
  if (expected !== null && typeof expected === "object") {
    if (actual === null || typeof actual !== "object" || Array.isArray(actual)) {
      return false;
    }
    const keys = Object.keys(expected);
    const actualKeys = Object.keys(actual).filter(
      (key) => /** @type {Record<string, unknown>} */ (actual)[key] !== undefined,
    );
    return (
      actualKeys.length === keys.length &&
      keys.every((key) =>
        conforms(
          /** @type {Record<string, unknown>} */ (actual)[key],
          /** @type {Record<string, unknown>} */ (expected)[key],
          tolerance,
        ),
      )
    );
  }
  return actual === expected;
}

/**
 * Whether an expected result is a rejection.
 *
 * @param {unknown} expected
 * @returns {expected is { error: { code: string, reason?: string } }}
 */
function isRejection(expected) {
  return (
    expected !== null &&
    typeof expected === "object" &&
    "error" in expected &&
    Object.keys(expected).length === 1
  );
}

/**
 * Runs one case and checks its result: the problem, or `undefined` when the
 * case passes. A rejection is matched by the thrown error's `code` and
 * `details.reason`, never its message.
 *
 * @template [Input=unknown] The input's type, as the subject's cases hold it.
 * @param {ConformanceCase} testCase
 * @param {(input: Input, testCase: ConformanceCase) => unknown} run
 * @returns {Promise<string | undefined>}
 */
export async function checkCase(testCase, run) {
  const { expected, tolerance } = testCase;
  /** @type {unknown} */
  let actual;
  try {
    actual = await run(/** @type {Input} */ (testCase.input), testCase);
  } catch (error) {
    if (!isRejection(expected)) {
      return `it threw ${String(error)}, but a result was expected: ${JSON.stringify(expected)}`;
    }
    const thrown = /** @type {{ code?: unknown, details?: { reason?: unknown } } | null} */ (error);
    const got = {
      code: thrown?.code,
      ...(expected.error.reason === undefined ? {} : { reason: thrown?.details?.reason }),
    };
    return conforms(got, expected.error)
      ? undefined
      : `it was rejected with ${JSON.stringify(got)}, but ${JSON.stringify(expected.error)} was expected`;
  }
  if (isRejection(expected)) {
    return `it returned ${JSON.stringify(actual)}, but a rejection was expected: ${JSON.stringify(expected.error)}`;
  }
  return conforms(actual, expected, tolerance)
    ? undefined
    : `it returned ${JSON.stringify(actual)}, but ${JSON.stringify(expected)} was expected${tolerance === undefined ? "" : `, within ${tolerance}`}`;
}

/**
 * Registers a Vitest test for each case of a conformance file. `run` gets a
 * case's input and returns the result to compare with `expected`, or throws
 * a rejection, which is matched by its `code` and `details.reason`.
 *
 * @example
 * ```ts
 * import { describeConformance } from "@hussmartinez/sdk-config/testing/conformance";
 *
 * describeConformance(new URL("../../conformance/commands.json", import.meta.url), (input) =>
 *   applyCommand(input.plan, input.command),
 * );
 * ```
 *
 * @template [Input=unknown] The input's type, as the subject's cases hold it.
 * @param {string | URL} path The conformance file.
 * @param {(input: Input, testCase: ConformanceCase) => unknown} run
 */
export function describeConformance(path, run) {
  const file = readConformance(path);
  describe(`${file.subject} conformance`, () => {
    for (const testCase of file.cases) {
      it(testCase.name, async () => {
        const problem = await checkCase(testCase, run);
        if (problem !== undefined) {
          expect.fail(problem);
        }
      });
    }
  });
}
