---
"@hussmartinez/sdk-core": minor
---

Adds the `@hussmartinez/sdk-core/element` entry, for SDKs' custom elements:

- `createEditorElement({ kind, attributes, properties, methods, events, mount })` returns `define(tagName?)`, which registers `hm-<kind>-editor` and returns its class.
  - The element renders into the light DOM through the SDK's `mount`.
  - Properties set before the element was upgraded are applied.
  - Changes are batched into one `update` per microtask.
  - Moving the element keeps the editor; removing it unmounts the editor.
  - Methods throw `InvalidStateError` while the element is disconnected.
  - `dispatch` fires bubbling, composed `hm-<kind>-editor-<name>` events.
  - Importing the entry touches no browser API, and `define` throws `UNSUPPORTED_ENVIRONMENT` on a server.
- `adoptSharedStyleSheet({ name, version, cssText })` adopts a standalone script's styles once per page. It shares them with other standalone scripts on the same minor (or major, after 1.0), and warns when two lines meet.
