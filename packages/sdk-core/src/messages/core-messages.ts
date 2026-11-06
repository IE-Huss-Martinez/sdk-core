import type { SdkCoreErrorCode } from "../errors/sdk-error.js";
import { defineMessages } from "./messages.js";

/**
 * English text for sdk-core's own error codes. Every SDK spreads it into its
 * catalogue, so `messages.error()` can describe worker failures, and so
 * `errors.UNKNOWN` exists as the fallback for any other error.
 *
 * @example
 * ```ts
 * export const en = defineMessages({ ...sdkCoreMessages, "toolbar.rotate": "Rotate" });
 * ```
 *
 * @public
 */
export const sdkCoreMessages = defineMessages({
  "errors.UNKNOWN": "Something went wrong. Please try again.",
  "errors.ABORTED": "The operation was cancelled.",
  "errors.TIMEOUT": "The operation took too long and was stopped.",
  "errors.WORKER_START_FAILED": "The file processor couldn't start. Reload the page and try again.",
  "errors.WORKER_PROTOCOL_MISMATCH":
    "The file processor is out of date. Reload the page to update it.",
  "errors.WORKER_CRASHED": "The file processor stopped unexpectedly. Please try again.",
  "errors.WORKER_TERMINATED": "The operation was stopped before it finished. Please try again.",
  "errors.WORKER_METHOD_NOT_FOUND":
    "This operation isn't available. Reload the page and try again.",
  "errors.WORKER_DATA_NOT_CLONEABLE":
    "Something went wrong while processing the file. Please try again.",
}) satisfies Record<`errors.${SdkCoreErrorCode}`, string>;
