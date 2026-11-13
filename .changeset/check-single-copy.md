---
"@hussmartinez/sdk-config": minor
---

Adds `hm-check-single-copy`, which fails when `pnpm-lock.yaml` resolves more than one version of any `@hussmartinez` package (or of the scopes given with `--scope`). It names each version and what depends on it, such as `0.3.0, through @hussmartinez/ui@0.5.0`. Workspace links aren't copies, and versions that differ only in their peer dependencies count once. Add `"check:single-copy": "hm-check-single-copy"` to your scripts and run it in `verify`. It adds `yaml` as a dependency.
