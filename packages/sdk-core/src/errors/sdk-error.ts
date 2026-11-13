import { checkSingleCopy } from "../internal/single-copy.js";

/**
 * A value that survives `structuredClone` and `JSON.stringify` unchanged.
 *
 * @public
 */
export type ErrorDetailValue =
  | string
  | number
  | boolean
  | null
  | readonly ErrorDetailValue[]
  | { readonly [key: string]: ErrorDetailValue };

/**
 * Structured, serialisable facts about an error, such as the limit that was
 * exceeded. Details are for programs and logs; user-facing text comes from
 * the messages catalogue, looked up by code (ADR 0014).
 *
 * @public
 */
export type ErrorDetails = { readonly [key: string]: ErrorDetailValue };

/**
 * Options for {@link SdkError}.
 *
 * @public
 */
export interface SdkErrorOptions {
  /** Structured facts about the error. */
  readonly details?: ErrorDetails;
  /** The error that caused this one, as in the standard `Error` option. */
  readonly cause?: unknown;
}

/**
 * The constructor signature every {@link SdkError} subclass keeps, so that
 * {@link deserializeError} can rebuild it.
 *
 * @public
 */
export type SdkErrorClass = new (
  // `never` accepts every subclass, whatever codes it narrows to.
  code: never,
  message: string,
  options?: SdkErrorOptions,
) => SdkError;

/**
 * Error codes defined by sdk-core itself. They're stable: a code never
 * changes meaning once released.
 *
 * - `UNKNOWN`: something that isn't an {@link SdkError} was thrown, or a
 *   serialized error couldn't be read.
 * - `ABORTED`: a worker call's `AbortSignal` was aborted.
 * - `TIMEOUT`: a worker call's signal was aborted by a timeout, such as
 *   `AbortSignal.timeout()`.
 * - `WORKER_START_FAILED`: the worker couldn't be created or loaded, didn't
 *   announce itself within the start timeout, or announced a package version
 *   other than the client's `packageVersion`, with `details` of
 *   `{ asset, expected, actual }`.
 * - `WORKER_PROTOCOL_MISMATCH`: the page and the worker use different
 *   versions of the worker protocol, usually from mismatched builds.
 * - `WORKER_CRASHED`: an error escaped the worker's handlers, or a message
 *   couldn't be read. The worker is replaced on the next call.
 * - `WORKER_TERMINATED`: the worker was terminated while the call was in
 *   flight, because another call had to be stopped or the client was
 *   destroyed. Calls aren't retried automatically.
 * - `WORKER_METHOD_NOT_FOUND`: the worker doesn't implement the method.
 * - `WORKER_DATA_NOT_CLONEABLE`: a call's input or result can't be sent
 *   across the worker boundary, for example because it contains a function.
 *   The `cause` is the original exception, and `details.method` names the
 *   method.
 * - `UNSUPPORTED_ENVIRONMENT`: the browser lacks a feature the SDK needs.
 *   `details.feature` names it (ADR 0013).
 * - `FILE_TOO_LARGE`, `TOO_MANY_FILES`, `DECODED_SIZE_TOO_LARGE` and
 *   `PROCESSING_TIME_EXCEEDED`: a file policy limit was exceeded. `details`
 *   names the `limit`, its `maximum`, the `actual` value and the `unit`
 *   (ADR 0020).
 *
 * @public
 */
export type SdkCoreErrorCode =
  | "UNKNOWN"
  | "ABORTED"
  | "TIMEOUT"
  | "WORKER_START_FAILED"
  | "WORKER_PROTOCOL_MISMATCH"
  | "WORKER_CRASHED"
  | "WORKER_TERMINATED"
  | "WORKER_METHOD_NOT_FOUND"
  | "WORKER_DATA_NOT_CLONEABLE"
  | "UNSUPPORTED_ENVIRONMENT"
  | "FILE_TOO_LARGE"
  | "TOO_MANY_FILES"
  | "DECODED_SIZE_TOO_LARGE"
  | "PROCESSING_TIME_EXCEEDED";

/**
 * Marks SdkError instances across realms and across copies of sdk-core, where
 * `instanceof` fails. `Symbol.for` returns the same symbol in every realm.
 */
const BRAND = /* @__PURE__ */ Symbol.for("@hussmartinez/sdk-core/SdkError");

/**
 * Base class for every error the SDK family throws (ADR 0008).
 *
 * Each SDK defines one subclass that narrows `code` to its own codes and sets
 * `name`. Subclasses must keep this constructor's signature, so errors can be
 * rebuilt after crossing a worker boundary.
 *
 * @example
 * ```ts
 * type PdfErrorCode = "FILE_TOO_LARGE" | "PDF_ENCRYPTED";
 *
 * class PdfError extends SdkError<PdfErrorCode> {
 *   override readonly name = "PdfError";
 * }
 *
 * throw new PdfError("FILE_TOO_LARGE", "The file exceeds the size limit.", {
 *   details: { limit: 52_428_800, size: 73_400_320 },
 * });
 * ```
 *
 * @typeParam Code - The error codes this class can carry.
 * @public
 */
export class SdkError<Code extends string = string> extends Error {
  /** The class name, which subclasses override. Survives minification. */
  override readonly name: string = "SdkError";

  /**
   * A stable `SCREAMING_SNAKE_CASE` code. Programs branch on it, and user
   * interfaces look up their text by it. Codes never change once released.
   */
  readonly code: Code;

  /**
   * Structured facts about the error, if any. Declared rather than
   * initialised, so errors without details have no `details` property.
   */
  declare readonly details?: ErrorDetails;

  /**
   * @param code - A stable error code.
   * @param message - A developer-facing description. Never shown to users.
   * @param options - Details and cause.
   */
  constructor(code: Code, message: string, options: SdkErrorOptions = {}) {
    super(message, "cause" in options ? { cause: options.cause } : undefined);
    checkSingleCopy();
    this.code = code;
    // Set on each instance rather than once on the prototype: a module-scope
    // Object.defineProperty is a side effect that would keep this class in
    // every bundle that imports anything from sdk-core.
    Object.defineProperty(this, BRAND, { value: true });
    if (options.details !== undefined) {
      this.details = options.details;
    }
  }
}

/**
 * Checks whether a value is an {@link SdkError}, optionally with a given code.
 *
 * Works across realms and across duplicate copies of sdk-core, where
 * `instanceof` fails, by checking a shared brand. Errors that crossed a worker
 * boundary are only recognised after {@link deserializeError}, because
 * `structuredClone` drops the code.
 *
 * @example
 * ```ts
 * if (isSdkError(error, "FILE_TOO_LARGE")) {
 *   showLimit(error.details);
 * }
 * ```
 *
 * @param value - Any thrown value.
 * @param code - When given, the error must also have this code.
 * @public
 */
export function isSdkError<Code extends string = string>(
  value: unknown,
  code?: Code,
): value is SdkError<Code> {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as { [BRAND]?: unknown; code?: unknown; message?: unknown };
  const isBranded = value instanceof SdkError || candidate[BRAND] === true;
  return (
    isBranded &&
    typeof candidate.code === "string" &&
    typeof candidate.message === "string" &&
    (code === undefined || candidate.code === code)
  );
}
