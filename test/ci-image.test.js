import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const read = (/** @type {string} */ path) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

/** The image the Dockerfile pins, which Dependabot updates. */
async function pinnedImage() {
  const image = /^FROM (\S+)$/m.exec(await read(".github/ci-image/Dockerfile"))?.[1];
  if (!image) {
    throw new Error(".github/ci-image/Dockerfile has no FROM line");
  }
  return image;
}

/**
 * @typedef {{ container?: { image?: string, options?: string }, env?: Record<string, string>, steps: Array<Record<string, unknown>>, permissions?: Record<string, string> }} Job
 * @param {string} workflow
 * @param {string} job
 * @returns {Promise<Job>}
 */
async function job(workflow, job) {
  const found = parse(await read(`.github/workflows/${workflow}`)).jobs?.[job];
  if (!found) {
    throw new Error(`${workflow} has no ${job} job`);
  }
  return found;
}

describe("the CI image", () => {
  it("is pinned by digest", async () => {
    expect(await pinnedImage()).toMatch(
      /^mcr\.microsoft\.com\/playwright:v[\d.]+-\w+@sha256:[0-9a-f]{64}$/,
    );
  });

  it("has the Playwright version the lockfile installs", async () => {
    const tag = /playwright:v(\d+\.\d+\.\d+)-/.exec(await pinnedImage())?.[1];
    // Resolved from sdk-core, whose browser tests use it.
    const require = createRequire(new URL("../packages/sdk-core/package.json", import.meta.url));
    const installed = require("playwright/package.json").version;
    expect(tag, "update .github/ci-image/Dockerfile's tag and digest with playwright").toBe(
      installed,
    );
  });

  it.each([
    ["verify.yml", "verify"],
    ["release.yml", "verify"],
  ])("is the image %s's %s job runs in, as user 1001", async (workflow, name) => {
    const { container } = await job(workflow, name);
    expect(container?.image, `keep ${workflow}'s image equal to the Dockerfile's`).toBe(
      await pinnedImage(),
    );
    expect(container?.options).toBe("--user 1001 --ipc=host --init");
  });

  it("verifies a release exactly as pull requests are verified", async () => {
    const pullRequests = await job("verify.yml", "verify");
    const release = await job("release.yml", "verify");
    // The same steps, except that a release doesn't use pnpm's store cache.
    const withoutCache = pullRequests.steps.map((step) =>
      String(step["uses"] ?? "").startsWith("pnpm/action-setup@") ? { uses: step["uses"] } : step,
    );
    expect(release.steps).toEqual(withoutCache);
    expect(release.env).toEqual(pullRequests.env);
    expect(release.permissions).toEqual({ contents: "read" });
  });

  it("publishes only after the release's verify job", async () => {
    const publish = await job("release.yml", "publish");
    expect(publish).toMatchObject({ needs: expect.arrayContaining(["plan", "verify"]) });
    const check = publish.steps.find(
      (step) => step["name"] === "Check that this release was verified",
    );
    // A GitHub Actions expression, not a JavaScript placeholder.
    expect(check?.["env"]).toEqual({ VERIFIED: `\${{ needs.verify.result }}` });
    const publishing = publish.steps.findIndex((step) =>
      String(step["uses"] ?? "").startsWith("changesets/action@"),
    );
    expect(publish.steps.indexOf(/** @type {Record<string, unknown>} */ (check))).toBeLessThan(
      publishing,
    );
    // No browsers are installed where the OIDC token is.
    expect(JSON.stringify(publish.steps)).not.toContain("playwright install");
  });
});
