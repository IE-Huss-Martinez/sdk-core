# 0040. A shared custom-element base: `@hussmartinez/sdk-core/element`

- **Status:** Accepted
- **Date:** 2026-11-12
- **Refines:** [ADR 0004](0004-entry-points-and-module-format.md)'s `./element` and `./standalone` entries, applying [ADR 0007](0007-server-rendering-and-nextjs.md) and [ADR 0036](0036-ui-as-a-dependency-of-the-sdks.md)'s custom elements rule
- **Supersedes:** in `pdf-sdk`'s [ADR 0005](https://github.com/ie-huss-martinez/pdf-sdk/blob/main/docs/adr/0005-element-in-the-light-dom.md), the standalone script's own copy of `ui`'s styles

## Context

[ADR 0004](0004-entry-points-and-module-format.md) gives every SDK a `./element` entry, and `STANDARDS.md` promises `<hm-<kind>-editor>` elements. None exists: `pdf-sdk`'s and `audio-sdk`'s `src/element.ts` are empty stubs. `pdf-sdk`'s [ADR 0005](https://github.com/ie-huss-martinez/pdf-sdk/blob/main/docs/adr/0005-element-in-the-light-dom.md) specifies its element in detail: explicit registration, light DOM, attributes for strings and properties for the rest, the ref handle's methods, `hm-pdf-editor-*` events, and teardown on disconnect.

Every SDK's element would repeat the same mechanics, and they're easy to get subtly wrong:

- **Server rendering:** `class extends HTMLElement` at module scope throws where `HTMLElement` doesn't exist ([ADR 0007](0007-server-rendering-and-nextjs.md)).
- **Upgrades:** a property set on the element before its definition loads lands on the instance and shadows the class's setter, so the editor never sees it.
- **Moves:** moving an element in the DOM disconnects and reconnects it in the same task. Tearing down on every disconnect would destroy the session, its history and its workers.
- **Batching:** a host that sets five properties in a row should cause one render, not five.

`pdf-sdk`'s ADR 0005 also has its standalone script, the plain-HTML build that registers the element itself, bundle `ui`'s styles with its own into one adopted stylesheet. That contradicts [ADR 0036](0036-ui-as-a-dependency-of-the-sdks.md)'s one-copy rule: a page with two standalone SDKs would apply `ui`'s CSS twice, possibly from two versions.

The video agent proposed a framework-agnostic base in `sdk-core` that each SDK configures and gives its own React mount, so `sdk-core` stays free of React and safe to import on a server. [ADR 0036](0036-ui-as-a-dependency-of-the-sdks.md) then requires an element to render its `ui` components into the light DOM, or adopt the host's `ui` stylesheet into a shadow root, and never ship its own copy of `ui`'s CSS.

## Decision

`sdk-core` adds a `./element` entry with `createEditorElement(definition)`. It imports no React and touches no browser API until it's used.

### The definition

```ts
export const definePdfEditorElement = createEditorElement<PdfEditorProps, PdfEditorMethods>({
  kind: "pdf",
  attributes: { theme: "theme", locale: "locale", tools: { property: "tools", parse: parseList } },
  properties: ["file", "filePolicy", "assetsUrl", "messages", "engine", "processor"],
  methods: ["open", "export", "undo", "redo", "close"],
  events: ["change", "event", "error"],
  mount: (host, props, { dispatch }) => mountReactEditor(host, props, dispatch),
});
```

- **`kind`** names the default tag, `hm-<kind>-editor`, and the events, `hm-<kind>-editor-<event>`. Event names don't change when a host registers the element under another name, so listeners don't depend on the tag.
- **`attributes`** map observed attributes to props, for plain strings. An attribute may have a `parse` function, such as for a list of tools, and a removed attribute is `undefined`. Each also gets a property of the same name. Setting the property doesn't write the attribute, so the two can't loop.
- **`properties`** are props that only have a property: files, objects and functions.
- **`methods`** are forwarded to the handle that `mount` returns.
- **`events`** are the only names `dispatch` accepts.
- **`mount(host, props, { dispatch })`** renders the editor into `host` and returns `{ update(props), unmount(), handle }`. The SDK writes it, usually with React's `createRoot`. `sdk-core` never imports React.

### Registration

- **`createEditorElement` returns `define(tagName?)`.** Nothing happens on import or when `createEditorElement` runs. `define` builds the class the first time it's called, so `HTMLElement` is only read then, in a browser.
- **`define` registers the element and returns its class.** Each tag name gets its own class, because the registry accepts a class only once. Calling `define` again with a name it already registered returns that class. A name already taken by another class throws a `TypeError` naming it. Where `customElements` doesn't exist, as on a server, it throws `UNSUPPORTED_ENVIRONMENT` with `details.feature` ([ADR 0013](0013-browser-and-react-support.md)).

### Lifecycle

- **Mount on connect, synchronously,** so a method called right after the element is appended works. It mounts with the props from attributes and properties set so far, including properties set before the element was upgraded: the constructor re-applies those instance properties through the class's setters.
- **Updates are batched:** changes to attributes and properties schedule one `update(props)` in a microtask, with every prop's current value.
- **Unmount on disconnect, unless it's a move:** disconnecting schedules `unmount()` in a microtask, and reconnecting before then cancels it. So a move keeps the session, its history and its workers, and a removal tears them down, as `pdf-sdk`'s [ADR 0005](https://github.com/ie-huss-martinez/pdf-sdk/blob/main/docs/adr/0005-element-in-the-light-dom.md) requires.
- **Methods need a mounted element:** calling one while the element isn't connected throws an `InvalidStateError` `DOMException`, the platform's error for calling a method in the wrong state. Hosts call methods after appending the element.

### Events

`dispatch(name, detail)` fires a `CustomEvent` named `hm-<kind>-editor-<name>` on the element. It bubbles and is composed, so it reaches listeners outside any shadow root that contains the element, and it isn't cancelable. Its `detail` follows the family's privacy rule: no file names or contents ([ADR 0012](0012-hostile-input-and-no-network.md)). That's checked by each SDK's tests, because only the SDK knows its details.

### Light DOM, and styles from the host

- **The element renders into the light DOM.** It attaches no shadow root, and its children belong to the editor: `mount` replaces anything the host put inside it. So the host's one copy of `@hussmartinez/ui/styles.css` and the SDK's `styles.css` apply, exactly as in React ([ADR 0036](0036-ui-as-a-dependency-of-the-sdks.md)). Theming, `classNames`, `unstyled` and token overrides work the same for both, and focus, dialogs and accessible names behave as in the rest of the page.
- **The element brings no styles.** The host imports the stylesheets, as for React. An element that renders unstyled because they're missing still has its layout, roles and names, but [ADR 0036](0036-ui-as-a-dependency-of-the-sdks.md) makes `ui`'s stylesheet required, and each SDK's README says so.

### Standalone scripts share one `ui` stylesheet

A standalone script is for plain HTML pages, which import no stylesheet, so it brings its styles as constructed stylesheets in `document.adoptedStyleSheets`, confined as `pdf-sdk`'s ADR 0005 requires. `sdk-core/element` provides `adoptSharedStyleSheet({ name, version, cssText })` so every SDK does it the same way:

- **`ui`'s styles are adopted once per page.** Each standalone script contains `ui`'s CSS text, because it must work alone, but only the first to load adopts it. It registers the constructed sheet on `globalThis` under `Symbol.for("@hussmartinez/ui/styles@0.N")`, the `name` with the minor of `version`, and later scripts reuse it. A page with three standalone SDKs downloads the text three times and applies it once.
- **A different minor of `ui` is adopted alongside, with a warning.** Each script adopts the sheet for its own minor, because its components need their own CSS, and warns once on the console naming both versions. The warning isn't limited to development, unlike [ADR 0036](0036-ui-as-a-dependency-of-the-sdks.md)'s copy check, because a standalone script is a production build and has no development build to warn in.
- **Each SDK's own sheet is adopted once,** under its own key with its version, so loading the same script twice adds nothing.
- **Sharing is safe because a sheet doesn't change.** [ADR 0036](0036-ui-as-a-dependency-of-the-sdks.md) rejected sharing React context through `globalThis` as global mutable state. A constructed stylesheet is built once from fixed text, and nothing modifies it afterwards.
- **Standalone scripts aren't for pages that load the stylesheets themselves.** A page that links `ui`'s stylesheet should use `./element`. The standalone script can't tell a linked copy apart, so the page would apply `ui`'s CSS twice; each SDK's README says so.

This supersedes the part of `pdf-sdk`'s ADR 0005 that bundles `ui`'s styles into the SDK's own adopted stylesheet. Its confinement rules and the browser test that enforces them stay. `pdf-sdk` updates its ADR when it builds its element.

## Alternatives considered

- **Each SDK writes its own element:** the server, upgrade, move and batching rules above would be solved several times, differently.
- **A base class that SDKs extend:** subclassing `HTMLElement` at module scope is exactly what breaks server rendering, and a factory keeps each SDK's element down to data and a mount function.
- **Rendering into a shadow root and adopting the host's `ui` stylesheet:** allowed by [ADR 0036](0036-ui-as-a-dependency-of-the-sdks.md), but the element would need to find the host's stylesheet, `classNames` and `.hm-*` hooks would stop working from the host's CSS, and the React editor and the element would style differently. `pdf-sdk`'s [ADR 0005](https://github.com/ie-huss-martinez/pdf-sdk/blob/main/docs/adr/0005-element-in-the-light-dom.md) rejected it for the same reasons.
- **A library such as Lit:** it brings its own rendering and reactive model, which the SDKs don't need. They render with React, and the element only bridges attributes, properties, methods and events.
- **Each standalone script adopting its own copy of `ui`'s styles,** as `pdf-sdk`'s ADR 0005 planned: simple, but it breaks the one-copy rule on any page with two SDKs.
- **A separate `ui` standalone stylesheet script that hosts load first:** one copy by construction, but plain-HTML hosts would need two tags in the right order, which is exactly what a standalone script is meant to avoid.
- **Methods that wait until the element is connected:** convenient, but a call on an element that's never appended would never settle.

## Consequences

- An SDK's element is a definition and a mount function. The image SDK starts with one, and `pdf-sdk` and `audio-sdk` replace their stubs before shipping `./element`.
- `sdk-core` gains its second entry point, with its own API report and a build test that importing it touches no browser API. With more than one entry point, its `check:api` runs `hm-check-api-reports` ([ADR 0033](0033-api-reports-for-several-entry-points.md)).
- Plain-HTML pages with several standalone SDKs apply one copy of `ui`'s styles per `ui` minor, and a mismatch is visible on the console.
- `pdf-sdk` updates its ADR 0005 when it builds its element, to point here for the standalone styles.
