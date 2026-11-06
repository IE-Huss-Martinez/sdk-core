import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { isSdkError, SdkError } from "../errors/sdk-error.js";
import { sdkCoreMessages } from "../messages/core-messages.js";
import { createMessages } from "../messages/messages.js";
import { checkFile, checkFiles, createDecodedSizeBudget, withProcessingTime } from "./checks.js";
import { coreLimits, defineLimits, type FilePolicy } from "./limits.js";

type PdfErrorCode = "TOO_MANY_PAGES" | (typeof coreLimits)[keyof typeof coreLimits]["code"];

class PdfError extends SdkError<PdfErrorCode> {
  override readonly name = "PdfError";
}

const pdfLimits = defineLimits(
  {
    ...coreLimits,
    maxPages: { code: "TOO_MANY_PAGES", unit: "count", default: 2_000, warning: 500 },
  },
  { errorClass: PdfError },
);

/** Settles only when the signal aborts, like a cooperative worker call. */
function untilAborted(signal: AbortSignal): Promise<never> {
  return new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
}

function thrown(action: () => unknown): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }
  throw new Error("Expected it to throw.");
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("defineLimits", () => {
  it("resolves the safe defaults", () => {
    expect(pdfLimits.resolve().limits).toEqual({
      maxFileSize: { maximum: 100_000_000, warning: 50_000_000 },
      maxFiles: { maximum: 20, warning: Number.POSITIVE_INFINITY },
      maxDecodedSize: { maximum: 500_000_000, warning: Number.POSITIVE_INFINITY },
      maxProcessingTime: { maximum: 120_000, warning: Number.POSITIVE_INFINITY },
      maxPages: { maximum: 2_000, warning: 500 },
    });
  });

  it("applies a host's settings, as a number or as { maximum, warning }", () => {
    const policy = pdfLimits.resolve({ maxFileSize: 300_000_000, maxPages: { warning: 100 } });

    expect(policy.limits.maxFileSize).toEqual({ maximum: 300_000_000, warning: 50_000_000 });
    expect(policy.limits.maxPages).toEqual({ maximum: 2_000, warning: 100 });
  });

  describe("check", () => {
    const policy = pdfLimits.resolve();

    it("accepts values up to the maximum, and warns from the threshold", () => {
      expect(policy.check("maxPages", 499)).toBeUndefined();
      expect(policy.check("maxPages", 500)).toBe("warning");
      expect(policy.check("maxPages", 2_000)).toBe("warning");
    });

    it("throws the SDK's error class above the maximum, with details naming the limit", () => {
      const error = thrown(() => policy.check("maxPages", 2_412));

      expect(error).toBeInstanceOf(PdfError);
      expect(error).toMatchObject({
        code: "TOO_MANY_PAGES",
        details: { limit: "maxPages", maximum: 2_000, actual: 2_412, unit: "count" },
      });
    });

    it("throws SdkError when no error class is given", () => {
      const error = thrown(() => defineLimits(coreLimits).resolve().check("maxFiles", 21));

      expect(error).toBeInstanceOf(SdkError);
      expect(isSdkError(error, "TOO_MANY_FILES")).toBe(true);
    });

    it.each([Number.NaN, -1, "10" as unknown as number])(
      "rejects the measured value %j",
      (actual) => {
        expect(() => policy.check("maxPages", actual)).toThrow(RangeError);
      },
    );

    it("rejects unknown limits, including prototype keys", () => {
      const check = policy.check as (limit: string, actual: number) => unknown;

      expect(() => check("maxBananas", 1)).toThrow(TypeError);
      expect(() => check("constructor", 1)).toThrow(TypeError);
    });

    it("builds the same error with policy.error", () => {
      expect(policy.error("maxPages", 3_000)).toMatchObject({
        code: "TOO_MANY_PAGES",
        details: { limit: "maxPages", maximum: 2_000, actual: 3_000 },
      });
    });
  });

  describe("Infinity", () => {
    it("disables a maximum", () => {
      const policy = pdfLimits.resolve({ maxPages: Number.POSITIVE_INFINITY });
      expect(policy.check("maxPages", 1e12)).toBe("warning");
    });

    it("disables a warning", () => {
      const policy = pdfLimits.resolve({ maxPages: { warning: Number.POSITIVE_INFINITY } });
      expect(policy.check("maxPages", 1_999)).toBeUndefined();
    });
  });

  describe("untrusted settings", () => {
    const resolve = pdfLimits.resolve as (overrides: unknown) => unknown;

    it.each([0, -1, Number.NaN, "100", null])("rejects the value %j", (value) => {
      expect(() => resolve({ maxFileSize: value })).toThrow(
        typeof value === "number" ? RangeError : TypeError,
      );
      expect(() => resolve({ maxFileSize: { warning: value } })).toThrow(RangeError);
    });

    it("rejects unknown limits, so that a typo can't leave a default in place", () => {
      expect(() => resolve({ maxFilesize: 1 })).toThrow(/"maxFilesize" isn't a file policy limit/);
      expect(() => resolve({ __proto__: 1 })).not.toThrow();
      expect(() => resolve(JSON.parse('{"__proto__": 1}'))).toThrow(TypeError);
    });

    it("rejects unknown keys in a setting", () => {
      expect(() => resolve({ maxFileSize: { max: 1 } })).toThrow(/unknown keys: max/);
    });

    it("rejects invalid defaults in the SDK's definitions", () => {
      expect(() => defineLimits({ maxThings: { code: "X", unit: "count", default: 0 } })).toThrow(
        RangeError,
      );
    });
  });

  it("types limit names and codes", () => {
    const policy = pdfLimits.resolve();
    // @ts-expect-error The SDK has no such limit.
    expect(() => policy.check("maxBananas", 1)).toThrow();
    // @ts-expect-error Settings must be numbers or { maximum, warning }.
    expect(() => pdfLimits.resolve({ maxPages: "lots" })).toThrow();
    expectTypeOf(policy.error("maxPages", 1).code).toEqualTypeOf<"TOO_MANY_PAGES">();
  });

  it("lets an SDK's policy be used where the core limits are expected", () => {
    expectTypeOf(pdfLimits.resolve()).toExtend<FilePolicy<typeof coreLimits>>();
  });
});

describe("checks", () => {
  const policy = pdfLimits.resolve({ maxFiles: 3 });
  const file = (size: number) => new Blob([new Uint8Array(size)]);

  it("checkFile checks the size before reading", () => {
    const small = pdfLimits.resolve({ maxFileSize: { maximum: 100, warning: 50 } });

    expect(checkFile(small, file(10))).toBeUndefined();
    expect(checkFile(small, file(60))).toBe("warning");
    expect(thrown(() => checkFile(small, file(101)))).toMatchObject({
      code: "FILE_TOO_LARGE",
      details: { actual: 101, maximum: 100, unit: "bytes" },
    });
  });

  it("checkFiles checks the count, then each size", () => {
    expect(checkFiles(policy, [file(1), file(1)])).toBeUndefined();
    expect(thrown(() => checkFiles(policy, [file(1), file(1), file(1), file(1)]))).toMatchObject({
      code: "TOO_MANY_FILES",
      details: { actual: 4, maximum: 3 },
    });
    const warnOnSize = pdfLimits.resolve({ maxFileSize: { warning: 5 } });
    expect(checkFiles(warnOnSize, [file(1), file(6), file(1)])).toBe("warning");
  });

  it("the decoded-size budget fails as soon as the total passes the maximum", () => {
    const budget = createDecodedSizeBudget(
      pdfLimits.resolve({ maxDecodedSize: { maximum: 1_000, warning: 800 } }),
    );

    expect(budget.add(500)).toBeUndefined();
    expect(budget.add(300)).toBe("warning");
    const error = thrown(() => budget.add(201));
    expect(error).toMatchObject({
      code: "DECODED_SIZE_TOO_LARGE",
      details: { actual: 1_001, maximum: 1_000 },
    });
    expect(budget.total).toBe(1_001);
    expect(() => budget.add(-1)).toThrow(RangeError);
  });

  describe("withProcessingTime", () => {
    const policy = pdfLimits.resolve({ maxProcessingTime: 1_000 });

    /** A caller signal whose listeners are counted. */
    function countedSignal() {
      const controller = new AbortController();
      const add = vi.spyOn(controller.signal, "addEventListener");
      const remove = vi.spyOn(controller.signal, "removeEventListener");
      return { controller, listeners: () => add.mock.calls.length - remove.mock.calls.length };
    }

    it("returns the result, and leaves no timer or listener after a fast success", async () => {
      vi.useFakeTimers();
      const caller = countedSignal();
      let received: AbortSignal | undefined;

      const result = await withProcessingTime(
        policy,
        async (signal) => {
          received = signal;
          return "done";
        },
        { signal: caller.controller.signal },
      );

      expect(result).toBe("done");
      expect(vi.getTimerCount()).toBe(0);
      expect(caller.listeners()).toBe(0);
      await vi.advanceTimersByTimeAsync(5_000);
      expect(received?.aborted).toBe(false);
    });

    it("cleans up after a failure, and rejects with the operation's error", async () => {
      vi.useFakeTimers();
      const caller = countedSignal();
      const failure = new Error("parser bug");

      await expect(
        withProcessingTime(policy, () => Promise.reject(failure), {
          signal: caller.controller.signal,
        }),
      ).rejects.toBe(failure);
      expect(vi.getTimerCount()).toBe(0);
      expect(caller.listeners()).toBe(0);
    });

    it("aborts a slow operation with PROCESSING_TIME_EXCEEDED", async () => {
      vi.useFakeTimers();
      const running = withProcessingTime(policy, (signal) => untilAborted(signal));
      const outcome = running.catch((error: unknown) => error);

      await vi.advanceTimersByTimeAsync(999);
      await vi.advanceTimersByTimeAsync(1);
      const error = await outcome;
      expect(error).toBeInstanceOf(PdfError);
      expect(error).toMatchObject({
        code: "PROCESSING_TIME_EXCEEDED",
        details: { limit: "maxProcessingTime", maximum: 1_000, unit: "milliseconds" },
      });
      expect((error as PdfError).details?.["actual"]).toBeGreaterThanOrEqual(1_000);
      expect(vi.getTimerCount()).toBe(0);
    });

    it("lets the caller's abort win, with its own reason", async () => {
      vi.useFakeTimers();
      const caller = countedSignal();
      const reason = new Error("User cancelled.");
      const running = withProcessingTime(policy, (signal) => untilAborted(signal), {
        signal: caller.controller.signal,
      });

      caller.controller.abort(reason);
      await expect(running).rejects.toBe(reason);
      expect(vi.getTimerCount()).toBe(0);
      expect(caller.listeners()).toBe(0);
    });

    it("starts the time when the operation starts", async () => {
      vi.useFakeTimers();
      await vi.advanceTimersByTimeAsync(10_000);
      const running = withProcessingTime(policy, (signal) => untilAborted(signal)).catch(
        (error: unknown) => error,
      );

      await vi.advanceTimersByTimeAsync(999);
      expect(vi.getTimerCount()).toBe(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(await running).toMatchObject({ code: "PROCESSING_TIME_EXCEEDED" });
    });

    it("passes the caller's signal and sets no timer when the limit is Infinity", async () => {
      vi.useFakeTimers();
      const unlimited = pdfLimits.resolve({ maxProcessingTime: Number.POSITIVE_INFINITY });
      const caller = new AbortController().signal;

      await expect(
        withProcessingTime(unlimited, (signal) => signal, { signal: caller }),
      ).resolves.toBe(caller);
      const own = await withProcessingTime(unlimited, (signal) => {
        expect(vi.getTimerCount()).toBe(0);
        return signal;
      });
      expect(own.aborted).toBe(false);
    });

    it("rejects with UNSUPPORTED_ENVIRONMENT without AbortSignal.any, before running anything", async () => {
      vi.stubGlobal("AbortSignal", { ...AbortSignal, any: undefined });
      const operation = vi.fn();

      await expect(withProcessingTime(pdfLimits.resolve(), operation)).rejects.toMatchObject({
        code: "UNSUPPORTED_ENVIRONMENT",
        details: { feature: "AbortSignal.any" },
      });
      expect(operation).not.toHaveBeenCalled();
    });
  });
});

describe("messages for the core limits", () => {
  const messages = createMessages(sdkCoreMessages);
  const policy = defineLimits(coreLimits).resolve({ maxFiles: 1 });

  it.each([
    [
      () => policy.check("maxFileSize", 150_000_000),
      "This file is 150 MB, which is over the 100 MB limit.",
    ],
    [() => policy.check("maxFiles", 2), "You can add 1 file at a time."],
    [
      () => defineLimits(coreLimits).resolve().check("maxFiles", 21),
      "You can add up to 20 files at a time.",
    ],
    [
      () => policy.check("maxDecodedSize", 600_000_000),
      "This file expands to more than 500 MB when opened, which is over the limit.",
    ],
  ])("describe each violation from its details", (action, text) => {
    expect(messages.error(thrown(action))).toBe(text);
  });

  it("describe the processing time limit and missing features", () => {
    expect(messages.error(policy.error("maxProcessingTime", 130_000))).toBe(
      "Processing this file took too long and was stopped.",
    );
    expect(messages.error(new SdkError("UNSUPPORTED_ENVIRONMENT", "x"))).toMatch(
      /^This browser doesn't support/,
    );
  });

  it("have warnings.<limit> text for each core limit", () => {
    expect(messages.t("warnings.maxFileSize", { actual: 60_000_000 })).toBe(
      "This file is 60 MB. Large files may be slow to process.",
    );
  });
});
