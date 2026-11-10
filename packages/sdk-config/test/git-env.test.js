import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const PACKAGE = fileURLToPath(new URL("..", import.meta.url));
const VITEST = join(PACKAGE, "node_modules", ".bin", "vitest");

// The suites that run git, Biome or hm-lint-deps in temporary repositories.
const SUITES = ["src/biome/biome.test.js", "src/dependency-cruiser/lint-deps.test.js"];

it("runs the git-using suites correctly inside a git hook's environment", async () => {
  // As in a pre-push hook run from a linked worktree, where GIT_DIR points at
  // another repository than the one a test creates.
  const elsewhere = await mkdtemp(join(tmpdir(), "hm-git-env-"));
  try {
    const { status, stdout, stderr } = spawnSync(VITEST, ["run", ...SUITES], {
      cwd: PACKAGE,
      encoding: "utf8",
      env: {
        ...process.env,
        GIT_DIR: join(elsewhere, "not-a-repository.git"),
        GIT_WORK_TREE: elsewhere,
        GIT_INDEX_FILE: join(elsewhere, "index"),
      },
    });

    expect(status, `${stdout}${stderr}`).toBe(0);
  } finally {
    await rm(elsewhere, { recursive: true, force: true });
  }
}, 60_000);
