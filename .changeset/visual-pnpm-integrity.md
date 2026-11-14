---
"@hussmartinez/sdk-config": patch
---

`hm-test-visual` now installs pnpm in its image only after checking it against `pnpm-lock.yaml`. It downloads the `pnpm` package and the native binary for the image's architecture (`@pnpm/exe.linux-x64` or `linux-arm64`), checks each against the sha512 integrity that the lockfile records for the package manager, and installs those files with no install scripts. Before, it installed `pnpm@<version>` by name, trusting the registry. If `pnpm-lock.yaml` doesn't record the `packageManager` version of pnpm with these integrities, it stops with a usage error that says to run `pnpm install` with that version.
