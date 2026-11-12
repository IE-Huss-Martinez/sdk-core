# 0032. A duration format for messages and a hertz unit for limits

- **Status:** Accepted
- **Date:** 2026-11-12
- **Refines:** [ADR 0019](0019-message-catalogues.md)'s placeholder formats and [ADR 0020](0020-file-policy.md)'s limit units

## Context

The audio SDK needs to show lengths, such as a file's duration or the limit it exceeds, and to limit sample rates. [sdk-core#59](https://github.com/ie-huss-martinez/sdk-core/issues/59) asks for both in `sdk-core`, so every SDK formats and checks them the same way:

- [ADR 0019](0019-message-catalogues.md)'s placeholders can format numbers, file sizes, dates and times, but not durations. A message such as "The file is {actual} long" would have to take a preformatted string, which translators can't adapt and which formats differently in each SDK. Video will need the same.
- [ADR 0020](0020-file-policy.md)'s limit units are `bytes`, `count`, `milliseconds` and `pixels`. A sample rate or a frame rate is none of these, and a limit's `unit` is what an error's `details` report.

## Decision

### `{name, duration}`

- **It takes milliseconds,** the unit of `milliseconds` limits and of the platform's media APIs once scaled, so a limit's `maximum` and `actual` can be shown without conversion.
- **It shows hours, minutes and seconds,** rounded to the nearest second and leaving out units that are zero, such as "3 hr, 5 min" or "42 sec". 90 minutes is "1 hr, 30 min". A zero duration is "0 sec".
- **It's formatted for the locale** with `Intl.DurationFormat` and `style: "short"`, cached like the other formatters. `Intl.DurationFormat` is only Baseline "newly available" (2025), not the "widely available" that [ADR 0013](0013-browser-and-react-support.md) prefers, so where it's missing, sdk-core falls back to `Intl.NumberFormat`'s unit style joined with `Intl.ListFormat`, which gives the same text in English.
- **An invalid value is left out:** a negative, non-finite or non-number value is treated like a missing parameter, with the development warning [ADR 0019](0019-message-catalogues.md) already defines.
- **Fractions of a second and days aren't shown.** Editing precision, such as a playhead's position, isn't message text; an SDK formats it in its own UI.

### `hertz`

`LimitUnit` adds `"hertz"`, for rates such as a sample rate or a frame rate. Units are labels for `details`, not conversions, so nothing else changes.

## Alternatives considered

- **Seconds instead of milliseconds:** closer to what people read, but every `milliseconds` limit would need converting before it's shown.
- **A clock style, such as `3:05:00`:** compact, but ambiguous between minutes and hours, and read poorly by screen readers. An SDK's own UI can still show timecodes.
- **Leave durations to each SDK:** the audio and video SDKs would each format them differently, and translators couldn't change the wording around them.

## Consequences

- Messages can include durations that translators can reword, and every SDK shows them the same way.
- `MessageFormats` and `LimitUnit` grow, which is a minor, additive change to `@hussmartinez/sdk-core`'s public API.
- The output depends on the runtime's `Intl` data, as dates and numbers already do, so tests that check exact text pin the locale.
