# 0047. Check that every repository installs one copy of each family package

- **Status:** Accepted
- **Date:** 2026-11-13
- **Refines:** [ADR 0036](0036-ui-as-a-dependency-of-the-sdks.md)'s one-copy rule, by checking it in every repository's `verify`

## Context

[ADR 0036](0036-ui-as-a-dependency-of-the-sdks.md) requires one copy of `ui` in an application, because two copies split its React context. Two copies of `sdk-core` cost too: its code ships twice, and the copies can behave differently. For example, `ui` on 0.3.0 has no `{name, megapixels}` message format, while an SDK on 0.4.0 does. `isSdkError` still recognises errors from either copy, through a `Symbol.for` brand, but `instanceof SdkError` fails silently across copies, and nothing else is shared. Nothing checked it, and it already happened:

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
- **A failure blocks the change** that introduces a second copy.

### Releases that keep one copy

- **Upstream first.** When `sdk-core` releases a new minor, `ui` moves its range to that minor in its next release, before any SDK bumps `sdk-core`. `ui` sits upstream of every SDK, and during `0.x` a caret range stays within its minor, so an SDK that moved first would get two copies.
- **SDKs bump together.** An SDK bumps `ui` and `sdk-core` in the same pull request, so `pnpm why` and `npm ls` show one copy of each. `hm-check-single-copy` enforces it: a pull request that bumps one without the other fails `verify`.

### A warning for hosts, in a later pull request

The lockfile check protects the family's own repositories, but not a host application, which can still end up with two copies of `sdk-core` through its own dependencies. So `sdk-core` will warn once in development when a second copy is used, naming both versions, as `ui` already does for its own copies ([ADR 0036](0036-ui-as-a-dependency-of-the-sdks.md)):

- each copy registers itself under a `Symbol.for` key on `globalThis` on its first use, never on import, so importing `sdk-core` stays free of side effects ([ADR 0004](0004-entry-points-and-module-format.md));
- it compares module identity, so two installs of the same version are caught too;
- production builds drop it.

It's the symptom hosts would otherwise never see: an `instanceof SdkError` check that silently returns `false`. It comes in its own pull request.

## Alternatives considered

- **Extend `hm-lint-deps`:** it checks which source files import what, through a dependency-cruiser cruise. This reads only the lockfile. Keeping the two separate keeps each one's failures unambiguous.
- **`pnpm dedupe --check`:** it reports any lockfile that could be smaller, not two versions that can't be reconciled within their ranges, which is exactly this case.
- **The lockfile check alone, without a runtime warning in `sdk-core`:** `isSdkError` already works across copies through its `Symbol.for` brand, so a warning adds less than `ui`'s does. But only a warning reaches hosts, whose own dependencies can bring a second copy, and an `instanceof SdkError` check there fails silently. So the warning is taken, in a later pull request (see "A warning for hosts").
- **Peer dependencies for family packages:** they'd guarantee one copy, but [ADR 0036](0036-ui-as-a-dependency-of-the-sdks.md) rejected them for `ui`, because hosts would have to install them by hand.

## Consequences

- A second copy of a family package fails `verify` in the repository that would ship it, with the dependents named.
- Family releases are coordinated: when `sdk-core` moves to a new minor, `ui` releases on it first, and each SDK then bumps both in one pull request, or its `verify` fails.
- Each repository adds `check:single-copy` to its `verify` in its own pull request, once `sdk-config` releases the command.
