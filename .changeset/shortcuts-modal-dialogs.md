---
"@hussmartinez/sdk-core": patch
---

Shortcuts no longer fire for keys pressed inside a modal `<dialog>` that sits between the key's target and the element listening, such as an export dialog inside the editor. A key there belongs to the dialog, as it already did for text fields and controls. Before, `]` on a radio button in such a dialog could rotate an image. Shortcuts still work in an editor that is itself inside a host's modal dialog. `KeyboardEventLike` gains an optional `currentTarget`, which DOM events already have.
