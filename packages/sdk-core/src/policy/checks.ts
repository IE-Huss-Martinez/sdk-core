import { SdkError } from "../errors/sdk-error.js";
import type { CoreLimits, FilePolicy, LimitCheck } from "./limits.js";

/**
 * Checks one file's size against `maxFileSize`, before reading it.
 *
 * @param policy - A resolved policy that includes the core limits.
 * @param file - The file, or any `Blob`.
 * @returns `"warning"` when the file is large but allowed.
 * @throws With code `FILE_TOO_LARGE` when it's over the maximum.
 * @public
 */
export function checkFile(policy: FilePolicy<CoreLimits>, file: Blob): LimitCheck {
  return policy.check("maxFileSize", file.size);
}

/**
 * Checks a selection of files: their number against `maxFiles`, then each
 * size against `maxFileSize`, before reading any of them.
 *
 * @param policy - A resolved policy that includes the core limits.
 * @param files - The files, such as an input's `FileList`.
 * @returns `"warning"` when any check warns.
 * @throws With code `TOO_MANY_FILES` or `FILE_TOO_LARGE`.
 * @public
 */
export function checkFiles(
  policy: FilePolicy<CoreLimits>,
  files: ArrayLike<Blob> | Iterable<Blob>,
): LimitCheck {
  const list = Array.from(files);
  let result = policy.check("maxFiles", list.length);
  for (const file of list) {
    result = checkFile(policy, file) ?? result;
  }
  return result;
}

/**
 * Tracks the decoded size of a file while it's decompressed, so that a
 * decompression bomb fails as soon as it passes `maxDecodedSize`, not after
 * it has filled memory (ADR 0012).
 *
 * @public
 */
export interface DecodedSizeBudget {
  /** The bytes counted so far. */
  readonly total: number;
  /**
   * Counts more decoded bytes.
   *
   * @param bytes - The size of the next decoded chunk.
   * @returns `"warning"` when the total reaches the warning threshold.
   * @throws With code `DECODED_SIZE_TOO_LARGE` when the total is over the maximum.
   */
  add(bytes: number): LimitCheck;
}

/**
 * Starts a {@link DecodedSizeBudget} for one file. Use it in the worker,
 * where decoding happens.
 *
 * @param policy - A resolved policy that includes the core limits.
 * @public
 */
export function createDecodedSizeBudget(policy: FilePolicy<CoreLimits>): DecodedSizeBudget {
  let total = 0;
  return {
    get total() {
      return total;
    },
    add(bytes) {
      if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0) {
        throw new RangeError(
          `Decoded chunk sizes must be non-negative numbers, received ${bytes}.`,
        );
      }
      total += bytes;
      return policy.check("maxDecodedSize", total);
    },
  };
}

/**
 * Options for {@link withProcessingTime}.
 *
 * @public
 */
export interface WithProcessingTimeOptions {
  /** The caller's signal. Aborting it aborts the operation with its own reason. */
  readonly signal?: AbortSignal;
}

/**
 * Runs one operation under `maxProcessingTime` (ADR 0020). The operation
 * receives a signal that aborts when the caller's signal does, or when the
 * time is up. Pass it to the worker call, which then rejects with the
 * policy's `PROCESSING_TIME_EXCEEDED` error, whose `details` name the limit.
 *
 * The time starts when the operation starts. When it settles, whether it
 * succeeds, fails or is aborted, the timer is cleared. The caller's signal
 * gets no listeners, so a long-lived signal can be reused for any number of
 * operations.
 *
 * @example
 * ```ts
 * const bitmap = await withProcessingTime(
 *   policy,
 *   (signal) => client.call("render", input, { signal }),
 *   { signal: callerSignal },
 * );
 * ```
 *
 * @param policy - A resolved policy that includes the core limits.
 * @param operation - The work, given the combined signal.
 * @param options - The caller's signal.
 * @returns The operation's result.
 * @throws Whatever the operation throws, or, when `AbortSignal.any` is
 *   missing, an error with code `UNSUPPORTED_ENVIRONMENT` (ADR 0013).
 * @public
 */
export async function withProcessingTime<Result>(
  policy: FilePolicy<CoreLimits>,
  operation: (signal: AbortSignal) => Result | PromiseLike<Result>,
  options: WithProcessingTimeOptions = {},
): Promise<Result> {
  if (typeof AbortSignal.any !== "function") {
    throw new SdkError("UNSUPPORTED_ENVIRONMENT", "This browser doesn't support AbortSignal.any.", {
      details: { feature: "AbortSignal.any" },
    });
  }
  const { signal } = options;
  const { maximum } = policy.limits.maxProcessingTime;
  if (maximum === Number.POSITIVE_INFINITY) {
    return operation(signal ?? new AbortController().signal);
  }

  const timeLimit = new AbortController();
  const started = Date.now();
  const timer = setTimeout(() => {
    timeLimit.abort(policy.error("maxProcessingTime", Math.max(maximum, Date.now() - started)));
  }, maximum);
  try {
    return await operation(signal ? AbortSignal.any([signal, timeLimit.signal]) : timeLimit.signal);
  } finally {
    clearTimeout(timer);
  }
}
