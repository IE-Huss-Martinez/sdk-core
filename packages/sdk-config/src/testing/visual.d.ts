/**
 * Applies a variant's theme and density to the page's root element, after it
 * has loaded, and waits for its fonts.
 *
 * @param {import("@playwright/test").Page} page The page under test.
 * @param {VisualVariant} variant The theme and density.
 * @returns {Promise<void>}
 */
export function applyVisualVariant(page: import("@playwright/test").Page, variant: VisualVariant): Promise<void>;
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
export function defineVisualConfig({ baseURL, webServer }: VisualConfigOptions): import("@playwright/test").PlaywrightTestConfig;
/** The environment variable the browser test image sets, locally through hm-test-visual and in CI's verify job. */
export const VISUAL_CONTAINER_ENV: "HM_VISUAL_CONTAINER";
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
export const visualVariants: readonly VisualVariant[];
export type VisualConfigOptions = {
    /**
     * The built example's origin, such as
     * `http://localhost:4320`.
     */
    baseURL: string;
    /**
     *   Serves the built example, as the end-to-end configuration does.
     */
    webServer: NonNullable<import("@playwright/test").PlaywrightTestConfig["webServer"]>;
};
export type VisualVariant = {
    /**
     * The theme, set as `data-hm-theme`.
     */
    theme: "light" | "dark";
    /**
     * The density, set as `data-hm-density`.
     */
    density: "compact" | "comfortable";
    /**
     * `<theme>-<density>`, the suffix of each screenshot's name.
     */
    name: string;
};
