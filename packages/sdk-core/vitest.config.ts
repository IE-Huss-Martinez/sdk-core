import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

const ALL_BROWSERS = ["chromium", "firefox", "webkit"] as const;

// Browser tests run on Chromium locally, and on all three engines in CI or
// with --mode all-browsers (ADR 0015).
export default defineConfig(({ mode }) => {
  const browsers =
    process.env["CI"] || mode === "all-browsers" ? ALL_BROWSERS : (["chromium"] as const);
  return {
    test: {
      projects: [
        {
          test: {
            name: "unit",
            include: ["src/**/*.test.ts"],
            exclude: ["src/**/*.browser.test.ts"],
            environment: "node",
          },
        },
        {
          test: {
            name: "browser",
            include: ["src/**/*.browser.test.ts"],
            browser: {
              enabled: true,
              headless: true,
              provider: playwright(),
              instances: browsers.map((browser) => ({ browser })),
            },
          },
        },
      ],
    },
  };
});
