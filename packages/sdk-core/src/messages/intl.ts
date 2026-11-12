/**
 * Cached `Intl` objects. Constructing formatters is expensive, and `t()` runs
 * on every render, so each locale and option set is built once and reused by
 * every message set.
 */
/** The part of `Intl.DurationFormat` this module uses, where the browser has it. */
interface DurationFormatLike {
  format(duration: { hours?: number; minutes?: number; seconds?: number }): string;
}
type DurationFormatConstructor = new (
  locale: string,
  options: { style: "short"; secondsDisplay?: "always" },
) => DurationFormatLike;

type Cached =
  | Intl.NumberFormat
  | Intl.DateTimeFormat
  | Intl.PluralRules
  | Intl.ListFormat
  | DurationFormatLike;

const cache = new Map<string, Cached>();

function cached<T extends Cached>(
  kind: string,
  locale: string,
  options: object,
  create: () => T,
): T {
  const key = `${kind}|${locale}|${JSON.stringify(options)}`;
  let value = cache.get(key) as T | undefined;
  if (value === undefined) {
    value = create();
    cache.set(key, value);
  }
  return value;
}

export function numberFormat(
  locale: string,
  options: Intl.NumberFormatOptions = {},
): Intl.NumberFormat {
  return cached("number", locale, options, () => new Intl.NumberFormat(locale, options));
}

export function dateTimeFormat(
  locale: string,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  return cached("date", locale, options, () => new Intl.DateTimeFormat(locale, options));
}

export function pluralRules(locale: string): Intl.PluralRules {
  return cached("plural", locale, {}, () => new Intl.PluralRules(locale));
}

const FILE_SIZE_UNITS = [
  "byte",
  "kilobyte",
  "megabyte",
  "gigabyte",
  "terabyte",
  "petabyte",
] as const;

/**
 * Formats a byte count in decimal units (1 kB = 1000 B), as `Intl`'s byte
 * units, macOS and most web interfaces do. Values from a kilobyte up keep
 * one decimal place.
 *
 * @param locale - A canonical locale.
 * @param bytes - The size in bytes.
 */
export function formatFileSize(locale: string, bytes: number): string {
  let value = Math.abs(bytes);
  let unit = 0;
  while (value >= 1000 && unit < FILE_SIZE_UNITS.length - 1) {
    value /= 1000;
    unit += 1;
  }
  return numberFormat(locale, {
    style: "unit",
    unit: FILE_SIZE_UNITS[unit],
    unitDisplay: "short",
    maximumFractionDigits: unit === 0 ? 0 : 1,
  }).format(Math.sign(bytes) * value);
}

/**
 * Formats a duration in milliseconds for the locale, in hours, minutes and
 * seconds, leaving out units that are zero, such as "3 hr, 5 min" in `en`.
 * It rounds to the nearest second, and a duration under half a second is
 * "0 sec". It uses `Intl.DurationFormat` where the browser has it, and
 * otherwise `Intl.NumberFormat`'s unit style joined with `Intl.ListFormat`.
 *
 * @param locale - A canonical locale.
 * @param milliseconds - A finite, non-negative duration.
 */
export function formatDuration(locale: string, milliseconds: number): string {
  const total = Math.round(milliseconds / 1000);
  const parts = {
    hours: Math.floor(total / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
  const zero = total === 0;
  const DurationFormat = (Intl as unknown as { DurationFormat?: DurationFormatConstructor })
    .DurationFormat;
  if (typeof DurationFormat === "function") {
    // A zero duration would otherwise format as an empty string.
    const options = zero
      ? { style: "short" as const, secondsDisplay: "always" as const }
      : { style: "short" as const };
    return cached("duration", locale, options, () => new DurationFormat(locale, options)).format(
      zero ? { seconds: 0 } : parts,
    );
  }
  const units = (
    [
      ["hour", parts.hours],
      ["minute", parts.minutes],
      ["second", parts.seconds],
    ] as const
  ).filter(([, value]) => value > 0 || zero);
  const shown = zero ? units.filter(([unit]) => unit === "second") : units;
  const list = cached(
    "list",
    locale,
    { type: "unit", style: "short" },
    () => new Intl.ListFormat(locale, { type: "unit", style: "short" }),
  );
  return list.format(
    shown.map(([unit, value]) =>
      numberFormat(locale, { style: "unit", unit, unitDisplay: "short" }).format(value),
    ),
  );
}

/** Clears the cache. For tests only. */
export function clearIntlCache(): void {
  cache.clear();
}
