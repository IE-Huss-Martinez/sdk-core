/**
 * Cached `Intl` objects. Constructing formatters is expensive, and `t()` runs
 * on every render, so each locale and option set is built once and reused by
 * every message set.
 */
const cache = new Map<string, Intl.NumberFormat | Intl.DateTimeFormat | Intl.PluralRules>();

function cached<T extends Intl.NumberFormat | Intl.DateTimeFormat | Intl.PluralRules>(
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

/** Clears the cache. For tests only. */
export function clearIntlCache(): void {
  cache.clear();
}
