import { describe, expect, expectTypeOf, it } from "vitest";
import { createErrorHelpers, type ErrorHelpers } from "./helpers.js";
import { isSdkError, type SdkCoreErrorCode, SdkError } from "./sdk-error.js";

type AudioErrorCode = SdkCoreErrorCode | "UNSUPPORTED_FORMAT";

class AudioError extends SdkError<AudioErrorCode> {
  override readonly name = "AudioError";
}

const { adapt, abortError, throwIfAborted } = createErrorHelpers(AudioError, {
  fallbackCode: "UNKNOWN",
  fallbackMessage: "Audio processing failed.",
});

/** An aborted signal with the given reason. */
function aborted(reason?: unknown): AbortSignal {
  const controller = new AbortController();
  controller.abort(reason);
  return controller.signal;
}

describe("createErrorHelpers", () => {
  describe("adapt", () => {
    it("returns the SDK's own error as it is", () => {
      const error = new AudioError("UNSUPPORTED_FORMAT", "Not audio.");

      expect(adapt(error)).toBe(error);
    });

    it("keeps another SdkError's code, message and details, with it as cause", () => {
      const original = new SdkError("FILE_TOO_LARGE", "Too large.", {
        details: { limit: "maxFileSize", maximum: 10, actual: 11, unit: "bytes" },
      });

      const adapted = adapt(original);

      expect(adapted).toBeInstanceOf(AudioError);
      expect(adapted).toMatchObject({
        name: "AudioError",
        code: "FILE_TOO_LARGE",
        message: "Too large.",
        details: { limit: "maxFileSize", maximum: 10, actual: 11, unit: "bytes" },
        cause: original,
      });
    });

    it("doesn't add details that the original doesn't have", () => {
      expect(adapt(new SdkError("WORKER_CRASHED", "Crashed."))).not.toHaveProperty("details");
    });

    it("keeps codes from another SDK's class", () => {
      class PdfError extends SdkError<"INVALID_PDF"> {}

      expect(adapt(new PdfError("INVALID_PDF", "Broken.")).code).toBe("INVALID_PDF");
    });

    it("gives anything else the fallback code and message, with it as cause", () => {
      const thrown = new TypeError("boom");

      expect(adapt(thrown)).toMatchObject({
        code: "UNKNOWN",
        message: "Audio processing failed.",
        cause: thrown,
      });
      expect(adapt("text", "Decoding failed.")).toMatchObject({
        code: "UNKNOWN",
        message: "Decoding failed.",
        cause: "text",
      });
    });

    it("recognises an SdkError from another copy of sdk-core by its brand", () => {
      const foreign = new SdkError("ABORTED", "Stopped.");
      const lookalike = Object.assign(Object.create(Error.prototype), {
        code: foreign.code,
        message: foreign.message,
        [Symbol.for("@hussmartinez/sdk-core/SdkError")]: true,
      });

      expect(isSdkError(lookalike)).toBe(true);
      expect(adapt(lookalike)).toMatchObject({ code: "ABORTED", cause: lookalike });
    });
  });

  describe("abortError", () => {
    it("passes an SdkError reason through with its code, as the SDK's error", () => {
      const reason = new SdkError("PROCESSING_TIME_EXCEEDED", "Too slow.", {
        details: { limit: "maxProcessingTime", maximum: 1000, unit: "milliseconds" },
      });

      const error = abortError(aborted(reason));

      expect(error).toBeInstanceOf(AudioError);
      expect(error).toMatchObject({
        code: "PROCESSING_TIME_EXCEEDED",
        details: { limit: "maxProcessingTime", maximum: 1000, unit: "milliseconds" },
        cause: reason,
      });
    });

    it("returns the SDK's own error reason as it is", () => {
      const reason = new AudioError("UNSUPPORTED_FORMAT", "Not audio.");

      expect(abortError(aborted(reason))).toBe(reason);
    });

    it("makes a TimeoutError TIMEOUT, with the reason as cause", () => {
      const reason = new DOMException("Timed out.", "TimeoutError");

      expect(abortError(aborted(reason))).toMatchObject({ code: "TIMEOUT", cause: reason });
    });

    it("recognises a TimeoutError by name, as from another realm", () => {
      const reason = { name: "TimeoutError", message: "Timed out." };

      expect(abortError(aborted(reason)).code).toBe("TIMEOUT");
    });

    it("makes any other reason ABORTED, with the reason as cause", () => {
      const signal = aborted();

      expect(abortError(signal)).toMatchObject({ code: "ABORTED", cause: signal.reason });
      expect(signal.reason).toMatchObject({ name: "AbortError" });
      expect(abortError(aborted("stop"))).toMatchObject({ code: "ABORTED", cause: "stop" });
      expect(abortError(aborted(null))).toMatchObject({ code: "ABORTED", cause: null });
    });
  });

  describe("throwIfAborted", () => {
    it("does nothing without a signal, or before it aborts", () => {
      expect(() => throwIfAborted(undefined)).not.toThrow();
      expect(() => throwIfAborted(new AbortController().signal)).not.toThrow();
    });

    it("throws the abort error once the signal has aborted", () => {
      const reason = new DOMException("Timed out.", "TimeoutError");

      expect(() => throwIfAborted(aborted(reason))).toThrow(
        expect.objectContaining({ code: "TIMEOUT", cause: reason }),
      );
    });
  });

  describe("types", () => {
    it("returns the SDK's error class", () => {
      expectTypeOf(adapt).returns.toEqualTypeOf<AudioError>();
      expectTypeOf(
        createErrorHelpers(AudioError, { fallbackCode: "UNKNOWN", fallbackMessage: "" }),
      ).toEqualTypeOf<ErrorHelpers<AudioError>>();
    });

    it("takes only the class's codes as the fallback", () => {
      // @ts-expect-error: not one of AudioError's codes.
      createErrorHelpers(AudioError, { fallbackCode: "INVALID_PDF", fallbackMessage: "" });
    });

    it("requires a class whose codes include ABORTED and TIMEOUT", () => {
      class NarrowError extends SdkError<"ONLY"> {}

      // @ts-expect-error: NarrowError can't carry ABORTED or TIMEOUT.
      createErrorHelpers(NarrowError, { fallbackCode: "ONLY", fallbackMessage: "" });
    });
  });
});
