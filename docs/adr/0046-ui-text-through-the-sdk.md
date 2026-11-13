# 0046. `ui`'s text through the SDK's messages

- **Status:** Accepted
- **Date:** 2026-11-13
- **Refines:** [ADR 0019](0019-message-catalogues.md) and [ADR 0036](0036-ui-as-a-dependency-of-the-sdks.md), by making a host's overrides reach the text of `ui`'s components inside an SDK

## Context

[ADR 0019](0019-message-catalogues.md) gives each SDK a typed English catalogue, which every SDK extends with `sdkCoreMessages`. Hosts override any of its text through the SDK's `messages` prop, for their locale. Since [ADR 0036](0036-ui-as-a-dependency-of-the-sdks.md), SDKs render `ui`'s components, and some of those have text of their own, from `uiMessages`: `FileDropZone`'s "Choose a file", `Dialog`'s "Close", and the default labels of `Spinner` and `ProgressBar`. They read it from `UiMessagesProvider`, and fall back to English without one.

`pdf-sdk`'s editor builds two `Messages` objects today:

- **Its own text:** `pdfMessages`, with the host's locale and overrides.
- **`ui`'s text:** a separate catalogue of `sdkCoreMessages` and `uiMessages`, with the locale only, passed to `UiMessagesProvider`.

So a host that translates the editor through `messages` can't translate `ui`'s strings in it: they stay English in a German editor. That gets worse as SDKs adopt `FileDropZone` and `Dialog`. A host's own `UiMessagesProvider` doesn't help either, because the SDK's provider is closer to the components and wins.

`ui` already supports a single object: its README says `UiMessagesProvider` takes "an sdk-core `Messages` object whose catalogue includes `uiMessages`". A `Messages` object for a catalogue that spreads `uiMessages` type-checks as `UiMessages`.

## Decision

### One catalogue, one `Messages` object, one provider

- **Every SDK that renders `ui`'s components spreads `uiMessages` into its catalogue,** next to `sdkCoreMessages`, as [ADR 0019](0019-message-catalogues.md) already requires for `sdkCoreMessages`:

  ```ts
  export const pdfMessages = defineMessages({ ...sdkCoreMessages, ...uiMessages, ...pdfOwnMessages });
  ```

- **The SDK creates one `Messages` object** from that catalogue, with the host's locale and overrides, and passes the same object to `UiMessagesProvider` around everything it renders. It never creates a second, `ui`-only object.
- **Hosts override `ui`'s strings through the SDK's `messages` prop,** like the SDK's own, typed against the SDK's catalogue. `"fileDropZone.choose"` is as overridable as `"editor.start.title"`, and a translation JSON file covers both.
- **A host's own `UiMessagesProvider` only reaches the host's own `ui` components.** Inside an SDK, the SDK's provider applies. This is deliberate: an SDK's text is set in one place, its `messages` prop.

### Keys don't collide

Spreading catalogues means a later key silently replaces an earlier one, so an SDK could hide one of `ui`'s strings, or a later `ui` release could take one of the SDK's.

- **`ui`'s keys keep component-name prefixes,** such as `dialog.`, `fileDropZone.`, `progress.` and `spinner.`, plus `errors.` for its own error codes. A new `ui` key uses its component's name.
- **Every SDK tests that its own keys don't overlap `sdkCoreMessages` or `uiMessages`.** A `ui` or `sdk-core` bump that would collide then fails in the SDK's pull request, rather than silently changing text. SDKs' own keys use their surface's or the SDK's prefixes, such as `editor.`, `toolbar.` and `tools.`, and never a `ui` component's name.

## Alternatives considered

- **The SDK reads the host's `UiMessagesProvider` and merges it with its own:** `Messages` objects can't be merged, and two locales could disagree. It would also give the SDK's text two sources.
- **A separate `uiMessages` prop on each SDK:** a host would maintain two override sets and two locales for one editor, and translation files would split along an implementation detail.
- **Namespacing all of `ui`'s keys under `ui.`:** it would prevent collisions by construction, but it breaks every existing override of `ui`'s keys. The collision test catches the same problem without a breaking change.

## Consequences

- A host translates an SDK's whole interface, `ui`'s strings included, through one `messages` prop and one JSON file.
- An SDK's catalogue type grows by `ui`'s keys, which is a few strings per component.
- **Follow-up work:**
  - `pdf-sdk`: spread `uiMessages` into `pdfMessages`, pass the editor's single `Messages` object to `UiMessagesProvider`, drop the separate `ui` catalogue in `PdfEditor`, and add the collision test.
  - Other SDKs do the same before they render `FileDropZone` or `Dialog`.
  - `ui`: its README's "Using ui from an SDK" section describes this.
  - `sdk-core`: overrides typed as `MessageOverrides<Catalogue>` don't type-check as `createMessages`'s `overrides` option under `exactOptionalPropertyTypes`. `pdf-sdk` casts them (`overrides as never`), and a typed check of this ADR's pattern hit the same error. The option's type should accept `MessageOverrides<Catalogue>` as is.
