---
"@hussmartinez/sdk-core": patch
---

Production bundles no longer carry the text of sdk-core's development warnings. Each warning is now guarded inline by `process.env.NODE_ENV`, which bundlers replace and fold away, so an application that only uses `createMessages` ships about 200 bytes less, compressed. Behaviour is unchanged: warnings still print in development, and never in production.
