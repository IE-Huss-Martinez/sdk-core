# 0010. Edits as commands with undo history

- **Status:** Accepted
- **Date:** 2026-11-06

## Context

In the original PDF editor, every edit replaced the working file. Edits couldn't be undone, destructive actions needed confirmation dialogs, and nothing recorded what had been done. Users expect undo in any editor, and an explicit record of operations also enables batching, replay and analytics without inspecting file contents.

## Decision

All document changes go through commands executed by the session ([0008](0008-ports-adapters-and-session.md)):

- **A command** is a serialisable description of an edit, such as `{ type: "pdf.rotatePages", pages: [2], angle: 90 }`, plus its implementation. Commands carry no closures, so they can cross worker boundaries and be logged.
- **History:** the session keeps a history with `undo()`, `redo()`, `canUndo` and `canRedo`. Each entry stores either an inverse command or a snapshot. Snapshots are kept within a configurable memory budget, and the oldest entries are dropped first.
- **Grouping:** related commands can be grouped into one undoable step, such as a drag that moves several pages.
- **Events:** each command emits typed, anonymous events, which the host's `onEvent` receives for analytics. They never contain file names or contents.
- **Undo over confirmation:** destructive actions run immediately and show an "Undo" affordance, instead of asking for confirmation. Irreversible actions, such as leaving with unsaved changes, still confirm.

## Alternatives considered

- **Replacing the whole document on every edit with no history:** simplest, but no undo.
- **Full event sourcing, replaying every command from the original file:** precise, but replaying heavy operations such as compression or encryption on every undo is too slow for large files.

## Consequences

- Every editor gets undo and redo consistently, with the same shortcuts.
- Large files can exhaust the history's memory budget. The editor shows when early steps are no longer undoable.
- Command definitions become part of each SDK's public API ([0009](0009-features-as-tools.md)).
