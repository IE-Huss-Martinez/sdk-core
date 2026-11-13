---
"@hussmartinez/sdk-core": patch
---

In development, sdk-core now warns once when a second copy of it is used on the page, naming both versions. Errors from one copy aren't `instanceof SdkError` of another, so use `isSdkError`. `npm ls @hussmartinez/sdk-core` shows where each copy comes from. Production builds drop the check, and importing sdk-core still has no side effects.
