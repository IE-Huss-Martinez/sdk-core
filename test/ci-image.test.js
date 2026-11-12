// The browser test image, in its only copy (ADR 0025). The workflows read it
// through sdk-ci's image action, and sdk-ci's check-workflows step keeps
// their structure equal to sdk-ci's skeleton (ADR 0026). What only this
// repository can check is here: that the image is pinned, and that its
// Playwright version is the one this repository's lockfile installs.
import { readdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const read = (/** @type {string} */ path) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

async function pinnedImage() {
  const image = /^FROM (\S+)$/m.exec(await read("ci/Dockerfile"))?.[1];
  if (!image) {
    throw new Error("ci/Dockerfile has no FROM line");
  }
  return image;
}

describe("the browser test image", () => {
  it("is pinned by tag and digest", async () => {
    expect(await pinnedImage()).toMatch(
      /^mcr\.microsoft\.com\/playwright:v\d+\.\d+\.\d+-noble@sha256:[0-9a-f]{64}$/,
    );
  });

  it("has the Playwright version the lockfile installs", async () => {
    const tag = /playwright:v(\d+\.\d+\.\d+)-/.exec(await pinnedImage())?.[1];
    // Resolved from sdk-core, whose browser tests use it.
    const require = createRequire(new URL("../packages/sdk-core/package.json", import.meta.url));
    const installed = require("playwright/package.json").version;
    expect(tag, "update ci/Dockerfile's tag and digest with playwright").toBe(installed);
  });

  it("has no copy in any workflow", async () => {
    const workflows = await readdir(new URL("../.github/workflows/", import.meta.url));
    expect(workflows.length).toBeGreaterThan(0);
    for (const workflow of workflows) {
      expect(
        await read(`.github/workflows/${workflow}`),
        `the image belongs in ci/Dockerfile only, not ${workflow}`,
      ).not.toContain("mcr.microsoft.com/playwright:v");
    }
  });
});
