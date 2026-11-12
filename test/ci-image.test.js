import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const read = (/** @type {string} */ path) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

/** The browser test image, in its only copy (ADR 0025). */
async function pinnedImage() {
  const image = /^FROM (\S+)$/m.exec(await read("ci/Dockerfile"))?.[1];
  if (!image) {
    throw new Error("ci/Dockerfile has no FROM line");
  }
  return image;
}

/**
 * @typedef {{ name?: string, needs?: string | string[], if?: string, uses?: string, container?: { image?: string, options?: string }, env?: Record<string, string>, steps: Array<Record<string, unknown>>, permissions?: Record<string, string> }} Job
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

const VERIFY_JOBS = [
  ["verify.yml", "verify"],
  ["release.yml", "verify"],
];

/** What each verify job's `container.image` must be: the image job's output. */
// A GitHub Actions expression, not a JavaScript placeholder. The fallback is
// pinned to an all-zero digest, which can't be pulled.
const FROM_THE_IMAGE_JOB = `\${{ needs.image.outputs.ref || 'the-image-job-failed@sha256:${"0".repeat(64)}' }}`;

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

  it.each(["verify.yml", "release.yml", "ci-image.yml"])("has no copy in %s", async (workflow) => {
    expect(
      await read(`.github/workflows/${workflow}`),
      "the image belongs in ci/Dockerfile only",
    ).not.toContain("mcr.microsoft.com/playwright:v");
  });

  it.each(VERIFY_JOBS)(
    "is where %s's %s job takes its image from, and a failed image job fails it",
    async (workflow, name) => {
      const verify = await job(workflow, name);
      expect(verify.container).toEqual({
        image: FROM_THE_IMAGE_JOB,
        options: "--user 1001 --ipc=host --init",
      });
      expect([verify.needs].flat()).toContain("image");
      // Without !cancelled(), a failed image job would skip verify, and a
      // skipped required check counts as passing.
      expect(verify.if).toMatch(/^\$\{\{ !cancelled\(\)/);
      const image = await job(workflow, "image");
      expect(image.uses).toBe("./.github/workflows/ci-image.yml");
    },
  );

  it("is read from ci/Dockerfile with read-only permissions", async () => {
    const workflow = parse(await read(".github/workflows/ci-image.yml"));
    expect(Object.keys(workflow.on)).toEqual(["workflow_call"]);
    expect(workflow.permissions).toEqual({ contents: "read" });
    expect((await job("release.yml", "image")).permissions).toEqual({ contents: "read" });
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

/**
 * Runs ci-image.yml's "Read the image" step on a Dockerfile, as the workflow
 * does, and returns its exit code and the output it wrote.
 *
 * @param {string} dockerfile
 */
async function readImage(dockerfile) {
  const { steps } = await job("ci-image.yml", "image");
  const script = String(steps.find((step) => step["name"] === "Read the image")?.["run"]);
  const dir = await mkdtemp(join(tmpdir(), "hm-ci-image-"));
  try {
    await mkdir(join(dir, "ci"));
    await writeFile(join(dir, "ci", "Dockerfile"), dockerfile);
    const output = join(dir, "github-output");
    await writeFile(output, "");
    let code = 0;
    try {
      execFileSync("bash", ["-e", "-c", script], {
        cwd: dir,
        env: { ...process.env, GITHUB_OUTPUT: output },
        stdio: "pipe",
      });
    } catch (error) {
      code = /** @type {{ status?: number }} */ (error).status ?? 1;
    }
    return { code, output: await readFile(output, "utf8") };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("the image job's validation", () => {
  const DIGEST = "a".repeat(64);
  const VALID = `mcr.microsoft.com/playwright:v1.65.0-noble@sha256:${DIGEST}`;

  it("outputs the repository's image", async () => {
    const image = await pinnedImage();
    await expect(readImage(await read("ci/Dockerfile"))).resolves.toEqual({
      code: 0,
      output: `ref=${image}\n`,
    });
  });

  it("accepts exactly one pinned Playwright FROM line", async () => {
    await expect(readImage(`# A comment\nFROM ${VALID}\n`)).resolves.toEqual({
      code: 0,
      output: `ref=${VALID}\n`,
    });
  });

  it.each([
    ["no FROM line", "# nothing here\n"],
    ["two FROM lines", `FROM ${VALID}\nFROM ${VALID}\n`],
    ["a tag without a digest", "FROM mcr.microsoft.com/playwright:v1.65.0-noble\n"],
    ["a digest without a tag", `FROM mcr.microsoft.com/playwright@sha256:${DIGEST}\n`],
    ["another registry", `FROM docker.io/playwright:v1.65.0-noble@sha256:${DIGEST}\n`],
    ["another base", `FROM mcr.microsoft.com/playwright:v1.65.0-jammy@sha256:${DIGEST}\n`],
    ["a short digest", "FROM mcr.microsoft.com/playwright:v1.65.0-noble@sha256:abc\n"],
    ["trailing text", `FROM ${VALID} AS base\n`],
  ])("rejects %s", async (_, dockerfile) => {
    await expect(readImage(dockerfile)).resolves.toEqual({ code: 1, output: "" });
  });
});
