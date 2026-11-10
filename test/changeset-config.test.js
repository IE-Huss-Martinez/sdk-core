import { execFileSync, spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const CHANGESET = join(ROOT, "node_modules", ".bin", "changeset");

// A git identity and no user or system config, so commits in the fixture
// don't depend on, or use, the machine's git settings such as signing.
const GIT_ENV = {
  ...process.env,
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "Test",
  GIT_AUTHOR_EMAIL: "test@example.com",
  GIT_COMMITTER_NAME: "Test",
  GIT_COMMITTER_EMAIL: "test@example.com",
};

/** A workspace shaped like this one, with both kinds of package source. */
const FILES = {
  "package.json": '{ "name": "workspace", "private": true }\n',
  "pnpm-workspace.yaml": "packages:\n  - packages/*\n",
  "packages/sdk-core/package.json": '{ "name": "@hussmartinez/sdk-core", "version": "1.0.0" }\n',
  "packages/sdk-core/src/index.ts": "export const a = 1;\n",
  "packages/sdk-core/src/index.test.ts": "// test\n",
  "packages/sdk-core/src/worker/fixtures/test.worker.ts": "// fixture\n",
  "packages/sdk-config/package.json":
    '{ "name": "@hussmartinez/sdk-config", "version": "1.0.0" }\n',
  "packages/sdk-config/src/stylelint/index.js": "export default {};\n",
  "packages/sdk-config/src/stylelint/stylelint.test.js": "// test\n",
  "packages/sdk-config/biome/base.jsonc": "{}\n",
  "packages/sdk-config/test/helper.js": "// helper\n",
  "packages/sdk-config/vitest.config.js": "export default {};\n",
};

/** @type {string} */
let repo;

/** @param {string[]} args */
const git = (...args) => execFileSync("git", args, { cwd: repo, env: GIT_ENV, stdio: "ignore" });

beforeAll(async () => {
  repo = await mkdtemp(join(tmpdir(), "hm-changeset-config-"));
  for (const [path, content] of Object.entries(FILES)) {
    await mkdir(dirname(join(repo, path)), { recursive: true });
    await writeFile(join(repo, path), content);
  }
  // The repository's real configuration, which the changeset check uses.
  await mkdir(join(repo, ".changeset"));
  await copyFile(join(ROOT, ".changeset", "config.json"), join(repo, ".changeset", "config.json"));
  git("init", "-q", "-b", "main");
  git("add", "-A");
  git("commit", "-q", "-m", "base");
});

afterAll(async () => {
  await rm(repo, { recursive: true, force: true });
});

/**
 * Changes one file on a new branch, commits it, and runs the CI check,
 * `changeset status --since=main`. Returns whether it asks for a changeset.
 *
 * @param {string} path
 */
async function needsChangeset(path) {
  git("checkout", "-q", "-B", "change", "main");
  const file = join(repo, path);
  if (path.endsWith(".json")) {
    const json = JSON.parse(await readFile(file, "utf8"));
    await writeFile(file, `${JSON.stringify({ ...json, description: "Changed." })}\n`);
  } else {
    await writeFile(file, "// changed\n", { flag: "a" });
  }
  git("commit", "-q", "-am", "change");
  const { status, stdout, stderr } = spawnSync(CHANGESET, ["status", "--since=main"], {
    cwd: repo,
    encoding: "utf8",
  });
  if (status !== 0 && !`${stdout}${stderr}`.includes("Some packages have been changed")) {
    throw new Error(`changeset status failed unexpectedly:\n${stdout}${stderr}`);
  }
  return status !== 0;
}

describe("the changeset check's changedFilePatterns", () => {
  it.each([
    "packages/sdk-core/src/index.ts",
    "packages/sdk-core/package.json",
    "packages/sdk-config/src/stylelint/index.js",
    "packages/sdk-config/biome/base.jsonc",
  ])("asks for a changeset when %s changes", async (path) => {
    await expect(needsChangeset(path)).resolves.toBe(true);
  });

  it.each([
    "packages/sdk-core/src/index.test.ts",
    "packages/sdk-config/src/stylelint/stylelint.test.js",
    "packages/sdk-core/src/worker/fixtures/test.worker.ts",
    "packages/sdk-config/test/helper.js",
    "packages/sdk-config/vitest.config.js",
  ])("doesn't ask for one when only %s changes", async (path) => {
    await expect(needsChangeset(path)).resolves.toBe(false);
  });
});
