# 0019. Message catalogues as typed, plain-text data

- **Status:** Accepted
- **Date:** 2026-11-06

## Context

[ADR 0014](0014-accessibility-and-translatable-text.md) requires every visible string, accessible name and announcement to come from a typed English catalogue in each SDK. Hosts override any subset through a `messages` prop, plurals use `Intl.PluralRules`, numbers, sizes and dates use `Intl`, and `sdk-core` provides `createMessages`. It left open:

- the format of a message, which hosts' translators and translation platforms work with;
- how parameters and plurals are typed and written;
- how error text is found for an `SdkError`;
- how untrusted overrides, locales and server rendering are handled.

These details become public API for every SDK and every host that translates one.

## Decision

### Format

A message is **data**: a string with placeholders, or a plain plural object. Catalogues and overrides can be stored as JSON.

- **Placeholders:** `{name}` takes a string or a number. `{name, number}`, `{name, fileSize}`, `{name, date}` and `{name, time}` take numbers, or a `Date` for dates and times. Braces are reserved for placeholders.
- **Plurals:** `{ "$plural": "count", "one": "{count} page", "other": "{count} pages" }`.
  - `$plural` names the numeric parameter that selects the form, using `Intl.PluralRules` for the locale.
  - `other` is required. `zero`, `one`, `two`, `few` and `many` are optional, so translations can add forms that English doesn't use.
  - The `$` prefix keeps the selector apart from the category names, which `Intl` fixes.
  - `plural()` is a typed helper that returns this same plain shape.
- **Formatting:**
  - numbers are formatted with `Intl.NumberFormat` for the locale, including in `{name}` and in a plural's `{count}`, while strings are inserted as they are;
  - file sizes use decimal units (1 kB = 1000 B), with `Intl`'s byte units;
  - dates use `dateStyle: "medium"` and times use `timeStyle: "short"`.

### Types

- **Catalogues:** each SDK declares its catalogue with `defineMessages`, which keeps literal types. Parameters are derived from the placeholders with template-literal types, so calling `t()` with an unknown key, a missing parameter or a wrong parameter type is a type error.
- **Overrides:** typed against the catalogue. An unknown key, or a placeholder the English message doesn't have, is a type error for overrides written as literals. A translation may leave out placeholders.

### Output

`t()` and `error()` return plain strings, never markup. There's no rich-text syntax, so HTML injection through messages or their parameters, such as file names, is impossible by construction. Frameworks render the strings as text.

### Errors

- **Lookup by code:** user-facing error text is looked up under `errors.<CODE>`, with the error's `details` as parameters. Any other value, and any unknown code, gets `errors.UNKNOWN`.
- **Never `error.message`:** it's never shown, because it's for developers and may contain file-derived text.
- **sdk-core's own codes:** `sdkCoreMessages` provides English text for them, including `errors.UNKNOWN`. Every SDK spreads it into its catalogue, and `createMessages` requires `errors.UNKNOWN`.
- **Warnings:** warnings, such as the file policy's warning thresholds, use `warnings.<LIMIT>` keys.

### Locale and server rendering

- **The locale is explicit:** it defaults to `"en"`, and an invalid locale falls back to `"en"`. Nothing reads `navigator.language` or any other environment state, at import or creation. Otherwise server and client would render different text and hydration would fail ([0007](0007-server-rendering-and-nextjs.md)). SDKs pass the host's `locale` explicitly.

### Untrusted overrides

Host overrides are untyped at runtime. `createMessages` validates them once:

- **Unknown keys** are ignored.
- **Malformed messages** fall back to the English message for that key. This covers an unbalanced brace, an unknown format, an invalid plural, or a placeholder the English message doesn't have.
- **`t()` never throws.** A parameter missing at runtime renders as an empty string, an unknown key renders as the key, and parameters are read only as own properties.
- **Warnings:** each case logs a warning in development only, detected through `process.env.NODE_ENV`, which bundlers replace at build time. Production builds drop them.
- **The SDK's own catalogue** must be valid. A malformed English message throws at creation, so it fails the SDK's tests rather than reaching users.

### Performance and size

- **`Intl` only, no dependencies.** `Intl.NumberFormat`, `Intl.DateTimeFormat` and `Intl.PluralRules` instances are cached per locale and options and shared by every message set, so `t()` doesn't construct formatters.
- **Compiled once:** templates are parsed when the message set is created.

## Alternatives considered

- **Messages as functions:** easiest to type, but they can't be stored as JSON, so every translation would have to be code.
- **ICU MessageFormat:** the industry standard, but a full parser is large. Its syntax is unfamiliar to many hosts, and typing its parameters is far harder. The subset above covers what the SDKs need.
- **An i18n library, such as i18next or FormatJS:** rejected in ADR 0014 as too heavy, and as imposing a library on hosts.
- **Rich text through markup in messages:** convenient for emphasis or links, but it reopens HTML injection. Messages that need structure are split into several messages instead.
- **Defaulting to the browser's language:** convenient, but it breaks server rendering. Hosts pass their locale.

## Consequences

- Hosts can translate any SDK from a JSON file, and get type errors for literal overrides that don't fit.
- SDK code can't render an untranslated or untyped string through the catalogue, or forget a parameter.
- Literal braces can't appear in messages. Supporting them would need an escape syntax, which can be added compatibly if it's ever required.
- Every SDK's catalogue includes `sdkCoreMessages`, so sdk-core's error text is translated the same way everywhere.
