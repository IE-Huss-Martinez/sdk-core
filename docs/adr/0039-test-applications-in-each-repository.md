# 0039. Test applications live in each repository's `examples/`

- **Status:** Accepted
- **Date:** 2026-11-12
- **Refines:** [ADR 0007](0007-server-rendering-and-nextjs.md), on where the test applications live

## Context

[ADR 0007](0007-server-rendering-and-nextjs.md) says that `sdk-config` provides two test applications, a Next.js App Router application and a Vite React application, which every SDK and `ui` runs its end-to-end tests against. `STANDARDS.md` repeats it. Neither application exists:

- **`ui`** has its own `examples/next` and `examples/vite`, and an `e2e/` Playwright suite that runs [ADR 0007](0007-server-rendering-and-nextjs.md)'s checks against both: server rendering, hydration without warnings, use afterwards, axe, and no request to another origin.
- **`pdf-sdk`** has a React layer, and tests it on the server with `renderToString` in Node, but has no `examples/` or end-to-end suite yet. So no test catches a hydration warning or a Next.js build failure.
- **`audio-sdk`** has no React layer yet.

Shared applications in `sdk-config` would have to depend on every package they test, or be configured by each repository so heavily that little would be shared. `STANDARDS.md`'s repository layout already shows `e2e/` and `examples/` in each repository.

## Decision

- **Each repository's `examples/` are its test applications:** `examples/next` (App Router, built for production) and `examples/vite` (React), plus `examples/html` once the repository ships a custom element. Its `e2e/` Playwright suite runs [ADR 0007](0007-server-rendering-and-nextjs.md)'s checks against them, as `ui`'s does.
- **They're required before a repository's first release with a React layer or a custom element,** and `pnpm verify` runs the end-to-end suite. Until then, `renderToString` tests in Node cover rendering on the server, but they don't replace the suite: they can't see hydration or a framework's build.
- **They use the repository's own build,** through the workspace, so they test what will be published.
- **Shared test applications come back only if duplication appears,** such as the same harness copied into three repositories. Then a new ADR moves the common part into `sdk-config`, as a preset rather than an application.

## Alternatives considered

- **Build the shared applications in `sdk-config`, as planned:** each would need every SDK as a dependency, and `sdk-config` would have to release whenever an SDK's examples changed. `ui`'s working setup shows that one repository's examples stay small.
- **Rely on `renderToString` tests alone:** they catch browser access during render, but not hydration mismatches, `"use client"` handling, or a bundler's treatment of workers and WebAssembly.

## Consequences

- `STANDARDS.md` says each repository's end-to-end tests run against its own `examples/`, and `sdk-config` no longer claims test applications or Vite and Playwright presets it doesn't have.
- `pdf-sdk` needs `examples/next`, `examples/vite` and an `e2e/` suite before its first release. The audio and image SDKs add them with their React layers.
- Each repository maintains its own examples, which also serve as runnable documentation of its integration.
