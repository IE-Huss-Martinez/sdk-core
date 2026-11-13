---
"@hussmartinez/sdk-core": patch
---

Shortcuts no longer fire for keys pressed inside a modal `<dialog>` that sits between the key's target and the editor's root, such as an export dialog inside the editor. A key there belongs to the dialog, as it already did for text fields and controls. Before, `]` on a radio button in such a dialog could rotate an image.

`match` takes the editor's root as a new option, `match(event, { root })`, and otherwise uses the event's `currentTarget`. From a React handler, pass the synthetic event's `currentTarget`, `match(event.nativeEvent, { root: event.currentTarget })`, so shortcuts keep working when a host renders the editor inside its own modal dialog. `KeyboardEventLike` also gains an optional `currentTarget`, which DOM events already have.
