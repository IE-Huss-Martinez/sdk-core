---
"@hussmartinez/sdk-config": minor
---

The dependency-cruiser preset adds a `no-ai-core` rule: published source under `src/` may no longer import `@hussmartinez/ai-core`, not even its types (ADR 0035). Tests and anything under `examples/` may still import it, so examples can show hosts how to pass an `ai-core` provider.

If your SDK needs AI, define a provider port in `src/core/ports` with only what it needs, such as `complete()` and `stream()` taking an `AbortSignal`, plus a fake and contract tests, and let the host pass a provider built with `ai-core` or its own backend. No package in the family imports `ai-core` today, so `hm-lint-deps` passes unchanged for existing repositories.
