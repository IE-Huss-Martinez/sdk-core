# 0048. Visual regression tests for every SDK's editor

- **Status:** Accepted
- **Date:** 2026-11-14
- **Refines:** [0039](0039-test-applications-in-each-repository.md), by adding screenshots to the end-to-end suite; follows `ui`'s ADR 0002 and ADR 0004

## Context

`ui` compares every story with committed screenshots, in a pinned container (`ui`'s ADR 0002 and ADR 0004). The SDKs' editors compose `ui`'s components with their own layout and styles ([ADR 0036](0036-ui-as-a-dependency-of-the-sdks.md)): panels, canvases, toolbars and dialogs that no story renders. A token used in the wrong place, a panel that overflows in compact density, or a dark theme that loses a border passes every functional and axe test, and nobody sees it until a host does.

`ui`'s approach transfers, but not its harness. `ui` renders stories with Vitest's browser mode. The SDKs' editors are tested end to end with Playwright Test against their built example pages ([ADR 0039](0039-test-applications-in-each-repository.md)), which is also where a host would see them: built, with `ui`'s stylesheet and then the SDK's, and for the element, through its standalone styles ([ADR 0040](0040-editor-element-base.md)).

## Decision

### Scope

- **Every SDK's React editor, in each of its designed states,** on the built Vite example, as the end-to-end suite runs it. Each SDK lists its states in its visual spec. At least:
  - empty;
  - a file open;
  - each panel and tool mode;
  - each dialog open;
  - an error;
  - right-to-left and long text, once the SDK supports them.
- **The element, empty and with a file open.** It renders the same React editor, so the remaining states would repeat its screenshots. What differs is how its styles arrive, and these two states show it.
- **Each screenshot is the whole viewport,** so dialogs and popovers in the top layer are included.

### Themes and densities

- **Light and dark, each in compact and comfortable density,** set with `data-hm-theme` and `data-hm-density` on the page's root ([ADR 0006](0006-design-tokens-and-theming.md)). Density changes spacing and control sizes, so each density gets its own screenshots.
- **No custom themes:** `ui`'s Poster theme already proves that its components follow the tokens, and the editors are built from those components.

### Engine

- **Chromium only,** inside the pinned browser test image ([ADR 0025](0025-one-browser-test-image-in-one-place.md)). Screenshots catch layout and token mistakes, which don't depend on the engine. Three engines would triple the baselines for little extra signal, and engines' font rasterising differs too much to share baselines.
- **Firefox and WebKit stay covered** by the functional and axe tests, which keep running on all three engines.

### Determinism

- **One environment:** the browser test image, whose fonts, font rendering and Chromium build are pinned by digest. A separate Playwright configuration, `e2e/playwright.visual.config.ts`, refuses to run outside it, so baselines can't be written anywhere else.
- **Fixed page:**
  - a 1280 × 800 viewport and a device scale factor of 1;
  - the `en-US` locale and the `UTC` time zone;
  - reduced motion, with animations and transitions disabled and carets hidden, as Playwright's `toHaveScreenshot` does by default;
  - the clock fixed with Playwright's `page.clock`, so dates and durations render the same on every run.
- **Fixed fixtures:** committed files, the same ones the end-to-end tests use where they fit. Nothing is generated at random.
- **No network:** as in the end-to-end suite, any request to another origin fails the test ([ADR 0012](0012-hostile-input-and-no-network.md)). Fonts come from the image or the SDK's own assets.
- **Masks for content that varies by nature:** a decoded video frame whose exact frame depends on timing, or a time measured during the run, is masked with Playwright's `mask` option. Masks are listed next to the state they belong to, and a masked region never covers the whole editor.
- **No tolerance by default:** `maxDiffPixelRatio` is `0`, as in `ui`. The pinned image renders identically on every machine, which `ui`'s baselines confirm, and any tolerance hides real changes, such as a 1 px border that moved.
- **A small tolerance only where a codec isn't exact:** a state whose subject is a frame drawn by a browser codec, and which can't be masked because that frame is what it shows, may set `maxDiffPixelRatio` up to `0.001` on its own assertion. That's about 1,000 pixels of a 1280 × 800 viewport: enough for a codec's dithering, and less than a 1 px line across the editor. A comment names the cause.

### Baselines and workflow

- **Baselines are committed,** under `e2e/visual/__screenshots__/<spec>/`, named `<state>-<theme>-<density>-chromium-linux.png`, as `ui` names them.
- **`pnpm test:visual` compares and `pnpm test:visual:update` rewrites,** both through a script that runs them in the image, as `ui`'s does. Without Docker, it fails with a one-line message saying how to fix it; it never skips.
- **An intentional visual change commits its new screenshots in the same pull request.** The reviewer looks at every changed image, and a pull request whose screenshots change without a reason in its description isn't merged.
- **Stale baselines are removed:** the update deletes screenshots that no state produces any more, so a removed state doesn't leave files behind.
- **Failures upload their diffs:** when verify fails in CI, the expected, actual and diff images are uploaded as a short-lived workflow artifact, so the reviewer sees the change without running it. They show only committed fixtures.

### Where it runs

- **In `pnpm verify`,** as `pnpm test:visual` after `pnpm test:e2e`, which has built the examples. A few dozen screenshots of one page take seconds. A separate check would let a reviewer's local verify pass while CI fails, which `ui`'s ADR 0002 rejected for the same reason.
- **In CI, inside the verify job,** which already runs in the browser test image. The job sets `HM_VISUAL_CONTAINER=1`, as `ui`'s does, so the script runs the tests directly.
- **If it outgrows that,** for example past two minutes in CI, a new ADR moves it to its own required check. Until then, one check is simpler.

### Shared tooling

The same harness would otherwise be copied into five repositories, which [ADR 0039](0039-test-applications-in-each-repository.md) reserves for `sdk-config`:

- **`sdk-config`** provides the visual Playwright preset, with the viewport, locale, clock, `toHaveScreenshot` options, baseline paths and the guard against running outside the image, and an `hm-test-visual` command that runs it in the image with `--update`, and removes stale baselines.
- **`sdk-ci`'s verify action** uploads the end-to-end and visual results when verify fails.

Both come in their own pull requests, before the first SDK adopts this.

### Adoption

Each SDK adopts this in its own pull request, with its states listed in its visual spec, in this order: `image-sdk`, `video-sdk`, `audio-sdk` once its editor exists, `pdf-sdk`, `learn-sdk`.

## Alternatives considered

- **Reuse `ui`'s Vitest harness:** the editors are tested on their built example pages with Playwright Test, and a second runner would render them differently from how a host does.
- **Screenshots in CI only:** a reviewer's local `pnpm verify` would skip them, so a review could pass while CI fails.
- **All three engines:** three times the baselines, for mistakes that don't depend on the engine.
- **The element in every state:** it would repeat the React editor's screenshots, because it renders the same editor.
- **A default tolerance, such as 1 %:** about 10,000 pixels of the viewport, which hides a moved border or a wrong colour on a button.
- **A hosted visual testing service:** it sends screenshots to a third party, costs money, and needs secrets in pull request workflows.

## Consequences

- A visual change to an editor shows up as image diffs in its pull request, and every machine agrees on them.
- Contributors to an SDK need Docker, as they already do for `ui`. The first run downloads the image, about 2 GB.
- Each designed state costs four screenshots, and its list in the SDK's spec is the record of what the editor is meant to look like.
- Updating Playwright's image may change screenshots. Its Dependabot pull request then fails, and someone regenerates the baselines in it after checking the diffs.
