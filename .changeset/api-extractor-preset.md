---
"@hussmartinez/sdk-config": minor
---

Adds an api-extractor preset and the `hm-check-api-reports` command, for packages with more than one entry point.

- **`@hussmartinez/sdk-config/api-extractor/base.json`:** extend it from each entry point's `api-extractor.json`, using that full path, and set only the paths. It lists the package types a secondary entry point copies in its API report (`ae-forgotten-export`), instead of failing or hiding them.
- **`hm-check-api-reports --main <report> --types <rollup> [<report>...]`:** run it after api-extractor. It fails when another entry point copies a type the main entry point doesn't export, or a class with `private`, `protected` or `#private` members, whose copy TypeScript would treat as a different type.

If your configuration turns `ae-forgotten-export` off, extend the preset and run the command instead. It needs `@microsoft/api-extractor`, an optional peer dependency.
