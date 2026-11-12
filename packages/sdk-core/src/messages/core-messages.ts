import type { SdkCoreErrorCode } from "../errors/sdk-error.js";
import type { CoreLimits } from "../policy/limits.js";
import { defineMessages, plural } from "./messages.js";
import type { MessageValue } from "./types.js";

/**
 * English text for sdk-core's own error codes and the core limits' warnings.
 * Every SDK spreads it into its catalogue, so `messages.error()` can describe
 * worker failures and policy violations, and so `errors.UNKNOWN` exists as
 * the fallback for any other error. Limit messages take the error's
 * `details` (`maximum`, `actual`) as parameters.
 *
 * @example
 * ```ts
 * export const en = defineMessages({ ...sdkCoreMessages, "toolbar.rotate": "Rotate" });
 * ```
 *
 * @public
 */
// Pure annotations let bundlers that don't analyse function bodies, such as
// esbuild and Terser, drop the catalogue from bundles that don't use it.
export const sdkCoreMessages = /* @__PURE__ */ defineMessages({
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
  "errors.UNSUPPORTED_ENVIRONMENT":
    "This browser doesn't support a feature this tool needs. Update your browser, or try another one.",
  "errors.FILE_TOO_LARGE":
    "This file is {actual, fileSize}, which is over the {maximum, fileSize} limit.",
  "errors.TOO_MANY_FILES": /* @__PURE__ */ plural("maximum", {
    one: "You can add {maximum} file at a time.",
    other: "You can add up to {maximum} files at a time.",
  }),
  "errors.DECODED_SIZE_TOO_LARGE":
    "This file expands to more than {maximum, fileSize} when opened, which is over the limit.",
  "errors.PROCESSING_TIME_EXCEEDED": "Processing this file took too long and was stopped.",
  "warnings.maxFileSize": "This file is {actual, fileSize}. Large files may be slow to process.",
  "warnings.maxFiles": "Adding {actual} files at once may be slow.",
  "warnings.maxDecodedSize": "This file is very large once opened and may be slow to process.",
  "warnings.maxProcessingTime": "This is taking longer than usual.",
  // Keyboard shortcut labels (ADR 0030), from the shortcut registry's describe().
  "keys.control": "Ctrl",
  "keys.alt": "Alt",
  "keys.shift": "Shift",
  "keys.meta": "Meta",
  "keys.apple.control": "⌃",
  "keys.apple.alt": "⌥",
  "keys.apple.shift": "⇧",
  "keys.apple.meta": "⌘",
  "keys.space": "Space",
  "keys.enter": "Enter",
  "keys.escape": "Esc",
  "keys.tab": "Tab",
  "keys.delete": "Delete",
  "keys.backspace": "Backspace",
  "keys.arrowUp": "↑",
  "keys.arrowDown": "↓",
  "keys.arrowLeft": "←",
  "keys.arrowRight": "→",
  "keys.home": "Home",
  "keys.end": "End",
  "keys.pageUp": "Page Up",
  "keys.pageDown": "Page Down",
}) satisfies Record<`errors.${SdkCoreErrorCode}`, MessageValue> &
  Record<`warnings.${keyof CoreLimits}`, MessageValue>;
