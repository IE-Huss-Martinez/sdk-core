# 0029. Shared session primitives: a store, a history and a reducer type

- **Status:** Accepted
- **Date:** 2026-11-12
- **Refines:** [ADR 0008](0008-ports-adapters-and-session.md) and [ADR 0010](0010-edits-as-commands.md), by moving the parts every session shares into `sdk-core`

## Context

[ADR 0008](0008-ports-adapters-and-session.md) makes each SDK's session a framework-agnostic store with `getSnapshot()` and `subscribe()`, and [ADR 0010](0010-edits-as-commands.md) gives it commands with undo, redo and grouping. Each SDK has so far written both itself.

- **`pdf-sdk`** has a `History` class (`src/core/session/history.ts`, about 95 lines) and a store built into its session. The history is generic apart from its command type: undo and redo stacks of steps, each with its commands and their inverses, an order for dropping steps to save memory, and a way to put a step back when applying it fails. Its commands come from a pure function, `applyCommand(plan, command)`, which returns the new plan and the command's inverse ([`pdf-sdk` ADR 0003](https://github.com/ie-huss-martinez/pdf-sdk/blob/main/docs/adr/0003-page-plan-document-model.md)).
- **The audio SDK,** starting now, has the same model: a plan over immutable sources, edited with commands that record their inverses. It would copy the same code.

Two copies of undo logic would drift, and subtle parts, such as the order of a group's inverses or which steps can be dropped and still applied, would be fixed in one and not the other. What differs between SDKs is the commands, the snapshot and the memory policy. A PDF's history holds source documents, and an audio history holds decoded sources, so they count memory differently.

## Decision

`sdk-core`'s root entry adds three pieces. They're pure, have no dependencies, don't use the DOM, and can be tree-shaken.

### `createStore<S>(initial)`

Returns `{ getSnapshot, subscribe, set }`:

- **`getSnapshot()`** returns the current state, the same value until it changes, as `useSyncExternalStore` requires.
- **`subscribe(listener)`** returns a function that unsubscribes. Listeners are called synchronously, in subscription order, after every change.
- **`set(next)`** takes the next state or a function of the current one. **Setting the same value (`Object.is`) notifies no one.**
- **A listener that throws doesn't stop the others.** Its error is reported with `globalThis.reportError` where that exists, and rethrown asynchronously otherwise.
- **States are immutable by convention.** The store doesn't freeze them, to avoid the cost on large snapshots. Every change makes a new state, so subscribers compare by identity.

### `type Reducer<S, C>`

`(state: S, command: C) => { readonly state: S; readonly inverse: C }`: a pure function that applies one command and returns the command that undoes it. An invalid command throws the SDK's own error.

**`applyCommands(reducer, state, commands)`** applies a sequence and returns `{ state, inverses }`, with **the inverses in reverse order**, ready to undo the whole sequence. It's one line of logic, but the order is what grouped undo depends on, so it's written and tested once.

### `createHistory<C extends { type: string }>()`

A step is `{ commands: readonly C[]; inverses: readonly C[] }`, which is plain, serialisable data ([ADR 0010](0010-edits-as-commands.md)). The history has:

- **`push(step)`:** records a step, and drops everything that could be redone.
- **`undo()` and `redo()`:** move a step between the stacks and return it, or return `undefined`. The session applies the step's inverses or commands with its reducer.
- **`restore(direction)`:** puts a step back after applying it failed, so a failed undo or redo leaves the history as it was.
- **`canUndo`, `canRedo`:** booleans for the snapshot.
- **`group(fn)`:** every step pushed while `fn` runs becomes one step:
  - its commands are in order, and its inverses are in reverse step order;
  - nested groups join the outer one;
  - a group that pushes nothing records nothing;
  - if `fn` throws, the steps it already pushed are still recorded as one step, because their changes have already been applied to the state, and the error is rethrown;
  - `fn` is synchronous. A gesture that spans several events, such as a drag or a pen stroke, collects its commands and pushes one step when it ends.
- **For memory policies:**
  - `steps`: every step, undoable and redoable;
  - `dropOrder`: the order to drop steps in so that those that remain can still be applied. The redo steps go first, from the one redo would reach last, then the undo steps, oldest first;
  - `drop(count)`: drops the first `count` steps of `dropOrder`, and sets `trimmed`;
  - `trimmed`: whether steps were dropped since the last `clear()`, so the editor can say that the earliest edits can't be undone ([ADR 0010](0010-edits-as-commands.md));
  - `clear()`: empties both stacks and resets `trimmed`.

### What stays in each SDK

- **The memory policy:** what a step holds on to, how much that counts, and when to drop steps. The history only provides `steps`, `dropOrder` and `drop`.
- **The session itself:** its snapshot shape, commands, reducer, events and asynchronous work, such as opening and exporting files.

## Alternatives considered

- **Keep a copy in each SDK:** the copies would drift, in exactly the parts that are easiest to get wrong.
- **A full session base class in `sdk-core`:** sessions differ in their asynchronous work, state and events, so a base class would grow options for each SDK. Small primitives compose instead.
- **Snapshots of the whole state instead of inverse commands:** simpler to write, but ruled out for large documents by [ADR 0010](0010-edits-as-commands.md)'s memory budget.
- **An existing state library, such as Zustand or Redux:** more than the SDKs need, and one more runtime dependency for every host. The store is about 30 lines.

## Consequences

- `pdf-sdk` replaces its `History` and inline store with these, with no change in behaviour. The audio SDK starts with them.
- Undo semantics are tested once, in `sdk-core`: grouping, a failed undo or redo, and dropping steps.
- These become public API of `@hussmartinez/sdk-core`, reported by api-extractor. Changing them follows semver.
