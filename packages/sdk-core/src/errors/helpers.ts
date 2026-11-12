import { isSdkError, type SdkError, type SdkErrorOptions } from "./sdk-error.js";

/**
 * Options for {@link createErrorHelpers}.
 *
 * @typeParam Code - The error class's codes.
 * @public
 */
export interface ErrorHelpersOptions<Code extends string> {
  /** The code for failures that aren't an `SdkError`, such as `"UNKNOWN"` or `"PROCESSING_FAILED"`. */
  readonly fallbackCode: Code;
  /** The developer-facing message for those failures, unless a call gives its own. */
  readonly fallbackMessage: string;
}

/**
 * Helpers that turn any failure into an SDK's own error class, from
 * {@link createErrorHelpers}.
 *
 * @typeParam ErrorType - The SDK's error class.
 * @public
 */
export interface ErrorHelpers<ErrorType extends SdkError> {
  /**
   * Makes any failure the SDK's error, as every port promises:
   *
   * - the SDK's error is returned as it is;
   * - another `SdkError`, such as the worker client's `ABORTED` or
   *   `WORKER_CRASHED`, keeps its code, message and details;
   * - anything else gets the fallback code.
   *
   * The original is kept as `cause`, except when it's returned as it is.
   *
   * @param reason - Anything thrown or rejected.
   * @param message - The message for a failure that isn't an `SdkError`,
   *   instead of the fallback message.
   */
  adapt(reason: unknown, message?: string): ErrorType;
  /**
   * The error an aborted operation rejects with, as the worker client does
   * (ADR 0018, ADR 0020): the signal's reason when it's an `SdkError`, such as
   * a file policy's `PROCESSING_TIME_EXCEEDED`, adapted as {@link ErrorHelpers.adapt}
   * does; `TIMEOUT` when the reason is a `TimeoutError`, such as from
   * `AbortSignal.timeout()`; and `ABORTED` otherwise, with the reason as
   * `cause`.
   *
   * @param signal - An aborted signal.
   */
  abortError(signal: AbortSignal): ErrorType;
  /**
   * Throws {@link ErrorHelpers.abortError} if the signal has been aborted.
   *
   * @param signal - The operation's signal, if it has one.
   */
  throwIfAborted(signal: AbortSignal | undefined): void;
}

/**
 * Creates the {@link ErrorHelpers} for an SDK's error class, so every SDK
 * adapts failures and aborts the same way.
 *
 * The class's codes must include sdk-core's `ABORTED` and `TIMEOUT`, as every
 * SDK's codes do by including `SdkCoreErrorCode`.
 *
 * @example
 * ```ts
 * export const {
 *   adapt: asAudioError,
 *   abortError,
 *   throwIfAborted,
 * } = createErrorHelpers(AudioError, {
 *   fallbackCode: "UNKNOWN",
 *   fallbackMessage: "Audio processing failed.",
 * });
 * ```
 *
 * @param errorClass - The SDK's subclass of `SdkError`.
 * @param options - The code and message for failures that aren't an `SdkError`.
 * @public
 */
export function createErrorHelpers<Code extends string, ErrorType extends SdkError<Code>>(
  errorClass: new (code: Code, message: string, options?: SdkErrorOptions) => ErrorType,
  // NoInfer: the codes come from the class, not from `fallbackCode`.
  options: ErrorHelpersOptions<NoInfer<Code>> &
    ("ABORTED" | "TIMEOUT" extends Code
      ? unknown
      : { readonly fallbackCode: "The error class's codes must include ABORTED and TIMEOUT." }),
): ErrorHelpers<ErrorType> {
  const { fallbackCode, fallbackMessage } = options;
  // Another SDK's codes aren't in this class's union, but are kept as they are.
  const create = (code: string, message: string, errorOptions: SdkErrorOptions) =>
    new errorClass(code as Code, message, errorOptions);

  const helpers: ErrorHelpers<ErrorType> = {
    adapt(reason, message = fallbackMessage) {
      if (reason instanceof errorClass) {
        return reason;
      }
      if (isSdkError(reason)) {
        return create(reason.code, reason.message, {
          ...(reason.details === undefined ? {} : { details: reason.details }),
          cause: reason,
        });
      }
      return create(fallbackCode, message, { cause: reason });
    },

    abortError(signal) {
      const { reason } = signal;
      if (isSdkError(reason)) {
        return helpers.adapt(reason);
      }
      // By name rather than `instanceof DOMException`, which fails for a
      // reason from another realm, such as an iframe.
      const timedOut =
        typeof reason === "object" &&
        reason !== null &&
        (reason as { name?: unknown }).name === "TimeoutError";
      return create(
        timedOut ? "TIMEOUT" : "ABORTED",
        timedOut ? "The operation timed out." : "The operation was cancelled.",
        { cause: reason },
      );
    },

    throwIfAborted(signal) {
      if (signal?.aborted) {
        throw helpers.abortError(signal);
      }
    },
  };
  return helpers;
}
