# 0006. Design tokens and full theming

- **Status:** Accepted
- **Date:** 2026-11-06

## Context

All SDKs should look alike by default, but applications must be able to give them a completely different look: not just light or dark, but their own colours, shapes, typography, density and motion. That only works if no visual value is hard-coded anywhere.

## Decision

### Three levels of tokens

| Level | Purpose | Examples |
|---|---|---|
| Base | Raw scale values | `--hm-gray-50 … 950`, `--hm-space-1 … 12`, `--hm-radius-sm`, `--hm-duration-fast` |
| Semantic | Values by purpose; components use only these and component tokens | `--hm-color-bg`, `--hm-color-surface`, `--hm-color-text`, `--hm-color-accent`, `--hm-color-danger`, `--hm-focus-ring` |
| Component | Fine-grained overrides that fall back to semantic tokens | `--hm-button-radius`, `--hm-dialog-bg`, `--hm-pdf-thumb-radius` |

Token categories:

- colour;
- typography: families, sizes, weights, line heights, letter spacing;
- space;
- control and icon sizes;
- radius and border width;
- shadow;
- motion: durations and easings;
- z-index;
- opacity;
- focus ring.

### One source, generated outputs

Tokens are defined once, in TypeScript, in `ui`. The CSS custom properties, the theme types and the token reference documentation are generated from that source.

### Theming API

- **Built-in themes:** `light` and `dark`. The `system` mode follows `prefers-color-scheme` through CSS alone, so pages don't flash the wrong theme.
- **Attributes:**
  - `data-hm-theme="light|dark"` forces a theme on any subtree.
  - `data-hm-density="compact|comfortable"` scales spacing and control sizes.
- **Custom themes:**
  - `createTheme({ extends?, tokens })` returns a typed theme. `extends` is optional, so a theme can replace every token.
  - `<ThemeProvider theme={{ light, dark }} mode="system">` applies themes as custom properties, with no runtime styling library.
  - `themeToCss(theme, selector?)` produces a static stylesheet at build time, for zero-JavaScript theming and strict Content Security Policies.
- **Scoped themes:** tokens cascade, so a theme can apply to any subtree, and a page can show several themes at once.
- **Contrast checks:** `createTheme` warns in development when a theme's text or accent pairs fall below WCAG 2.2 AA contrast.

### What tokens don't cover

- **Icons:** replaced through the `icons` prop. They use `currentColor`, so they follow the theme's colours.
- **Fonts:** loaded by the application; tokens only name the family.
- **Structure:** customised through `classNames`, `unstyled` and the building blocks of each SDK.

## Alternatives considered

- **Light and dark only:** doesn't meet the requirement that applications can impose their own look.
- **A theme object read at runtime by components:** forces a React context into every style decision, doesn't reach the web component's shadow DOM, and causes a flash during server rendering. Custom properties cascade everywhere, including into shadow roots.

## Consequences

- Any visual difference between two applications can be expressed as token values.
- stylelint must reject literal colours, lengths, durations and other raw values outside token files, or the guarantee erodes.
- `ui` ships a deliberately unusual third demo theme. Visual regression tests render every component in all three themes, so a hard-coded value shows up immediately.
- Breakpoints can't be tokens, because custom properties don't work in media queries. That is one reason components use container queries.
