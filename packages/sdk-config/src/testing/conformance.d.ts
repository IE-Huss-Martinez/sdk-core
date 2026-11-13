/**
 * Creates a JSON Schema validator (draft 2020-12) for tests: of a conformance
 * file, or of an SDK's own format schema.
 *
 * @param {string | URL} schemaPath A JSON Schema file.
 * @returns {(value: unknown) => string[]} The validation errors, empty when valid.
 */
export function schemaValidator(schemaPath: string | URL): (value: unknown) => string[];
/**
 * Reads a conformance file, and throws if it doesn't match the
 * `hm-conformance` schema, or if two cases share a name.
 *
 * @param {string | URL} path
 * @returns {ConformanceFile}
 */
export function readConformance(path: string | URL): ConformanceFile;
/**
 * Whether two JSON values are equal, with numbers within `tolerance` when
 * it's given, and exactly otherwise.
 *
 * @param {unknown} actual
 * @param {unknown} expected
 * @param {number} [tolerance]
 * @returns {boolean}
 */
export function conforms(actual: unknown, expected: unknown, tolerance?: number): boolean;
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
export function checkCase<Input = unknown>(testCase: ConformanceCase, run: (input: Input, testCase: ConformanceCase) => unknown): Promise<string | undefined>;
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
export function describeConformance<Input = unknown>(path: string | URL, run: (input: Input, testCase: ConformanceCase) => unknown): void;
export type ConformanceCase = {
    /**
     * The case's name, shown as the test's name.
     */
    name: string;
    /**
     * What the subject's function receives.
     */
    input: unknown;
    /**
     * The result, or `{ error: { code, reason? } }` for a rejection.
     */
    expected: unknown;
    /**
     * The largest absolute difference allowed for every number.
     */
    tolerance?: number;
};
export type ConformanceFile = {
    format: "hm-conformance";
    version: 1;
    subject: string;
    description?: string;
    cases: ConformanceCase[];
};
