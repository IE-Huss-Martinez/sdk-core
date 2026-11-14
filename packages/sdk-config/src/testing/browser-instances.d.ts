/**
 * @typedef {"chromium" | "firefox" | "webkit"} BrowserName
 */
/**
 * Chromium's flags for the diagnostics: its console on stderr, and a net log
 * of every request in the folder, one file per test process. Firefox and
 * WebKit refuse to launch with them.
 *
 * @param {string} dir The folder.
 * @returns {string[]}
 */
export function chromiumDiagnosticArgs(dir: string): string[];
/**
 * Returns Vitest's `browser.instances` for these browsers, all with
 * `@vitest/browser-playwright`. Without `HM_BROWSER_DIAGNOSTICS`, they're the
 * plain instances, so nothing changes. With it set to a folder, Chromium
 * writes a net log there and its console to stderr. Firefox and WebKit are
 * never changed.
 *
 * Replace `instances: browsers.map((browser) => ({ browser }))` with it, and
 * keep `provider: playwright()`.
 *
 * @example
 * ```ts
 * import { browserInstances } from "@hussmartinez/sdk-config/testing/browser-instances";
 *
 * browser: {
 *   enabled: true,
 *   headless: true,
 *   provider: playwright(),
 *   instances: browserInstances(browsers),
 * },
 * ```
 *
 * @param {readonly BrowserName[]} browsers The browsers to run.
 * @param {{ env?: Record<string, string | undefined> }} [options] The
 *   environment to read `HM_BROWSER_DIAGNOSTICS` from, `process.env` by
 *   default.
 * @returns {Array<{ browser: BrowserName, provider: ReturnType<typeof playwright> }>}
 */
export function browserInstances(browsers: readonly BrowserName[], { env }?: {
    env?: Record<string, string | undefined>;
}): Array<{
    browser: BrowserName;
    provider: ReturnType<typeof playwright>;
}>;
/** The environment variable that turns the diagnostics on: the folder they're written to. */
export const DIAGNOSTICS_ENV: "HM_BROWSER_DIAGNOSTICS";
export type BrowserName = "chromium" | "firefox" | "webkit";
import { playwright } from "@vitest/browser-playwright";
