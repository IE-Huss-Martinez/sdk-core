import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";
import { browserInstances } from "./src/testing/browser-instances.js";

const ALL_BROWSERS = /** @type {const} */ (["chromium", "firefox", "webkit"]);

// Browser tests run on Chromium locally, and on all three engines in CI or
// with --mode all-browsers (ADR 0015).
export default defineConfig(({ mode }) => {
  const browsers =
    process.env["CI"] || mode === "all-browsers"
      ? ALL_BROWSERS
      : /** @type {const} */ (["chromium"]);
  return {
    test: {
      projects: [
        {
          test: {
            name: "unit",
            include: ["src/**/*.test.js", "test/**/*.test.js"],
            exclude: ["src/**/*.browser.test.js"],
            setupFiles: ["test/isolate-git-env.js"],
          },
        },
        {
          test: {
            name: "browser",
            include: ["src/**/*.browser.test.js"],
            browser: {
              enabled: true,
              headless: true,
              provider: playwright(),
              instances: browserInstances(browsers),
            },
          },
        },
      ],
    },
  };
});
