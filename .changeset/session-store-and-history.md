---
"@hussmartinez/sdk-core": minor
---

New session primitives for SDK sessions (ADR 0029), from the root entry:

- **`createStore(initial)`** returns `{ getSnapshot, subscribe, set }`, a small observable store for `useSyncExternalStore`. Setting the same value notifies no one, and a listener that throws doesn't stop the others.
- **`type Reducer<S, C>`** is a pure function that applies one command and returns the new state with the command's inverse. **`applyCommands(reducer, state, commands)`** applies a sequence and returns the inverses in the order that undoes it.
- **`createHistory()`** gives undo and redo stacks of command steps:
  - `push`, `undo`, `redo`, `canUndo` and `canRedo`;
  - `restore(direction)` after a step fails to apply;
  - **`group(fn)`** records everything pushed inside `fn` as one undoable step;
  - `steps`, `dropOrder`, `drop(count)` and `trimmed`, for building a memory budget that only drops steps in an order that keeps the rest applicable.

Your session keeps its own commands, snapshot and memory policy, and builds on these.
