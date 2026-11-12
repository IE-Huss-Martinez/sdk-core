---
"@hussmartinez/sdk-core": minor
---

Shared keyboard shortcuts for SDK editors (ADR 0030), from the root entry:

- **`createShortcutRegistry({ platform, tools })`** registers your tools' shortcuts and matches keyboard events to them:
  - **`match(event)`** works with DOM and React events and plain objects, and returns the tool id to run. Call it from a listener on the editor's root, never on `window`.
  - **It won't take keys that belong to something else.** It never fires in text fields unless a shortcut sets `inEditable`, never takes `Space`, `Enter` or arrows from focused buttons, links and other controls, and ignores IME input, handled events, and held-down keys unless a shortcut sets `repeat`.
  - **`Shift` is ignored for symbol keys,** so `+` and `0` work on every keyboard layout.
  - **Conflicting chords throw a `TypeError`** naming both tools.
  - **`ariaKeyShortcuts(id)` and `describe(id)`** give `aria-keyshortcuts` values and label parts. Label parts use new `keys.*` messages in `sdkCoreMessages`, so you can translate them.
- **`platformOf(navigator)`** gives `"apple"` or `"other"`. `Mod` means `Meta` on Apple platforms and `Control` elsewhere.
- **`familyShortcuts`** are the keys every SDK shares: undo, redo, delete, select all, zoom, cancel and play/pause. A tool takes them with `shortcuts: "undo"`. Zoom uses `+`, `-` and `0` without a modifier, leaving `Mod+=`, `Mod+-` and `Mod+0` to the browser's page zoom.
- **`defineTool`'s `shortcuts`** also accept chords with options, such as `{ keys: "Mod+S", inEditable: true }`.
