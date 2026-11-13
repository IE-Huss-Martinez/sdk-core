---
"@hussmartinez/sdk-config": minor
---

Adds the shared pieces for conformance vectors (sdk-core ADR 0045):

- `@hussmartinez/sdk-config/formats/hm-conformance/v1.schema.json`, the JSON Schema of an `hm-conformance` case file.
- `@hussmartinez/sdk-config/testing/conformance`, a test-only Vitest loader. `describeConformance(file, run)` validates a case file and registers one test per case. It compares results exactly, or within a case's `tolerance` for numbers, and matches a rejection by its `code` and `details.reason`, never its message. `schemaValidator(schemaFile)` checks values against an SDK's own format schemas in tests.

The loader needs `vitest` and `ajv`, which are optional peer dependencies. Import it only from tests.
