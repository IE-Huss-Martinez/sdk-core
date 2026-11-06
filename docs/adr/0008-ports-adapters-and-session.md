# 0008. Ports and adapters with a framework-agnostic session

- **Status:** Accepted
- **Date:** 2026-11-06

## Context

The first editor this family grew from keeps its whole state in one 1,200-line React component. That design can't be reused by the web component, can't be tested without rendering, can't be driven from server code or other frameworks, and gets harder to change with every feature. The heavy work (parsing, rendering, transforming) depends on specific libraries, such as pdf.js and qpdf, that applications may want to replace.

## Decision

Every SDK uses a ports-and-adapters (hexagonal) architecture, organised in layers:

| Layer | Contents | May import |
|---|---|---|
| `core/model` | Pure domain types and value objects | nothing |
| `core/operations` | Edit commands ([0010](0010-edits-as-commands.md)) | `model` |
| `core/ports` | Interfaces the core needs, such as `PdfEngine` (decode and render) and `PdfProcessor` (transform) | `model` |
| `core/session` | The document session: state store, command history, events | `model`, `operations`, `ports` |
| `adapters/*` | Implementations of ports, such as pdf.js and qpdf, running in workers | `ports`, `model`, `sdk-core` |
| `features/*` | Tool modules ([0009](0009-features-as-tools.md)) | `core`, `ui` |
| `react/`, `element/` | Editor shell, providers, hooks, element wrapper | all of the above |

- **The session is framework-agnostic.** It's a small observable store with `getSnapshot()`, `subscribe()` and command methods. React binds to it with `useSyncExternalStore`, which works with server rendering. The web component binds to the same store. Other frameworks can add bindings later without touching the core.
- **Dependency rules are enforced** by `dependency-cruiser`, configured in `sdk-config`. For example, `core/**` can never import React, an adapter or a feature.
- **Adapters are swappable.** Each SDK's editor accepts `engine` and `processor` props. `sdk-core` provides contract-test suites that every implementation of a port must pass, so replacement adapters are held to the same behaviour.
- **Errors are typed.** Each SDK has one error class, such as `PdfError`, extending `sdk-core`'s `SdkError`, with a stable string `code`, optional `details` and a `cause`. User-facing text is looked up by code in the messages ([0014](0014-accessibility-and-translatable-text.md)), never taken from error text.

## Alternatives considered

- **State in React context and hooks:** ties the core to React, so the web component and any non-React use would need a second implementation.
- **An external state library such as Redux or Zustand:** a hand-written store of a few dozen lines covers what we need without adding a dependency to every SDK.

## Consequences

- The core can be unit-tested without a DOM, and features can be tested against fake adapters.
- The React and element layers become thin, so supporting another framework is cheap.
- There's more structure up front than a single component would need. That's the cost of scaling to many tools and SDKs.
