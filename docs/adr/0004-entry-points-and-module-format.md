# 0004. Package entry points and module format

- **Status:** Accepted
- **Date:** 2026-11-06

## Context

The SDKs serve four kinds of users:

- applications that only need processing, with their own UI or none at all;
- React and Next.js applications that want a ready-made editor;
- sites that aren't built with React;
- plain HTML pages loading one script.

Bundling all of these into one entry point forces React onto processing-only users and makes tree-shaking unreliable.

## Decision

Every SDK publishes the same entry points:

| Entry | Contents | Constraints |
|---|---|---|
| `.` | Headless core: contracts, errors, the session store, operations | No React, no DOM access at import time, safe to import on a server |
| `./react` | The editor, its building blocks and hooks | Starts with `"use client"`; React and React DOM are optional peer dependencies |
| `./element` | `define<Kind>EditorElement()` and the element class | Registers nothing on import; safe to import on a server |
| `./styles.css` | All styles for the React and element surfaces | Imported once by the application |
| `./standalone` | A self-contained script that registers `<hm-<kind>-editor>` | For plain HTML pages; bundles React |

Packages ship ECMAScript modules only. `package.json` lists `"type": "module"`, an `exports` map with `types` first for every entry, and `"sideEffects": ["**/*.css"]`. The JavaScript never imports CSS; applications import `styles.css` themselves.

`publint` and `@arethetypeswrong/cli` must pass before every release.

## Alternatives considered

- **One entry point:** forces React on processing-only users.
- **Separate packages per surface (`-core`, `-react`, `-element`):** triples the number of packages to version and release, for no benefit over subpath exports.
- **CommonJS builds alongside ESM:** every supported bundler and Node version handles ESM, and dual builds risk loading two copies of the same module.
- **Importing CSS from JavaScript:** breaks in some frameworks, can't be ordered by the application, and hides a side effect.

## Consequences

- Processing-only users install no UI code beyond what they import.
- Users must import `styles.css` themselves. The README documents this in the first example.
- Old toolchains that require CommonJS are not supported.
