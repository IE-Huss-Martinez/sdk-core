---
"@hussmartinez/sdk-core": patch
---

0.1.3 and 0.2.0 were published without their built files (`dist/`), so importing them failed. This release is built and checked before publishing: every file that `package.json` points to must be in the tarball. If you're on 0.1.3 or 0.2.0, upgrade.
