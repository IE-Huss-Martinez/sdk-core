// The visual regression preset for every SDK's editor (sdk-core ADR 0048):
// a Playwright configuration that compares screenshots of the built example
// page with committed baselines, on Chromium, inside the pinned browser test
// image only. Run it through hm-test-visual, never with playwright directly.
//
// Test code only: this entry is never imported by published runtime code.

/** The environment variable the browser test image sets, locally through hm-test-visual and in CI's verify job. */
export const VISUAL_CONTAINER_ENV = "HM_VISUAL_CONTAINER";

/**
 * @typedef {object} VisualVariant
 * @property {"light" | "dark"} theme The theme, set as `data-hm-theme`.
 * @property {"compact" | "comfortable"} density The density, set as `data-hm-density`.
 * @property {string} name `<theme>-<density>`, the suffix of each screenshot's name.
 */

/**
 * The themes and densities every state is captured in (ADR 0048): light and
 * dark, each in compact and comfortable density.
 *
 * @type {readonly VisualVariant[]}
 */
export const visualVariants = Object.freeze(
  /** @type {const} */ (["light", "dark"]).flatMap((theme) =>
    /** @type {const} */ (["compact", "comfortable"]).map((density) =>
      Object.freeze({ theme, density, name: `${theme}-${density}` }),
    ),
  ),
);

/**
 * Applies a variant's theme and density to the page's root element, after it
 * has loaded, and waits for its fonts.
 *
 * @param {import("@playwright/test").Page} page The page under test.
 * @param {VisualVariant} variant The theme and density.
 * @returns {Promise<void>}
 */
export async function applyVisualVariant(page, variant) {
  await page.evaluate(async ({ theme, density }) => {
    document.documentElement.setAttribute("data-hm-theme", theme);
    document.documentElement.setAttribute("data-hm-density", density);
    await document.fonts.ready;
  }, variant);
}

/**
 * @typedef {object} VisualConfigOptions
 * @property {string} baseURL The built example's origin, such as
 *   `http://localhost:4320`.
 * @property {NonNullable<import("@playwright/test").PlaywrightTestConfig["webServer"]>} webServer
 *   Serves the built example, as the end-to-end configuration does.
 */

/**
 * Returns the Playwright configuration for an SDK's visual tests, in
 * `e2e/playwright.visual.config.ts`, with its specs in `e2e/visual/` (ADR
 * 0048):
 *
 * - Chromium only, in a 1280 × 800 viewport at a device scale factor of 1,
 *   with the `en-US` locale, the `UTC` time zone and reduced motion.
 * - Screenshots without animations or carets, compared with no tolerance.
 * - Baselines in `e2e/visual/__screenshots__/<spec>/`, named
 *   `<name>-chromium-linux.png`, and never written by a plain run.
 *
 * @example
 * ```ts
 * import { defineVisualConfig } from "@hussmartinez/sdk-config/testing/visual";
 *
 * export default defineVisualConfig({
 *   baseURL: "http://localhost:4320",
 *   webServer: {
 *     command: "node node_modules/vite/bin/vite.js preview --port 4320 --strictPort",
 *     cwd: "../examples/vite",
 *     url: "http://localhost:4320",
 *     reuseExistingServer: false,
 *   },
 * });
 * ```
 *
 * @param {VisualConfigOptions} options The example's origin and server.
 * @returns {import("@playwright/test").PlaywrightTestConfig} The configuration.
 * @throws `Error` outside the browser test image, so baselines can't be
 *   written anywhere else.
 */
export function defineVisualConfig({ baseURL, webServer }) {
  if (process.env[VISUAL_CONTAINER_ENV] !== "1") {
    throw new Error(
      "Visual tests run only in the pinned browser test image (sdk-core ADR 0048). Use pnpm test:visual, or pnpm test:visual:update to update the baselines.",
    );
  }
  const ci = Boolean(process.env["CI"]);
  return {
    testDir: "visual",
    outputDir: "test-results/visual",
    snapshotPathTemplate:
      "{testDir}/__screenshots__/{testFilePath}/{arg}-{projectName}-{platform}{ext}",
    forbidOnly: ci,
    retries: 0,
    reporter: ci ? "line" : "list",
    // hm-test-visual --update writes them; a plain run only compares.
    updateSnapshots: "none",
    expect: {
      toHaveScreenshot: {
        maxDiffPixelRatio: 0,
        animations: "disabled",
        caret: "hide",
        scale: "css",
      },
    },
    use: {
      baseURL,
      browserName: "chromium",
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 1,
      isMobile: false,
      hasTouch: false,
      locale: "en-US",
      timezoneId: "UTC",
      colorScheme: "light",
      reducedMotion: "reduce",
      trace: "retain-on-failure",
    },
    projects: [{ name: "chromium" }],
    webServer,
  };
}
