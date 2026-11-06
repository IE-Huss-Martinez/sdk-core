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
 * Error codes defined by sdk-core itself.
 *
 * - `UNKNOWN`: something that isn't an {@link SdkError} was thrown, or a
 *   serialized error couldn't be read.
 *
 * @public
 */
export type SdkCoreErrorCode = "UNKNOWN";

/**
 * Marks SdkError instances across realms and across copies of sdk-core, where
 * `instanceof` fails. `Symbol.for` returns the same symbol in every realm.
 */
const BRAND = Symbol.for("@hussmartinez/sdk-core/SdkError");

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
    this.code = code;
    if (options.details !== undefined) {
      this.details = options.details;
    }
  }
}

Object.defineProperty(SdkError.prototype, BRAND, { value: true });

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
