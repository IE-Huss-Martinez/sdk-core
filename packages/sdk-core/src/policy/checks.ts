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
 * Returns a signal that aborts when the caller's signal does, or when
 * `maxProcessingTime` has passed. Pass it to a worker call: it then rejects
 * with the policy's `PROCESSING_TIME_EXCEEDED` error, whose `details` name
 * the limit (ADR 0020). Create one per operation; the time starts now.
 *
 * @param policy - A resolved policy that includes the core limits.
 * @param signal - The caller's signal, if any.
 * @throws With code `UNSUPPORTED_ENVIRONMENT` if the browser lacks
 *   `AbortSignal.any` (ADR 0013).
 * @public
 */
export function processingSignal(
  policy: FilePolicy<CoreLimits>,
  signal?: AbortSignal,
): AbortSignal {
  if (typeof AbortSignal.any !== "function") {
    throw new SdkError("UNSUPPORTED_ENVIRONMENT", "This browser doesn't support AbortSignal.any.", {
      details: { feature: "AbortSignal.any" },
    });
  }
  const { maximum } = policy.limits.maxProcessingTime;
  if (maximum === Number.POSITIVE_INFINITY) {
    return signal ?? new AbortController().signal;
  }

  const controller = new AbortController();
  const started = Date.now();
  const timer = setTimeout(() => {
    controller.abort(policy.error("maxProcessingTime", Math.max(maximum, Date.now() - started)));
  }, maximum);
  const stop = () => clearTimeout(timer);
  signal?.addEventListener("abort", stop, { once: true });
  controller.signal.addEventListener("abort", stop, { once: true });
  return signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
}
