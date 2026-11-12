import { SdkError, type SdkErrorClass } from "../errors/sdk-error.js";

/**
 * The unit of a limit, used in error details and to format messages:
 * `hertz` is for rates, such as a sample rate or a frame rate, and
 * `bitsPerSecond` for data rates, such as a video's bitrate.
 *
 * @public
 */
export type LimitUnit = "bytes" | "count" | "milliseconds" | "pixels" | "hertz" | "bitsPerSecond";

/**
 * One resource limit: the error code for exceeding it, its unit, and its
 * safe default.
 *
 * @typeParam Code - The error code thrown when the limit is exceeded.
 * @public
 */
export interface LimitDefinition<Code extends string = string> {
  /** The code of the error thrown when the value exceeds the maximum. */
  readonly code: Code;
  /** The unit of the values. */
  readonly unit: LimitUnit;
  /** The default maximum. Values above it are rejected. */
  readonly default: number;
  /**
   * The default warning threshold. Values at or above it, but within the
   * maximum, are accepted with a warning, such as "this may be slow".
   * Omit it for no warning.
   */
  readonly warning?: number;
}

/**
 * Named limit definitions, such as `{ maxFileSize: {...}, maxPages: {...} }`.
 *
 * @public
 */
export type LimitDefinitions = { readonly [limit: string]: LimitDefinition };

/**
 * A host's setting for one limit: a new maximum, or a maximum and a warning
 * threshold. `Infinity` disables the maximum, which removes a protection
 * against hostile files, or disables the warning.
 *
 * @public
 */
export type LimitSetting = number | { readonly maximum?: number; readonly warning?: number };

/**
 * A host's `filePolicy`: settings for any subset of the limits.
 *
 * @typeParam Definitions - The SDK's limits.
 * @public
 */
export type FilePolicyOverrides<Definitions extends LimitDefinitions> = {
  readonly [Limit in keyof Definitions]?: LimitSetting;
};

/**
 * A limit's resolved values.
 *
 * @public
 */
export interface ResolvedLimit {
  /** Values above it are rejected. `Infinity` means no maximum. */
  readonly maximum: number;
  /** Values at or above it are accepted with a warning. `Infinity` means no warning. */
  readonly warning: number;
}

/**
 * The outcome of a check that didn't throw: `"warning"` when the value is at
 * or above the warning threshold, otherwise `undefined`.
 *
 * @public
 */
export type LimitCheck = "warning" | undefined;

/**
 * Resolved, validated limits, ready to enforce.
 *
 * @typeParam Definitions - The SDK's limits.
 * @public
 */
export interface FilePolicy<Definitions extends LimitDefinitions> {
  /** The resolved maximum and warning threshold of each limit. */
  readonly limits: { readonly [Limit in keyof Definitions]: ResolvedLimit };
  /**
   * Checks a value against a limit. Call it before decoding, or while
   * decoding as the value grows (ADR 0012).
   *
   * @param limit - The limit's name.
   * @param actual - The measured value, in the limit's unit.
   * @returns `"warning"` at or above the warning threshold, otherwise `undefined`.
   * @throws The SDK's error class, with the limit's code, when `actual` is
   *   above the maximum. `details` holds `limit`, `maximum`, `actual` and `unit`.
   */
  check<Limit extends keyof Definitions & string>(limit: Limit, actual: number): LimitCheck;
  /**
   * Builds the error `check` throws for a violation, for limits measured
   * another way, such as elapsed time.
   *
   * @param limit - The limit's name.
   * @param actual - The measured value, in the limit's unit.
   */
  error<Limit extends keyof Definitions & string>(
    limit: Limit,
    actual: number,
  ): SdkError<Definitions[Limit]["code"]>;
}

/**
 * A set of limits that resolves hosts' `filePolicy` settings.
 *
 * @typeParam Definitions - The SDK's limits.
 * @public
 */
export interface Limits<Definitions extends LimitDefinitions> {
  /** The limit definitions, with their defaults. */
  readonly definitions: Definitions;
  /**
   * Applies a host's settings to the defaults.
   *
   * @param overrides - The host's `filePolicy`.
   * @throws `TypeError` for an unknown limit name, so that a typo can't
   *   silently leave a default in place, and `RangeError` for a value that
   *   isn't a positive number or `Infinity`.
   */
  resolve(overrides?: FilePolicyOverrides<Definitions>): FilePolicy<Definitions>;
}

/**
 * Options for {@link defineLimits}.
 *
 * @public
 */
export interface DefineLimitsOptions {
  /**
   * The SDK's error class, such as `PdfError`, so that limit violations are
   * thrown as that class. Defaults to `SdkError`.
   */
  readonly errorClass?: SdkErrorClass;
}

/**
 * The media-agnostic limits every SDK enforces (ADR 0012, ADR 0020). SDKs
 * spread them into their own limits and may change their defaults.
 *
 * | Limit | Code | Default |
 * |---|---|---|
 * | `maxFileSize` | `FILE_TOO_LARGE` | 100 MB, warning from 50 MB |
 * | `maxFiles` | `TOO_MANY_FILES` | 20 |
 * | `maxDecodedSize` | `DECODED_SIZE_TOO_LARGE` | 500 MB |
 * | `maxProcessingTime` | `PROCESSING_TIME_EXCEEDED` | 120 s |
 *
 * @public
 */
export const coreLimits = {
  maxFileSize: { code: "FILE_TOO_LARGE", unit: "bytes", default: 100_000_000, warning: 50_000_000 },
  maxFiles: { code: "TOO_MANY_FILES", unit: "count", default: 20 },
  maxDecodedSize: { code: "DECODED_SIZE_TOO_LARGE", unit: "bytes", default: 500_000_000 },
  maxProcessingTime: { code: "PROCESSING_TIME_EXCEEDED", unit: "milliseconds", default: 120_000 },
} as const satisfies LimitDefinitions;

/**
 * The core limits' definitions.
 *
 * @public
 */
export type CoreLimits = typeof coreLimits;

/**
 * Defines an SDK's limits: the core limits plus its own, such as pages,
 * pixels or duration (ADR 0020).
 *
 * @example
 * ```ts
 * export const pdfLimits = defineLimits(
 *   { ...coreLimits, maxPages: { code: "TOO_MANY_PAGES", unit: "count", default: 2_000 } },
 *   { errorClass: PdfError },
 * );
 *
 * const policy = pdfLimits.resolve(props.filePolicy);
 * if (checkFile(policy, file) === "warning") showSlowFileNotice();
 * policy.check("maxPages", document.pageCount); // throws PdfError("TOO_MANY_PAGES")
 * ```
 *
 * @param definitions - The limits.
 * @param options - The SDK's error class.
 * @throws `RangeError` if a default isn't a positive number or `Infinity`.
 * @public
 */
export function defineLimits<const Definitions extends LimitDefinitions>(
  definitions: Definitions,
  options: DefineLimitsOptions = {},
): Limits<Definitions> {
  const ErrorClass = options.errorClass ?? SdkError;
  for (const [name, definition] of Object.entries(definitions)) {
    assertLimitValue(`${name}.default`, definition.default);
    if (definition.warning !== undefined) {
      assertLimitValue(`${name}.warning`, definition.warning);
    }
  }

  return {
    definitions,
    resolve(overrides = {}) {
      const limits: Record<string, ResolvedLimit> = {};
      for (const [name, definition] of Object.entries(definitions)) {
        limits[name] = {
          maximum: definition.default,
          warning: definition.warning ?? Number.POSITIVE_INFINITY,
        };
      }

      for (const [name, setting] of Object.entries(overrides as Record<string, unknown>)) {
        const current = Object.hasOwn(limits, name) ? limits[name] : undefined;
        if (current === undefined) {
          throw new TypeError(
            `"${name}" isn't a file policy limit. Known limits: ${Object.keys(limits).join(", ")}.`,
          );
        }
        limits[name] = applySetting(name, current, setting);
      }

      const lookup = (limit: string, actual: unknown) => {
        const resolved = Object.hasOwn(limits, limit) ? limits[limit] : undefined;
        const definition = Object.hasOwn(definitions, limit) ? definitions[limit] : undefined;
        if (resolved === undefined || definition === undefined) {
          throw new TypeError(`"${limit}" isn't a file policy limit.`);
        }
        if (typeof actual !== "number" || Number.isNaN(actual) || actual < 0) {
          throw new RangeError(
            `The value checked against ${limit} must be a non-negative number, received ${String(actual)}.`,
          );
        }
        return { resolved, definition, actual };
      };

      const violation = (limit: string, actual: unknown): SdkError => {
        const found = lookup(limit, actual);
        const { maximum } = found.resolved;
        const { code, unit } = found.definition;
        return new ErrorClass(
          code as never,
          `${limit} is ${maximum} ${unit}, but the value is ${found.actual}.`,
          {
            details: { limit, maximum, actual: found.actual, unit },
          },
        );
      };

      return {
        limits: limits as FilePolicy<Definitions>["limits"],
        check(limit, actual) {
          const { resolved } = lookup(limit, actual);
          if (actual > resolved.maximum) {
            throw violation(limit, actual);
          }
          return actual >= resolved.warning ? "warning" : undefined;
        },
        error: (limit, actual) => violation(limit, actual) as never,
      };
    },
  };
}

function applySetting(name: string, current: ResolvedLimit, setting: unknown): ResolvedLimit {
  if (typeof setting === "number") {
    assertLimitValue(name, setting);
    return { ...current, maximum: setting };
  }
  if (typeof setting !== "object" || setting === null) {
    throw new TypeError(`The setting for ${name} must be a number or { maximum, warning }.`);
  }
  const {
    maximum = current.maximum,
    warning = current.warning,
    ...rest
  } = setting as {
    maximum?: unknown;
    warning?: unknown;
  };
  const unknown = Object.keys(rest);
  if (unknown.length > 0) {
    throw new TypeError(`The setting for ${name} has unknown keys: ${unknown.join(", ")}.`);
  }
  assertLimitValue(`${name}.maximum`, maximum);
  assertLimitValue(`${name}.warning`, warning);
  return { maximum, warning };
}

function assertLimitValue(name: string, value: unknown): asserts value is number {
  if (typeof value !== "number" || Number.isNaN(value) || value <= 0) {
    throw new RangeError(
      `${name} must be a positive number or Infinity, received ${String(value)}.`,
    );
  }
}
