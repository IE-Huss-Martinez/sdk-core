---
"@hussmartinez/sdk-core": minor
---

Messages can format durations with `{name, duration}`. It takes milliseconds and shows hours, minutes and seconds for the locale, leaving out units that are zero: `"Length: {length, duration}"` with `{ length: 11_100_000 }` reads "Length: 3 hr, 5 min" in English. Durations are rounded to the nearest second, and zero is "0 sec". A negative or non-finite value is left out, with a development warning, as a missing parameter is.

Limits can use the new `"hertz"` unit, for rates such as a sample rate or a frame rate.
