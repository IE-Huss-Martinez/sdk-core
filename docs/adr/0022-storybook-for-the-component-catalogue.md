# 0022. Storybook for the component catalogue

- **Status:** Accepted
- **Date:** 2026-11-10

## Context

`ui` needs a component catalogue. It's where components are developed in isolation, where every state can be reviewed, and where hosts see the theming that [ADR 0006](0006-design-tokens-and-theming.md) promises. `STANDARDS.md` named Ladle for it, but no ADR recorded that choice.

Ladle can no longer be used under the family's own rules:

- **It fails our supply-chain checks.** `@ladle/react@5.1.1` doesn't install with our pnpm settings: `trustPolicy: no-downgrade` rejects its dependency `chokidar@4.0.3` as a high-risk trust downgrade, a possible package takeover. Using Ladle would need an exception that weakens [ADR 0012](0012-hostile-input-and-no-network.md).
- **It's stale.** 5.1.1, released on 2025-11-04, is its latest version. It's pinned to Vite 6 and `@vitejs/plugin-react` 4, while the family builds with Vite 8. Its Vite 8 work has never been published.

Storybook 10 (`@storybook/react-vite` 10.6.6):

- supports Vite 5 to 8 and React 16 to 19;
- installs under our trust policy, at about 165 packages, and its only install script, esbuild's, can be denied explicitly;
- has an add-on for axe accessibility checks, and one that runs stories as tests in Vitest browser mode, which the family already uses;
- is widely used, at about 35 million weekly downloads against Ladle's half a million.

## Decision

- **Storybook 10,** with the React and Vite builder (`@storybook/react-vite`), is `ui`'s component catalogue.
- **Accessibility:** every story is checked with axe through the a11y add-on.
- **Stories are tests:** the Vitest add-on runs every story in Vitest browser mode, as part of the browser tests in `pnpm verify`, on the engines [ADR 0015](0015-verification-and-releases.md) requires.
- **Visual regression:** every component is rendered in all three themes and both densities (`data-hm-density`), as [ADR 0006](0006-design-tokens-and-theming.md) requires.
- **Install scripts stay denied by default** ([ADR 0012](0012-hostile-input-and-no-network.md)). esbuild's is denied explicitly, and Storybook needs no exception to the trust policy.

## Alternatives considered

- **Ladle, with a trust-policy exception:** rejected. It weakens ADR 0012 for a tool that's stuck on Vite 6.
- **No catalogue, tests only:** rejected. The catalogue is also the theming showcase that ADR 0006 asks for, and the place where hosts and reviewers see every state of a component.

## Consequences

- `ui` gets a catalogue, accessibility checks and story-based tests from one well-maintained tool, on the family's Vite and Vitest versions.
- Storybook is a heavier development dependency than Ladle. It's a devDependency of `ui` only, and never ships to users.
- Storybook's major versions have to be kept up to date, through Dependabot like any other dependency.
