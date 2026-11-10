---
"@hussmartinez/sdk-config": patch
---

The Biome preset's `$schema` now matches Biome 2.6.6, so `biome check` no longer prints "The configuration schema version does not match the CLI version" for projects on Biome 2.6.6. The `@biomejs/biome` peer dependency is now `^2.6.6`.
