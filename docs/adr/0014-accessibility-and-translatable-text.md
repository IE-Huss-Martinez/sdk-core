# 0014. Accessibility and translatable text

- **Status:** Accepted
- **Date:** 2026-11-06

## Context

The SDKs are embedded in other people's products, so their accessibility becomes those products' accessibility, and their language becomes those products' language. Both are expensive to retrofit across many finished SDKs and cheap to build in from the start.

## Decision

### Accessibility

Target WCAG 2.2 level AA:

- **Keyboard:** every action works without a pointer. Drag-and-drop always has a keyboard alternative.
- **Focus:** focus is always visible, using the `--hm-focus-ring` token, and returns to a sensible place after dialogs and destructive actions.
- **Dialogs:** use the native `<dialog>` element with `showModal()`. That provides a focus trap, Escape to close, an inert background and top-layer stacking that host z-index and overflow rules can't break.
- **Announcements:** results of long operations are announced through a shared `aria-live` region, for example "Saved 1.3 MB".
- **Target sizes:** at least 24 × 24 CSS pixels, and 44 × 44 on coarse pointers.
- **Contrast:** built-in themes meet AA contrast. Custom themes are checked in development ([0006](0006-design-tokens-and-theming.md)).
- **Automated checks:** `@axe-core/playwright` runs in every end-to-end suite. Keyboard-only flows are tested explicitly.

### Translatable text

- **One message catalogue:** every visible string, accessible name and announcement comes from a typed English message catalogue in each SDK (`src/messages/en.ts`). Nothing user-visible is written inline in components.
- **Overrides:** hosts override any subset of messages with the `messages` prop. Messages can take parameters, and plural forms are handled with `Intl.PluralRules`.
- **Formatting:** numbers, file sizes and dates are formatted with `Intl`, using the editor's `locale`.
- **Shared helper:** `sdk-core` provides `createMessages`, so every SDK handles translation the same way.

## Alternatives considered

- **Adopting an i18n library such as i18next or FormatJS:** heavy for a component library, and it would impose the library on host applications. The helper needed is small.
- **English only:** limits adoption, and retrofitting means touching every component in every SDK.

## Consequences

- Hosts can fully translate and relabel every SDK.
- Authors must add every string to the catalogue. A lint rule rejects literal user-visible strings in JSX.
- Accessibility regressions fail the end-to-end suite rather than reaching users.
