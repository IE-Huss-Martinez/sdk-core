# 0047. Check that every repository installs one copy of each family package

- **Status:** Accepted
- **Date:** 2026-11-13
- **Refines:** [ADR 0036](0036-ui-as-a-dependency-of-the-sdks.md)'s one-copy rule, by checking it in every repository's `verify`

## Context

[ADR 0036](0036-ui-as-a-dependency-of-the-sdks.md) requires one copy of `ui` in an application, because two copies split its React context. Two copies of `sdk-core` cost too: its code ships twice, and the copies can behave differently. For example, `ui` on 0.3.0 has no `{name, megapixels}` message format, while an SDK on 0.4.0 does. `SdkError`'s brand still works across copies, through `Symbol.for`, but nothing else is shared. Nothing checked it, and it already happened:

- **`image-sdk`'s lockfile** resolves `@hussmartinez/sdk-core` to 0.3.0, through `@hussmartinez/ui@0.5.0`, and to 0.4.1, for the workspace.
- **`video-sdk`'s lockfile** resolves it to 0.3.0, through `ui` 0.4.0, and to 0.4.0.

`ui` depended on `sdk-core` ^0.3.0 while the SDKs moved to ^0.4.0. During `0.x`, caret ranges don't cross minors, so pnpm installed both. Builds and tests passed, so only a reader of the lockfile could notice.

## Decision

- **`sdk-config` ships `hm-check-single-copy`.** It reads `pnpm-lock.yaml` and fails when a package in the `@hussmartinez` scope (or the scopes given with `--scope`) resolves to more than one version.
- **It explains each failure:** every version, and what depends on it, such as `0.3.0, through @hussmartinez/ui@0.5.0` and `0.4.1, through the workspace (.)`, so the fix is clear: move every dependent to the same version.
- **What counts as a copy:**
  - workspace links (`link:` and `workspace:`) aren't copies;
  - versions that differ only in their peer dependencies, such as `ui@0.6.0(react@18)` and `ui@0.6.0(react@19)`, are one copy;
  - every document in the lockfile is read, including pnpm's config document.
- **Every repository's `verify` runs it,** after `lint:deps`, as `check:single-copy`. `verify:fast` runs it too, because it's quick and works offline.
- **A failure blocks the change** that introduces a second copy. The usual fix is to release the dependent family package, such as `ui`, on the newer version, then bump every repository together.

## Alternatives considered

- **Extend `hm-lint-deps`:** it checks which source files import what, through a dependency-cruiser cruise. This reads only the lockfile. Keeping the two separate keeps each one's failures unambiguous.
- **`pnpm dedupe --check`:** it reports any lockfile that could be smaller, not two versions that can't be reconciled within their ranges, which is exactly this case.
- **Peer dependencies for family packages:** they'd guarantee one copy, but [ADR 0036](0036-ui-as-a-dependency-of-the-sdks.md) rejected them for `ui`, because hosts would have to install them by hand.

## Consequences

- A second copy of a family package fails `verify` in the repository that would ship it, with the dependents named.
- Family releases are coordinated: when `sdk-core` moves to a new minor, `ui` follows before the SDKs can, or their `verify` fails.
- Each repository adds `check:single-copy` to its `verify` in its own pull request, once `sdk-config` releases the command.
