import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  checkCase,
  conforms,
  describeConformance,
  readConformance,
  schemaValidator,
} from "./conformance.js";

const SCHEMA = new URL("../../formats/hm-conformance/v1.schema.json", import.meta.url);
const FIXTURE = new URL("../../test/fixtures/conformance/sequence.json", import.meta.url);

/** The fixture's subject: boundaries of a sequence, rejecting zero lengths with a code. */
function boundaries(/** @type {number[]} */ lengths) {
  const out = [0];
  for (const length of lengths) {
    if (length === 0) {
      throw Object.assign(new Error("A length is zero."), {
        code: "INVALID_LENGTH",
        details: { reason: "zero-length" },
      });
    }
    out.push((out.at(-1) ?? 0) + length);
  }
  return out;
}

// The loader in real use: one test per case of the fixture, all passing.
describeConformance(FIXTURE, boundaries);

const temporary = await mkdtemp(join(tmpdir(), "hm-conformance-"));
afterAll(() => rm(temporary, { recursive: true, force: true }));

/** Writes a conformance file and returns its path. */
async function file(/** @type {unknown} */ content) {
  const path = join(temporary, `${Math.random().toString(36).slice(2)}.json`);
  await writeFile(path, JSON.stringify(content));
  return path;
}

const VALID = {
  format: "hm-conformance",
  version: 1,
  subject: "hm-video-commands",
  cases: [{ name: "a", input: 1, expected: 2 }],
};

describe("readConformance", () => {
  it("reads a valid file", async () => {
    expect(readConformance(await file(VALID)).subject).toBe("hm-video-commands");
  });

  it.each([
    ["the wrong format", { ...VALID, format: "hm-other" }, "/format"],
    ["the wrong version", { ...VALID, version: 2 }, "/version"],
    ["a subject not named hm-<kind>-<thing>", { ...VALID, subject: "Video Commands" }, "/subject"],
    ["no cases", { ...VALID, cases: [] }, "/cases"],
    ["a case without expected", { ...VALID, cases: [{ name: "a", input: 1 }] }, "/cases/0"],
    [
      "a non-positive tolerance",
      { ...VALID, cases: [{ name: "a", input: 1, expected: 2, tolerance: 0 }] },
      "/cases/0/tolerance",
    ],
    ["an unknown top-level field", { ...VALID, extra: true }, "/"],
  ])("rejects %s, naming where", async (_name, content, where) => {
    const path = await file(content);
    expect(() => readConformance(path)).toThrow(TypeError);
    expect(() => readConformance(path)).toThrow(where);
  });

  it("rejects two cases with the same name", async () => {
    const path = await file({ ...VALID, cases: [VALID.cases[0], VALID.cases[0]] });
    expect(() => readConformance(path)).toThrow('two cases named "a"');
  });
});

describe("conforms", () => {
  it("compares JSON values exactly without a tolerance", () => {
    expect(conforms({ a: [1, "x", null, true] }, { a: [1, "x", null, true] })).toBe(true);
    expect(conforms({ a: 0.30000000000000004 }, { a: 0.3 })).toBe(false);
    expect(conforms([1, 2], [1, 2, 3])).toBe(false);
    expect(conforms({ a: 1, b: 2 }, { a: 1 })).toBe(false);
    expect(conforms({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(conforms([1], { 0: 1 })).toBe(false);
    expect(conforms(null, {})).toBe(false);
    expect(conforms("1", 1)).toBe(false);
  });

  it("ignores undefined fields, which JSON can't hold", () => {
    expect(conforms({ a: 1, b: undefined }, { a: 1 })).toBe(true);
  });

  it("widens every number by the tolerance, at any depth, and nothing else", () => {
    expect(conforms({ a: [0.30000000000000004] }, { a: [0.3] }, 1e-12)).toBe(true);
    expect(conforms({ a: [0.31] }, { a: [0.3] }, 1e-12)).toBe(false);
    expect(conforms({ a: "0.3" }, { a: 0.3 }, 1)).toBe(false);
  });
});

describe("checkCase", () => {
  const ok = { name: "n", input: [1, 2], expected: [0, 1, 3] };

  it("passes a matching result, and names the difference otherwise", async () => {
    await expect(checkCase(ok, boundaries)).resolves.toBeUndefined();
    await expect(checkCase({ ...ok, expected: [0, 1, 4] }, boundaries)).resolves.toBe(
      "it returned [0,1,3], but [0,1,4] was expected",
    );
  });

  it("matches a rejection by code and reason, never by message", async () => {
    const rejection = { name: "n", input: [0] };
    await expect(
      checkCase(
        { ...rejection, expected: { error: { code: "INVALID_LENGTH", reason: "zero-length" } } },
        boundaries,
      ),
    ).resolves.toBeUndefined();
    await expect(
      checkCase({ ...rejection, expected: { error: { code: "INVALID_LENGTH" } } }, boundaries),
    ).resolves.toBeUndefined();
    await expect(
      checkCase(
        { ...rejection, expected: { error: { code: "INVALID_LENGTH", reason: "negative" } } },
        boundaries,
      ),
    ).resolves.toContain('was rejected with {"code":"INVALID_LENGTH","reason":"zero-length"}');
    await expect(
      checkCase({ ...rejection, expected: { error: { code: "OTHER" } } }, boundaries),
    ).resolves.toContain("was rejected with");
  });

  it("fails when a rejection was expected but a result came, and the reverse", async () => {
    await expect(
      checkCase({ ...ok, expected: { error: { code: "INVALID_LENGTH" } } }, boundaries),
    ).resolves.toContain("but a rejection was expected");
    await expect(checkCase({ ...ok, input: [0] }, boundaries)).resolves.toContain(
      "it threw Error: A length is zero., but a result was expected",
    );
  });

  it("awaits an asynchronous run", async () => {
    await expect(
      checkCase(ok, async (/** @type {number[]} */ input) => boundaries(input)),
    ).resolves.toBeUndefined();
  });
});

describe("schemaValidator", () => {
  it("validates against a JSON Schema 2020-12 file, listing each problem", () => {
    const errors = schemaValidator(SCHEMA);
    expect(errors(VALID)).toEqual([]);
    expect(errors({ ...VALID, version: "1" })).toEqual(["/version must be equal to constant"]);
  });

  it("describes a rejection's shape in $defs.error", async () => {
    const schema = await import(SCHEMA.href, { with: { type: "json" } });
    expect(schema.default.$defs.error.properties.error.required).toEqual(["code"]);
  });
});
