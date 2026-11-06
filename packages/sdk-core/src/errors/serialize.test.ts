import { describe, expect, it } from "vitest";
import { isSdkError, SdkError } from "./sdk-error.js";
import { deserializeError, type SerializedError, serializeError } from "./serialize.js";

type PdfErrorCode = "FILE_TOO_LARGE" | "PDF_ENCRYPTED";

class PdfError extends SdkError<PdfErrorCode> {
  override readonly name = "PdfError";
}

const errorClasses = { PdfError };

/** Sends an error across a simulated worker boundary. */
function roundTrip(error: unknown, options?: Parameters<typeof serializeError>[1]): SdkError {
  return deserializeError(structuredClone(serializeError(error, options)), { errorClasses });
}

/** Builds a chain of `length` errors, each caused by the next. */
function chain(length: number): SdkError {
  let error: SdkError | undefined;
  for (let index = length - 1; index >= 0; index -= 1) {
    error = new SdkError(`LEVEL_${index}`, `Level ${index}.`, error ? { cause: error } : {});
  }
  if (!error) {
    throw new Error("chain needs at least one error");
  }
  return error;
}

/** Lists the codes along an error's cause chain. */
function causeCodes(error: unknown): string[] {
  const codes: string[] = [];
  for (let current = error; isSdkError(current); current = current.cause) {
    codes.push(current.code);
  }
  return codes;
}

describe("serializeError and deserializeError", () => {
  it("round-trip an SdkError through structuredClone", () => {
    const error = new SdkError("FILE_TOO_LARGE", "Too large.", {
      details: { limit: 10, size: 20, units: ["B"], nested: { ok: true, none: null } },
    });
    const rebuilt = roundTrip(error);

    expect(rebuilt).toBeInstanceOf(SdkError);
    expect(rebuilt).toMatchObject({
      name: "SdkError",
      code: "FILE_TOO_LARGE",
      message: "Too large.",
      details: { limit: 10, size: 20, units: ["B"], nested: { ok: true, none: null } },
    });
  });

  it("produce data that survives JSON unchanged", () => {
    const serialized = serializeError(
      new PdfError("PDF_ENCRYPTED", "Encrypted.", {
        details: { pages: 3 },
        cause: new TypeError("inner"),
      }),
    );

    expect(JSON.parse(JSON.stringify(serialized))).toEqual(serialized);
  });

  it("are needed because structuredClone alone drops the code", () => {
    const cloned = structuredClone(new SdkError("FILE_TOO_LARGE", "Too large."));

    expect(isSdkError(cloned)).toBe(false);
    expect("code" in cloned).toBe(false);
  });

  it("rebuild registered subclasses with their own class", () => {
    const rebuilt = roundTrip(new PdfError("PDF_ENCRYPTED", "Encrypted."));

    expect(rebuilt).toBeInstanceOf(PdfError);
    expect(rebuilt.name).toBe("PdfError");
    expect(isSdkError(rebuilt, "PDF_ENCRYPTED")).toBe(true);
  });

  it("rebuild unregistered subclasses as SdkError, keeping their name", () => {
    const rebuilt = deserializeError(serializeError(new PdfError("PDF_ENCRYPTED", "Encrypted.")));

    expect(rebuilt).toBeInstanceOf(SdkError);
    expect(rebuilt).not.toBeInstanceOf(PdfError);
    expect(rebuilt).toMatchObject({ name: "PdfError", code: "PDF_ENCRYPTED" });
  });

  it("keep the cause chain, including errors that aren't SdkErrors", () => {
    const error = new PdfError("FILE_TOO_LARGE", "Outer.", {
      cause: new TypeError("Middle.", { cause: "inner" }),
    });
    const rebuilt = roundTrip(error);

    expect(rebuilt).toBeInstanceOf(PdfError);
    expect(rebuilt.cause).toMatchObject({
      name: "SdkError",
      code: "UNKNOWN",
      message: "Middle.",
      details: { originalName: "TypeError" },
      cause: { code: "UNKNOWN", message: "inner", details: { thrownType: "string" } },
    });
  });

  it("limit the cause chain to 8 levels by default", () => {
    const rebuilt = roundTrip(chain(12));

    expect(causeCodes(rebuilt)).toEqual(Array.from({ length: 9 }, (_, index) => `LEVEL_${index}`));
  });

  it("apply a custom depth limit on both sides", () => {
    expect(causeCodes(roundTrip(chain(5), { maxDepth: 2 }))).toEqual([
      "LEVEL_0",
      "LEVEL_1",
      "LEVEL_2",
    ]);
    expect(causeCodes(deserializeError(serializeError(chain(5)), { maxDepth: 0 }))).toEqual([
      "LEVEL_0",
    ]);
  });

  it("stop at cycles in the cause chain", () => {
    const first = new SdkError("FIRST", "First.");
    const second = new SdkError("SECOND", "Second.", { cause: first });
    Object.defineProperty(first, "cause", { value: second });

    expect(causeCodes(roundTrip(first))).toEqual(["FIRST", "SECOND"]);
  });

  it("reject an invalid depth limit", () => {
    expect(() => serializeError(new Error("x"), { maxDepth: -1 })).toThrow(RangeError);
    expect(() => deserializeError({}, { maxDepth: 1.5 })).toThrow(RangeError);
  });

  describe("stack traces", () => {
    it("aren't included by default", () => {
      const serialized = serializeError(new SdkError("UNKNOWN", "x", { cause: new Error("y") }));

      expect(serialized.stack).toBeUndefined();
      expect(serialized.cause?.stack).toBeUndefined();
    });

    it("are included on request, and replace the local stack when rebuilt", () => {
      const error = new SdkError("UNKNOWN", "Remote failure.");
      const rebuilt = roundTrip(error, { includeStack: true });

      expect(rebuilt.stack).toBe(error.stack);
    });
  });

  describe("values that aren't SdkErrors", () => {
    it.each<[string, unknown, Partial<SerializedError>]>([
      [
        "an Error",
        new RangeError("Out of range."),
        { message: "Out of range.", details: { originalName: "RangeError" } },
      ],
      [
        "a DOMException",
        new DOMException("Stopped.", "AbortError"),
        { message: "Stopped.", details: { originalName: "AbortError" } },
      ],
      ["a string", "Plain text.", { message: "Plain text.", details: { thrownType: "string" } }],
      ["a number", 42, { details: { thrownType: "number" } }],
      ["null", null, { details: { thrownType: "null" } }],
      ["undefined", undefined, { details: { thrownType: "undefined" } }],
      ["a symbol", Symbol("thrown"), { details: { thrownType: "symbol" } }],
      ["an object without a message", { reason: "x" }, { details: { thrownType: "object" } }],
    ])("serialize %s with the code UNKNOWN", (_label, value, expected) => {
      const serialized = serializeError(value);

      expect(serialized).toMatchObject({ name: "SdkError", code: "UNKNOWN", ...expected });
      expect(() => structuredClone(serialized)).not.toThrow();
    });
  });

  describe("details", () => {
    it("keep only JSON-compatible values", () => {
      const details = {
        kept: "yes",
        list: [1, () => 2, Number.NaN, "three"],
        fn: () => 1,
        missing: undefined,
        infinite: Number.POSITIVE_INFINITY,
        date: new Date(0),
        instance: new Map(),
        bareObject: Object.assign(Object.create(null), { ok: 1 }),
      };
      const error = new SdkError("UNKNOWN", "x", { details: details as never });

      expect(serializeError(error).details).toEqual({
        kept: "yes",
        list: [1, "three"],
        bareObject: { ok: 1 },
      });
    });

    it("drop nesting deeper than 16 levels", () => {
      let deep: Record<string, unknown> = { leaf: true };
      for (let level = 0; level < 20; level += 1) {
        deep = { deep };
      }
      const serialized = serializeError(new SdkError("UNKNOWN", "x", { details: deep as never }));

      expect(JSON.stringify(serialized.details).match(/deep/g)).toHaveLength(15);
    });
  });

  describe("untrusted input to deserializeError", () => {
    it.each([
      ["null", null],
      ["a string", "FILE_TOO_LARGE"],
      ["a missing code", { name: "SdkError", message: "x" }],
      ["a numeric code", { name: "SdkError", code: 7, message: "x" }],
    ])("turns %s into an UNKNOWN SdkError", (_label, data) => {
      const rebuilt = deserializeError(data);

      expect(rebuilt).toBeInstanceOf(SdkError);
      expect(rebuilt.code).toBe("UNKNOWN");
    });

    it.each(["constructor", "__proto__", "toString", "hasOwnProperty"])(
      "doesn't resolve the name %j through the prototype chain",
      (name) => {
        const rebuilt = deserializeError({ name, code: "X", message: "x" }, { errorClasses });

        expect(Object.getPrototypeOf(rebuilt)).toBe(SdkError.prototype);
        expect(rebuilt.code).toBe("X");
      },
    );

    it("sanitizes received details", () => {
      const rebuilt = deserializeError({
        name: "SdkError",
        code: "X",
        message: "x",
        details: { ok: 1, bad: new Map() },
      });

      expect(rebuilt.details).toEqual({ ok: 1 });
    });

    it("falls back to SdkError when a registered class can't be rebuilt", () => {
      class StrictError extends SdkError<"STRICT"> {
        override readonly name = "StrictError";
        constructor(code: "STRICT", message: string) {
          if (code !== "STRICT") {
            throw new TypeError("unexpected code");
          }
          super(code, message);
        }
      }
      const rebuilt = deserializeError(
        { name: "StrictError", code: "OTHER", message: "x" },
        { errorClasses: { StrictError } },
      );

      expect(rebuilt).not.toBeInstanceOf(StrictError);
      expect(rebuilt).toMatchObject({ name: "StrictError", code: "OTHER" });
    });
  });
});
