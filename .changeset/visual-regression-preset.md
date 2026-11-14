---
"@hussmartinez/sdk-config": minor
---

Add visual regression testing for SDK editors (sdk-core ADR 0048).

- `@hussmartinez/sdk-config/testing/visual` exports `defineVisualConfig({ baseURL, webServer })`, the Playwright configuration for `e2e/playwright.visual.config.ts`: Chromium in a fixed 1280 × 800 page with `en-US`, `UTC` and reduced motion, screenshots without animations or carets, compared with no tolerance, and baselines named `<state>-<theme>-<density>-chromium-linux.png`. It also exports `visualVariants`, the four theme and density combinations, and `applyVisualVariant(page, variant)`.
- The `hm-test-visual` command runs those tests inside the browser test image that `ci/Dockerfile` pins, through Docker locally and directly in CI. `hm-test-visual --update` rewrites the baselines and removes the ones no state produces any more.

To adopt it, install `@playwright/test`, add `"test:visual": "hm-test-visual"` and `"test:visual:update": "hm-test-visual --update"`, and run `test:visual` in `verify` after `test:e2e`.
