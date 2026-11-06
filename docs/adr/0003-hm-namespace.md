# 0003. The `hm` namespace for everything that reaches the page

- **Status:** Accepted
- **Date:** 2026-11-06

## Context

The SDKs render into pages we don't control. Class names, custom properties, custom element names, DOM events and data attributes are global to that page.

Generic prefixes are the most likely to collide:

- `.image` is a global class in Bulma.
- Many sites already define `.video-player`, `.audio-controls` or `.pdf-viewer`.
- `<pdf-editor>` and `<image-editor>` are plausible names for other libraries' custom elements, and a page can register each name only once.

Collisions break both sides: a host rule restyles our editor, or ours restyles the host.

## Decision

Everything an SDK or `ui` puts into the page is prefixed with `hm-` (or `--hm-` and `hm.` where the syntax requires):

| What | Pattern | Example |
|---|---|---|
| Editor root class | `.hm-<kind>-editor` | `.hm-pdf-editor` |
| SDK class | `.hm-<kind>-<part>` | `.hm-pdf-toolbar` |
| Shared `ui` class | `.hm-<part>` | `.hm-button`, `.hm-dialog` |
| Variant | `.hm-<part>--<variant>` | `.hm-button--primary` |
| Custom property | `--hm-*` | `--hm-color-accent`, `--hm-pdf-thumb-radius` |
| Cascade layer | `hm` and its sublayers | `@layer hm.components` |
| Custom element | `<hm-<kind>-editor>` | `<hm-pdf-editor>` |
| DOM event | `hm-<kind>-editor-<name>` | `hm-pdf-editor-change` |
| Data attribute | `data-hm-*` | `data-hm-theme`, `data-hm-state` |

States use ARIA attributes first, such as `[aria-pressed="true"]` or `[aria-busy="true"]`, because they also inform assistive technology. Where ARIA has nothing suitable, use a `data-hm-*` attribute. Generic state classes such as `.is-active` are not allowed, because frameworks like Bulma style them globally.

JavaScript and TypeScript names, such as `PdfEditor` and `createTheme`, are not prefixed. They are imported explicitly and can't collide.

## Alternatives considered

- **Bare kind prefixes (`.pdf-`, `.image-`):** collide with common host class names, as above.
- **CSS Modules or hashed class names:** collision-free, but hosts can no longer target parts of the editor for overrides.
- **Shadow DOM for every surface:** isolates styles, but React users render into the light DOM, and theming across a shadow boundary is limited to custom properties and `::part()`.

## Consequences

- A page can mix several SDKs and its own CSS without conflicts.
- Class names are longer.
- A stylelint rule in `sdk-config` rejects selectors, custom properties and layers without the prefix, so the rule is enforced rather than remembered.
