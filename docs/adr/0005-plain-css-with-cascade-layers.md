# 0005. Plain CSS with cascade layers

- **Status:** Accepted
- **Date:** 2026-11-06

## Context

SDK styles are shipped into host pages with their own CSS, frameworks and specificity habits. Hosts must be able to override any SDK style easily, and SDK styles must never leak onto the host page. With many SDKs on one page, shared styles shouldn't be loaded once per SDK.

## Decision

Write styles in plain CSS, organised as follows:

- **One layer order**, declared by `ui`:

  ```css
  @layer hm.tokens, hm.base, hm.components, hm.sdk;
  ```

  `ui` writes tokens, base styles and shared components into the first three layers; SDKs write into `hm.sdk`. A host's unlayered CSS always beats layered CSS, so hosts override SDK styles without `!important` or specificity tricks.
- **No global selectors:** nothing styles `html`, `body`, `*` or bare elements. Base styles apply only inside an editor or component root.
- **Values from tokens:** every visual value comes from a design token ([0006](0006-design-tokens-and-theming.md)), enforced by stylelint.
- **Container queries** rather than viewport media queries, so components adapt to the space the host gives them.
- **Reduced motion:** every animation has a reduced-motion fallback.
- **No fonts are fetched.** Font families come from tokens and default to the system font stack. Applications load their own font files.

## Alternatives considered

- **Tailwind CSS:** excellent for applications, but in a library its preflight reset would restyle the host page and must be disabled. Its utility classes can collide with a host's own Tailwind build, so a prefix is required, and then each SDK ships its own copy of the same utilities. Hosts also can't override markup built from utility classes. It also adds a build step to every repository.
- **CSS Modules:** hashed class names can't be targeted by hosts.
- **CSS-in-JS at runtime:** adds bundle weight and runtime cost, complicates server rendering, and conflicts with strict Content Security Policies.

## Consequences

- SDK CSS is small, readable and predictable, and hosts can override any part of it.
- Applications using Tailwind can still style SDKs through the `classNames` prop and tokens ([0006](0006-design-tokens-and-theming.md)).
- Authors write a little more CSS by hand than with utility classes.
