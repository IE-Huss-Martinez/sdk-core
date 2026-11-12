---
"@hussmartinez/sdk-core": minor
---

Messages can format pixel counts with `{name, megapixels}`. It shows the count in millions for the locale, with up to one fraction digit, and the message gives the unit: `"The image is {actual, megapixels} megapixels."` with `{ actual: 24_159_744 }` reads "The image is 24.2 megapixels." in English. A negative or non-finite value is left out, with a development warning.
