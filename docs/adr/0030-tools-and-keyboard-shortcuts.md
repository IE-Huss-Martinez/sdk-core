# 0030. Tools and keyboard shortcuts

- **Status:** Accepted
- **Date:** 2026-11-12
- **Refines:** [ADR 0009](0009-features-as-tools.md), by defining `defineTool`, the tool registry and the shared shortcut registry it names

## Context

[ADR 0009](0009-features-as-tools.md) makes every feature a tool registered with `defineTool` from `sdk-core`, builds toolbars, menus and shortcuts from the registered tools, and turns the `tools` and `toolbar` props into plain data. `STANDARDS.md` promises shortcuts that are consistent across SDKs, through a shared registry. Neither exists yet:

- **`pdf-sdk`** has reached its editor shell, with an empty toolbar slot, and its thumbnails handle their own keys.
- **The audio SDK** needs the same tools and shortcuts from the start, plus playback: Space to play and pause.

If each SDK writes its own, `Mod+Z` might mean undo in one and nothing in another, and each would get keyboard handling subtly wrong in its own way. Three things are easy to break: a shortcut stealing keys from a text field, Space firing while a button is focused, and an editor taking over the browser's page zoom.

## Decision

`sdk-core`'s root entry adds `defineTool`, `createToolRegistry` and `createShortcutRegistry`. They're headless: no React, no DOM imports, and tree-shakeable. A configuration mistake throws `TypeError`, as `sdk-core`'s other configuration checks do. It's a developer's error, not a user's, so it gets no `SdkError` code.

### `defineTool(definition)`

Returns the definition, checked and frozen. It has:

- **`id`:** `<sdk>.<tool>`, lowercase, such as `pdf.rotate-left` or `audio.split`. Unique across the registry.
- **`label`:** a message key ([ADR 0014](0014-accessibility-and-translatable-text.md)), never text.
- **`icon`:** the name of an icon from `ui`'s icon set.
- **`group`:** the toolbar group it belongs to by default, such as `history`, `pages` or `playback`.
- **`requires`:** the capabilities it needs, such as `encryption` or `webaudio`. Without one, the tool is left out, as [ADR 0009](0009-features-as-tools.md) requires.
- **`isAvailable(state)`:** whether to show the tool now. **`isEnabled(state)`:** whether it can run now; a disabled tool stays visible, with `aria-disabled`. **`isActive(state)`:** for toggles, shown with `aria-pressed`. All three are optional and pure.
- **`run(context)`:** what the tool does. The SDK defines its context, such as the session and the selection.
- **`shortcuts`:** the tool's key chords, or the name of a family action, such as `"undo"`, to take the family's keys for it.
- **`view`:** optional and opaque to `sdk-core`. It's the SDK's own UI contribution, such as a React component for a panel, which only its React layer reads.

### `createToolRegistry(tools, { tools, toolbar, capabilities })`

It turns the editor's props into resolved, ordered data:

- **`tools`:** which tools are present, in order. By default, all of them, in definition order.
- **`toolbar`:** the toolbar's groups, as arrays of tool ids, such as `[["pdf.undo", "pdf.redo"], ["pdf.rotate-left", "pdf.rotate-right"]]`. By default, the present tools are grouped by their `group`, in order of first appearance.
- **`capabilities`:** which capabilities are on. Tools that need a missing one are left out.
- **It fails fast:** an id in `tools` or `toolbar` that no tool has, or two tools with the same id, throws a `TypeError` naming them.
- **It returns** the present tools, the toolbar groups, and `get(id)`.

### `createShortcutRegistry({ platform })`

- **Chords** are written like `Mod+Shift+Z`, `Delete` or `Space`. `Mod` is `Meta` on Apple platforms and `Control` elsewhere. The SDK passes `platform` (`"apple"` or `"other"`), which `platformOf(navigatorLike)` derives, so the registry itself never reads `navigator`.
- **Conflicts:** registering a chord that another tool already has, on the same platform, throws a `TypeError` naming both tools.
- **`match(eventLike)`** returns the id of the tool a keyboard event triggers, or `undefined`. It reads only `key`, `code`, the modifier flags, `repeat`, `isComposing`, `defaultPrevented` and the event's `target`, which it inspects by duck typing. So it works with DOM and React events, and in tests, without importing the DOM. Its rules:
  - **Ignored:** events that are already handled (`defaultPrevented`), that are part of an IME composition (`isComposing`), or that repeat because a key is held down, unless the shortcut allows repeats.
  - **`Control`, `Meta` and `Alt` must match exactly.** Letters match case-insensitively, and match `Shift` exactly too, so `Mod+Z` isn't `Mod+Shift+Z`.
  - **Letters follow the printed Latin letter, then the physical key.** When `key` is a Latin letter, it decides, so remapped Latin layouts such as Dvorak and AZERTY follow their letters. When it isn't, as on Cyrillic, Greek, Hebrew or Arabic layouts, or when Option on macOS turns a letter into a symbol, the physical key (`code`) decides, so `Ctrl+Z` is still undo.
  - **`Shift` is ignored when a chord's key is a printable character other than a letter,** because `Shift` may be what produced the character. On a US layout, `+` is `Shift` and `=`, and on AZERTY every digit needs `Shift`. So `+` matches `{ key: "+", shiftKey: true }`, and `0` matches `{ key: "0", shiftKey: true }`. The shortcut registry's tests cover both.
  - **The target comes from the composed path.** A field inside a shadow root, such as in a web component, is retargeted to its host, so the registry classifies the first element of `composedPath()` when the event has one, and `target` otherwise.
  - **Fields keep their keys:** in an editable target (a text input, `textarea`, `select` or `contenteditable`), no shortcut fires unless it opts in with `inEditable`. `Mod+Z` in a text field is that field's own undo.
  - **Controls keep their keys:** on a button, link, checkbox, switch, menu item, tab or slider, unmodified `Space`, `Enter` and arrow keys belong to the control, so those shortcuts don't fire. Space on a focused button presses the button; it doesn't toggle playback.
- **The editor listens on its own root, never on `window`,** so shortcuts only apply while focus is inside it. This is an accessibility requirement, not a style choice: it's what lets the family's single-character shortcuts meet WCAG 2.1.4 (see "Family shortcuts"). It calls `preventDefault` only for an event it handles.
- **`ariaKeyShortcuts(id)`** returns the tool's chords for `aria-keyshortcuts`, such as `Meta+Z` or `Control+Z Control+Y`.
- **`describe(id)`** returns each chord as modifier and key parts. The SDK renders them as labels from messages: `sdkCoreMessages` adds `keys.*` messages, such as `⌘` on Apple platforms and `Ctrl` elsewhere, so labels can be translated ([ADR 0014](0014-accessibility-and-translatable-text.md)).

### Family shortcuts

These are the same in every SDK. A tool takes them with `shortcuts: "<action>"`.

| Action | Keys | Notes |
|---|---|---|
| `undo` | `Mod+Z` | |
| `redo` | `Mod+Shift+Z`, and `Control+Y` on other platforms | |
| `delete` | `Delete`, `Backspace` | Never in fields |
| `select-all` | `Mod+A` | A field selects its own text |
| `zoom-in`, `zoom-out`, `zoom-reset` | `+` and `=`, `-`, `0` | **No modifier:** see below |
| `cancel` | `Escape` | Dialogs and menus handle it first, and mark it handled |
| `play-pause` | `Space` | Never on fields or controls, never on repeat |

**The editor never takes `Mod+=`, `Mod+-` or `Mod+0`.** Those are the browser's page zoom, which people with low vision depend on (WCAG 1.4.4). The editor's own zoom uses the same keys without a modifier, while focus is in the editor.

**Single-character shortcuts are active only while the editor has focus.** `+`, `=`, `-` and `0` are character-key shortcuts under WCAG 2.1.4 (Level A), which speech-input and keyboard users can trigger by accident. They meet it through the criterion's exception for shortcuts that are active only when the component has focus. The registry fires only from events inside the editor's root, and never in fields. `Space` isn't a character key under 2.1.4, but the same scoping keeps it from taking over the page.

## Alternatives considered

- **Each SDK writes its own:** shortcuts would differ between SDKs, and the hard parts would be solved several times, differently.
- **A keyboard library, such as `tinykeys` or `hotkeys-js`:** small, but they bind to the DOM, mostly on `window`, and don't know the family's rules for fields, controls and page zoom. Those rules are most of the work.
- **Shortcuts in `ui` instead of `sdk-core`:** `ui` is React, but sessions, tool availability and the element wrapper need shortcuts without React. `ui` renders the labels from `describe`.
- **The browser's zoom keys for the editor's zoom, as many document viewers do:** it would block page zoom while focus is in the editor.

## Consequences

- Every SDK gets the same shortcuts, accessible names (`aria-keyshortcuts`) and translatable labels, and the field, control and zoom rules are tested once.
- **Listening on the editor's root, never on `window`, is required for accessibility.** The single-character zoom shortcuts meet WCAG 2.1.4 only because they're active only while the editor has focus. An SDK that bound the registry to `window` would break that criterion.
- Hosts configure tools with plain data, and an unknown or misspelled id fails when the editor is created, not silently.
- `pdf-sdk`'s thumbnails keep their own arrow-key navigation, a widget's internal keys, and move undo, delete and selection to the registry.
- These become public API of `@hussmartinez/sdk-core`, and `sdkCoreMessages` gains the `keys.*` messages.
