# 0017. Where `core/errors` and `@hussmartinez/sdk-core` sit in the core layers

- **Status:** Accepted
- **Date:** 2026-11-06

## Context

[ADR 0008](0008-ports-adapters-and-session.md) defines the layers of every SDK and what each may import. Two things that every SDK's core needs aren't in its table:

- **The `core/errors` folder.** The standard repository layout in [`STANDARDS.md`](../../STANDARDS.md#repository-layout) has it, but the table doesn't say what it may import or who may import it. Each SDK's error class lives there and extends `SdkError`, and every layer throws or checks those errors.
- **`@hussmartinez/sdk-core`.** The table lets adapters import it, but says nothing about the core layers. They need it: `SdkError` for the errors, and the session primitives for `core/session` ([ADR 0002](0002-one-repository-per-sdk.md)). Read literally, `core/model` "imports nothing", so it couldn't even use a shared type.

The `dependency-cruiser` preset in `sdk-config` enforces the table, so the gaps have to be settled before an SDK's core is written against it.

## Decision

This record clarifies ADR 0008's layer table. ADR 0008 otherwise stands.

- **`@hussmartinez/sdk-core` is allowed in every core layer.** It's headless, has no React and does no DOM access on import ([ADR 0004](0004-entry-points-and-module-format.md)), so depending on it doesn't compromise the core.
- **The core never imports `@hussmartinez/ui`, `react` or `react-dom`.** UI belongs to `features/`, `react/` and `element/`.
- **`core/errors` is a leaf layer.** It may import only `core/model` and `@hussmartinez/sdk-core`. Every other layer, inside or outside the core, may import it.

The layer table, with the changes in bold:

| Layer | May import |
|---|---|
| `core/model` | **`@hussmartinez/sdk-core`** |
| **`core/errors`** | **`model`, `@hussmartinez/sdk-core`** |
| `core/operations` | `model`, **`errors`, `@hussmartinez/sdk-core`** |
| `core/ports` | `model`, **`errors`, `@hussmartinez/sdk-core`** |
| `core/session` | `model`, `operations`, `ports`, **`errors`, `@hussmartinez/sdk-core`** |
| `adapters/*` | `ports`, `model`, **`errors`**, `sdk-core` |
| `features/*` | `core`, `ui` |
| `react/`, `element/` | all of the above |

The `dependency-cruiser` preset enforces both rules.

## Alternatives considered

- **Errors in `core/model`:** errors are domain values, but a separate folder keeps the codes and the error class easy to find, and it's where the standard layout already puts them.
- **Keeping `@hussmartinez/sdk-core` out of the core and re-exporting it through adapters:** this inverts the dependency, because the core would depend on an adapter to get its own error base class.
- **Letting `core/errors` import any core layer:** errors would then pull in operations or the session, and every layer that throws would risk an import cycle.

## Consequences

- An SDK's core can extend `SdkError` and build on the session primitives without breaking a layer rule.
- Every layer can throw and check typed errors, and errors can't create cycles through the core.
- A change to `@hussmartinez/sdk-core` can affect every core layer, which is one more reason to keep it small and stable ([ADR 0002](0002-one-repository-per-sdk.md)).
