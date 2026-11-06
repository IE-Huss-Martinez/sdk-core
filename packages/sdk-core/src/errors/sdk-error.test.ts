import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { isSdkError, SdkError } from "./sdk-error.js";

type PdfErrorCode = "FILE_TOO_LARGE" | "PDF_ENCRYPTED";

class PdfError extends SdkError<PdfErrorCode> {
  override readonly name = "PdfError";
}

describe("SdkError", () => {
  it("carries a code, message, details and cause", () => {
    const cause = new TypeError("bad input");
    const error = new SdkError("FILE_TOO_LARGE", "Too large.", {
      details: { limit: 10, size: 20 },
      cause,
    });

    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({
      name: "SdkError",
      code: "FILE_TOO_LARGE",
      message: "Too large.",
      details: { limit: 10, size: 20 },
      cause,
    });
    expect(error.stack).toContain("Too large.");
  });

  it("has no cause or details properties unless they're given", () => {
    const error = new SdkError("UNKNOWN", "Failed.");

    expect("cause" in error).toBe(false);
    expect("details" in error).toBe(false);
  });

  it("keeps an explicitly undefined cause, as Error does", () => {
    expect("cause" in new SdkError("UNKNOWN", "Failed.", { cause: undefined })).toBe(true);
  });

  it("lets subclasses narrow the code and set their name", () => {
    const error = new PdfError("PDF_ENCRYPTED", "Encrypted.");

    expect(error).toBeInstanceOf(SdkError);
    expect(error.name).toBe("PdfError");
    expect(String(error)).toBe("PdfError: Encrypted.");
    // @ts-expect-error The code isn't one of PdfError's codes.
    new PdfError("NOT_A_PDF_CODE", "Rejected at compile time.");
  });
});

describe("isSdkError", () => {
  it("recognises SdkErrors and subclasses", () => {
    expect(isSdkError(new SdkError("UNKNOWN", "x"))).toBe(true);
    expect(isSdkError(new PdfError("PDF_ENCRYPTED", "x"))).toBe(true);
  });

  it("narrows by code", () => {
    const error: unknown = new PdfError("PDF_ENCRYPTED", "x");

    expect(isSdkError(error, "PDF_ENCRYPTED")).toBe(true);
    expect(isSdkError(error, "FILE_TOO_LARGE")).toBe(false);
    if (isSdkError(error, "PDF_ENCRYPTED")) {
      const code: "PDF_ENCRYPTED" = error.code;
      expect(code).toBe("PDF_ENCRYPTED");
    }
  });

  it.each([
    ["an Error", new Error("x")],
    ["a Node error with a string code", Object.assign(new Error("x"), { code: "ENOENT" })],
    ["an error-shaped object", { name: "SdkError", code: "UNKNOWN", message: "x" }],
    ["a string", "UNKNOWN"],
    ["null", null],
    ["undefined", undefined],
  ])("rejects %s", (_label, value) => {
    expect(isSdkError(value)).toBe(false);
  });

  it("recognises errors from another copy of sdk-core, where instanceof fails", async () => {
    vi.resetModules();
    const copy = await import("./sdk-error.js");
    const error = new copy.SdkError("UNKNOWN", "From another copy.");

    expect(error).not.toBeInstanceOf(SdkError);
    expect(isSdkError(error)).toBe(true);
  });

  it("recognises branded errors from another realm", () => {
    const error = runInNewContext(`
      class ForeignError extends Error {
        constructor() {
          super("From another realm.");
          this.code = "UNKNOWN";
        }
      }
      Object.defineProperty(ForeignError.prototype, Symbol.for("@hussmartinez/sdk-core/SdkError"), {
        value: true,
      });
      new ForeignError();
    `);

    expect(error).not.toBeInstanceOf(Error);
    expect(isSdkError(error)).toBe(true);
  });
});
