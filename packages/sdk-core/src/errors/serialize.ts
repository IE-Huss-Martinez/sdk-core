import {
  type ErrorDetails,
  type ErrorDetailValue,
  isSdkError,
  type SdkCoreErrorCode,
  SdkError,
  type SdkErrorClass,
  type SdkErrorOptions,
} from "./sdk-error.js";

/**
 * An error as plain data, safe to pass through `postMessage`,
 * `structuredClone` or `JSON.stringify`.
 *
 * Values that aren't {@link SdkError}s are serialized with the code
 * `UNKNOWN`. For those, `details.originalName` holds the original error name,
 * such as `TypeError`, and `details.thrownType` the `typeof` of a thrown
 * non-error value.
 *
 * @public
 */
export interface SerializedError {
  /** The error class name, such as `PdfError`, used to rebuild the class. */
  readonly name: string;
  /** The error code. */
  readonly code: string;
  /** The developer-facing message. */
  readonly message: string;
  /** Structured facts about the error. */
  readonly details?: ErrorDetails;
  /** The serialized cause, if any, up to the depth limit. */
  readonly cause?: SerializedError;
  /** The stack trace, only when serialized with `includeStack`. */
  readonly stack?: string;
}

/**
 * Options for {@link serializeError}.
 *
 * @public
 */
export interface SerializeErrorOptions {
  /**
   * Include stack traces. Defaults to `false`, so stacks don't cross the
   * worker boundary unless a development build asks for them.
   */
  readonly includeStack?: boolean;
  /**
   * How many levels of `cause` to keep below the error. Deeper causes, and
   * cycles, are dropped. Defaults to 8.
   */
  readonly maxDepth?: number;
}

/**
 * Options for {@link deserializeError}.
 *
 * @public
 */
export interface DeserializeErrorOptions {
  /**
   * SdkError subclasses to rebuild, keyed by their `name`, such as
   * `{ PdfError }`. Errors with other names are rebuilt as {@link SdkError}
   * and keep their transmitted name.
   */
  readonly errorClasses?: Readonly<Record<string, SdkErrorClass>>;
  /** How many levels of `cause` to rebuild. Defaults to 8. */
  readonly maxDepth?: number;
}

const DEFAULT_MAX_DEPTH = 8;
/** Bounds nesting inside `details`, so hostile input can't exhaust the stack. */
const MAX_DETAILS_DEPTH = 16;
const UNKNOWN: SdkCoreErrorCode = "UNKNOWN";

/**
 * Turns any thrown value into a {@link SerializedError}, for sending across
 * a worker boundary. Never throws for the value itself.
 *
 * - {@link SdkError}s keep their name, code, message and details.
 * - Other errors and thrown values get the code `UNKNOWN`.
 * - Causes are serialized recursively, up to `maxDepth`.
 * - Details are copied, keeping only JSON-compatible values.
 *
 * @param error - Any thrown value.
 * @param options - Stack and depth options.
 * @throws `RangeError` if `maxDepth` isn't a non-negative integer.
 * @public
 */
export function serializeError(
  error: unknown,
  options: SerializeErrorOptions = {},
): SerializedError {
  const includeStack = options.includeStack ?? false;
  const maxDepth = depthOption(options.maxDepth);
  const seen = new Set<unknown>();

  const serializeAt = (value: unknown, depth: number): SerializedError => {
    seen.add(value);
    const serialized: Mutable<SerializedError> = describe(value);
    const stack = includeStack && isObject(value) ? value.stack : undefined;
    if (typeof stack === "string") {
      serialized.stack = stack;
    }
    if (isObject(value) && "cause" in value && depth < maxDepth && !seen.has(value.cause)) {
      serialized.cause = serializeAt(value.cause, depth + 1);
    }
    return serialized;
  };

  return serializeAt(error, 0);
}

/**
 * Rebuilds an error serialized by {@link serializeError}. Registered
 * subclasses are rebuilt with their own class, so `instanceof` and
 * {@link isSdkError} work as before the boundary.
 *
 * The input is treated as untrusted: anything that isn't a valid serialized
 * error becomes an `UNKNOWN` {@link SdkError}, and details are sanitized
 * again. Never throws for the received data.
 *
 * @param data - A value received from another realm or worker.
 * @param options - Subclasses to rebuild, and the depth limit.
 * @throws `RangeError` if `maxDepth` isn't a non-negative integer.
 * @public
 */
export function deserializeError(data: unknown, options: DeserializeErrorOptions = {}): SdkError {
  const errorClasses = options.errorClasses ?? {};
  const maxDepth = depthOption(options.maxDepth);

  const deserializeAt = (value: unknown, depth: number): SdkError => {
    if (!isSerializedError(value)) {
      return new SdkError(UNKNOWN, "Received a value that isn't a serialized error.");
    }

    const errorOptions: Mutable<SdkErrorOptions> = {};
    const details = sanitizeDetails(value.details);
    if (details !== undefined) {
      errorOptions.details = details;
    }
    if (value.cause !== undefined && depth < maxDepth) {
      errorOptions.cause = deserializeAt(value.cause, depth + 1);
    }

    const ErrorClass = Object.hasOwn(errorClasses, value.name)
      ? errorClasses[value.name]
      : undefined;
    const error = construct(ErrorClass, value.code, value.message, errorOptions);
    if (error.name !== value.name) {
      redefine(error, "name", value.name);
    }
    if (typeof value.stack === "string") {
      redefine(error, "stack", value.stack);
    }
    return error;
  };

  return deserializeAt(data, 0);
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/** The error properties this module reads from values of unknown type. */
type ErrorLike = {
  readonly [K in "name" | "code" | "message" | "details" | "cause" | "stack"]?: unknown;
};

/**
 * @param value - The value to describe.
 * @returns The serialized error, without stack or cause.
 */
function describe(value: unknown): Mutable<SerializedError> {
  if (isSdkError(value)) {
    const serialized: Mutable<SerializedError> = {
      name: value.name,
      code: value.code,
      message: value.message,
    };
    const details = sanitizeDetails(value.details);
    if (details !== undefined) {
      serialized.details = details;
    }
    return serialized;
  }
  if (isObject(value) && typeof value.message === "string") {
    const originalName = typeof value.name === "string" ? value.name : "Error";
    return { name: "SdkError", code: UNKNOWN, message: value.message, details: { originalName } };
  }
  if (typeof value === "string") {
    return { name: "SdkError", code: UNKNOWN, message: value, details: { thrownType: "string" } };
  }
  return {
    name: "SdkError",
    code: UNKNOWN,
    message: "A value that isn't an Error was thrown.",
    details: { thrownType: value === null ? "null" : typeof value },
  };
}

/**
 * @param ErrorClass - The registered class, if any.
 * @param code - The error code.
 * @param message - The error message.
 * @param options - Details and cause.
 * @returns The rebuilt error. Falls back to SdkError if the class throws.
 */
function construct(
  ErrorClass: SdkErrorClass | undefined,
  code: string,
  message: string,
  options: SdkErrorOptions,
): SdkError {
  if (ErrorClass !== undefined) {
    try {
      const error = new ErrorClass(code as never, message, options);
      if (isSdkError(error)) {
        return error;
      }
    } catch {
      // A subclass that can't be rebuilt from its serialized form falls back to SdkError.
    }
  }
  return new SdkError(code, message, options);
}

/**
 * @param error - The error to change.
 * @param key - The property to replace.
 * @param value - The new value.
 */
function redefine(error: SdkError, key: "name" | "stack", value: string): void {
  Object.defineProperty(error, key, { value, writable: true, configurable: true });
}

/**
 * @param value - A received value.
 * @returns Whether the value has the shape of a serialized error.
 */
function isSerializedError(value: unknown): value is Omit<
  SerializedError,
  "details" | "cause" | "stack"
> & {
  details?: unknown;
  cause?: unknown;
  stack?: unknown;
} {
  return (
    isObject(value) &&
    typeof value.name === "string" &&
    typeof value.code === "string" &&
    typeof value.message === "string"
  );
}

/**
 * Copies details, keeping only JSON-compatible values: strings, finite
 * numbers, booleans, `null`, arrays and plain objects. Anything else is
 * dropped, so the result can always be cloned and stringified.
 *
 * @param details - Details from an error or from received data.
 * @returns The copy, or `undefined` when there's nothing to keep.
 */
function sanitizeDetails(details: unknown): ErrorDetails | undefined {
  if (!isPlainObject(details)) {
    return undefined;
  }
  const copy = copyValue(details, 0);
  return isPlainObject(copy) ? (copy as ErrorDetails) : undefined;
}

/**
 * @param value - The value to copy.
 * @param depth - The current nesting depth.
 * @returns A JSON-compatible copy, or `undefined` to drop the value.
 */
function copyValue(value: unknown, depth: number): ErrorDetailValue | undefined {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (depth >= MAX_DETAILS_DEPTH) {
    return undefined;
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      const copy = copyValue(item, depth + 1);
      return copy === undefined ? [] : [copy];
    });
  }
  if (isPlainObject(value)) {
    const copy: Record<string, ErrorDetailValue> = {};
    for (const [key, item] of Object.entries(value)) {
      const itemCopy = copyValue(item, depth + 1);
      if (itemCopy !== undefined) {
        copy[key] = itemCopy;
      }
    }
    return copy;
  }
  return undefined;
}

/**
 * @param value - Any value.
 * @returns Whether the value is a non-null object.
 */
function isObject(value: unknown): value is ErrorLike {
  return typeof value === "object" && value !== null;
}

/**
 * @param value - Any value.
 * @returns Whether the value is an object literal or has a null prototype.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * @param value - The `maxDepth` option.
 * @returns The depth limit to use.
 */
function depthOption(value: number | undefined): number {
  if (value === undefined) {
    return DEFAULT_MAX_DEPTH;
  }
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`maxDepth must be a non-negative integer, received ${value}.`);
  }
  return value;
}
