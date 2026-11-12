# 0036. `@hussmartinez/ui` as a dependency of the SDKs

- **Status:** Accepted
- **Date:** 2026-11-12
- **Refines:** [ADR 0004](0004-entry-points-and-module-format.md), [ADR 0005](0005-plain-css-with-cascade-layers.md) and [ADR 0017](0017-core-errors-and-shared-runtime-imports.md), by settling how an SDK depends on `ui`'s components and how hosts load their styles

## Context

Until now, the SDKs have used `ui` only through its stylesheet: `pdf-sdk`'s README tells hosts to import `@hussmartinez/ui/styles.css` before the SDK's, for the tokens. `pdf-sdk`'s toolbar is the first SDK code to import `ui`'s components, such as `Toolbar`, `ToggleButton` and `Slider`, and the audio, image and video SDKs will follow. The existing records leave four questions open:

- **The dependency type.** [ADR 0004](0004-entry-points-and-module-format.md) and [ADR 0013](0013-browser-and-react-support.md) make `react` and `react-dom` optional peers, so headless users of an SDK's `.` entry install no UI framework. `ui` needs a place in `package.json` that keeps that true.
- **One copy.** `ui` keeps state in React context: `UiMessagesProvider`, `AnnouncerProvider`, `ThemeProvider`, `Field` and `Toolbar`. If an application and an SDK resolve different copies, a provider from one copy doesn't reach components from the other. Nothing fails: the SDK's controls fall back to English, and its announcements go nowhere.
- **One stylesheet.** [ADR 0005](0005-plain-css-with-cascade-layers.md) has `ui` declare the layer order and SDKs write into `hm.sdk`. It doesn't say whether an SDK's stylesheet may include `ui`'s, and a host using two SDKs could load `ui`'s CSS three times.
- **Which stylesheet is required.** Without `ui`'s stylesheet, an SDK surface keeps its layout and loses its looks. That stops being true once it renders `ui`'s components: their focus rings and minimum target sizes live in `ui`'s CSS, so leaving it out breaks [ADR 0014](0014-accessibility-and-translatable-text.md)'s guarantees.

## Decision

### A regular dependency, imported only by the UI layers

- **Every SDK lists `@hussmartinez/ui` in `dependencies`,** with a caret range on the current minor, `^0.N.0` during `0.x`.
- **Only `features/`, `react/` and `element/` import it.** The core never does ([ADR 0017](0017-core-errors-and-shared-runtime-imports.md)). Neither do `adapters/` and `workers/`, nor anything the `.` entry reaches.
- **The `dependency-cruiser` preset in `sdk-config` enforces it.** Its `core-no-ui` rule covers `core/` today. A follow-up in `sdk-config` extends it to `adapters/` and `workers/`, and adds a rule that nothing reachable from the `.` entry module imports `@hussmartinez/ui`, `react` or `react-dom`.
- **Headless users** install `ui` but bundle none of it. `ui` is small, its only dependency is `@hussmartinez/sdk-core`, which every SDK already depends on, and its `react` and `react-dom` peers are optional, so a headless install shows no peer warnings.

### One copy of `ui` in an application

- **The same minor.** Each SDK release depends on the `ui` minor that is current when it's released. A `ui` bump to a new minor is merged in each SDK before that SDK's next release, with a `minor` changeset that names the `ui` version, because applications that use `ui` directly must move with it.
- **Applications** that use `ui` themselves depend on the same minor as their SDKs. Each SDK's README says so and gives the check: `npm ls @hussmartinez/ui` lists one version.
- **A warning in development.** `ui` warns once when a second copy of it is used on the same page, naming both versions. Each copy registers itself under a `Symbol.for` key on `globalThis` on its first use, never on import ([ADR 0004](0004-entry-points-and-module-format.md), [ADR 0007](0007-server-rendering-and-nextjs.md)), and compares module identity, so two installs of the same version are caught too. Production builds drop the check.

### One stylesheet, always loaded

- **SDK stylesheets never include `ui`'s.** An SDK's `styles.css` declares the layer order, so it holds whichever stylesheet loads first, and contains only its own `hm.sdk` rules. It never bundles `ui`'s CSS or `@import`s it.
- **Hosts import `@hussmartinez/ui/styles.css` once,** before the SDKs' stylesheets. A host with several SDKs loads one copy of `ui`'s CSS.
- **`ui`'s stylesheet is required** for every SDK surface that renders `ui`'s components. Their focus rings and target sizes are accessibility requirements, not looks. Each SDK's README says so in its first example, rather than describing the stylesheet as optional.

### Custom elements

`./element` entries aren't built yet; `sdk-core` is designing a shared `@hussmartinez/sdk-core/element` with a mount callback. Whatever it becomes, an element must either render its `ui` components into the light DOM, where the host's one copy of `ui`'s stylesheet applies, or adopt that stylesheet into its shadow root. An element must not ship its own copy of `ui`'s CSS. The element ADR chooses between the two.

## Alternatives considered

- **`ui` as a peer dependency of each SDK:** this guarantees one copy, because the application installs it. But every React user would have to add it by hand, and a non-optional peer would warn for headless users. An optional peer is easy to forget, and the editor then fails at runtime instead of at install.
- **Bundling `ui` into each SDK's build:** this gives every SDK its own private copy, which is exactly the two-copies problem, made permanent. It also duplicates `ui`'s code in every application with more than one SDK.
- **SDK stylesheets that `@import` `ui`'s:** this is convenient for single-SDK hosts, but a host with two SDKs, or one that also uses `ui` directly, loads `ui`'s CSS several times. Bundlers also resolve package imports in CSS inconsistently.
- **Sharing context across copies through `globalThis`:** contexts registered under `Symbol.for` keys would work even with two copies. But their values would still come from different versions of `ui`, which may disagree about props and messages, and every context would become global mutable state. One copy, checked in development, is simpler and safer.

## Consequences

- SDKs can build their toolbars and panels from `ui`'s accessible components, and hosts configure text, theme and announcements once, for `ui` and every SDK.
- `ui`'s minor releases now set the pace for the SDKs during `0.x`: a `ui` minor means a release of each SDK that wants it. That's the price of one copy, and it ends with `ui` 1.0, when caret ranges allow any later minor.
- **Follow-up work:**
  - `sdk-config`: extend `core-no-ui` and add the `.` entry rule.
  - `ui`: the duplicate-copy warning, and a README section on using `ui` from an SDK.
  - `pdf-sdk`: its README currently says the editor "keeps its layout and stays usable" without `ui`'s stylesheet. Its toolbar pull request, the first to render `ui`'s components, changes that line to say the stylesheet is required.
  - The element ADR applies the custom elements rule above.
