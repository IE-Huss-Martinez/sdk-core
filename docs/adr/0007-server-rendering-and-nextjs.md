# 0007. Server rendering and Next.js compatibility

- **Status:** Accepted
- **Date:** 2026-11-06

## Context

React applications increasingly render on the server first, with Next.js's App Router as the most common case. Code that touches `window`, `document`, `Worker`, `HTMLElement` or `customElements` while a module loads crashes during server rendering. Several dependencies do exactly that; pdf.js, for example, references `DOMMatrix` at import time. Bundlers also strip the `"use client"` directive from library builds unless told otherwise.

## Decision

Every SDK and `ui` follows these rules:

1. **`"use client"` survives the build.** Every React entry file begins with the directive, the build preserves it, and a test checks the built files.
2. **No browser access at import time or during render.** Browser-only dependencies, workers and WebAssembly load through dynamic `import()` after mount. The `./element` entry guards its class definition so that importing it on a server does nothing.
3. **The core entry is server-safe.** Types, constants, `createTheme`, `themeToCss` and pure helpers can be imported in Server Components and in Node.
4. **Server and client produce identical markup.** IDs come from `useId`. Nothing in render depends on time, randomness or browser state, so hydration produces no warnings.
5. **Styles are imported by the application, once,** as decided in [0004](0004-entry-points-and-module-format.md).
6. **No theme flash.** `ThemeProvider` renders its custom properties on the server, and the `system` mode is pure CSS.
7. **No bundler configuration required.** Inline worker and WebAssembly assets work in webpack, Turbopack and Vite as they are ([0011](0011-worker-messaging-and-assets.md)).

`sdk-config` provides two test applications that every SDK and `ui` runs its end-to-end tests against:

- a Next.js App Router application built for production;
- a Vite React application.

The tests assert that:

- server rendering completes without errors;
- hydration produces no warnings;
- a Server Component can import the core entry;
- the editor loads a file and runs an operation in the browser.

## Alternatives considered

- **Telling users to wrap components in `next/dynamic` with `ssr: false`:** pushes our problem onto every user, loses server-rendered markup, and fails silently when someone forgets.
- **Supporting client-side rendering only:** excludes the most common React framework.

## Consequences

- Heavy dependencies always load lazily, which also keeps initial bundles small.
- End-to-end tests take longer, because every SDK builds a Next.js application.
- Authors must keep browser access inside effects and event handlers. The Next.js test catches violations before release.
