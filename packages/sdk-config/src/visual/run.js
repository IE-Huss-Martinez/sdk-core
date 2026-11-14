import { existsSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { CONTAINER_ENV, defaultRun, EXIT_OK, runInImage } from "../image/run.js";

/** The visual Playwright configuration, relative to the repository. */
export const CONFIG = "e2e/playwright.visual.config.ts";
/** The committed baselines, relative to the repository. */
export const BASELINES = "e2e/visual/__screenshots__";

/**
 * Inside the browser test image: runs the visual configuration with
 * Playwright. With `update`, the baselines are moved aside first and written
 * afresh, so screenshots that no state produces any more disappear; if the
 * run fails, the previous baselines are put back.
 *
 * @param {{ root: string, update: boolean, run?: import("../image/run.js").Run }} options
 * @returns {number} The exit code.
 */
export function runInContainer({ root, update, run = defaultRun }) {
  const args = [
    "--dir",
    "e2e",
    "exec",
    "playwright",
    "test",
    "--config",
    "playwright.visual.config.ts",
  ];
  if (!update) {
    return run("pnpm", args, { cwd: root });
  }
  const baselines = join(root, BASELINES);
  const previous = `${baselines}.previous`;
  rmSync(previous, { recursive: true, force: true });
  const hadBaselines = existsSync(baselines);
  if (hadBaselines) {
    renameSync(baselines, previous);
  }
  const status = run("pnpm", [...args, "--update-snapshots=all"], { cwd: root });
  if (status === EXIT_OK) {
    rmSync(previous, { recursive: true, force: true });
    return EXIT_OK;
  }
  rmSync(baselines, { recursive: true, force: true });
  if (hadBaselines) {
    renameSync(previous, baselines);
  }
  return status;
}

/**
 * Outside the image: runs `hm-test-visual` itself in the browser test image,
 * through `runInImage`.
 *
 * @param {{ root: string, update: boolean, owner: string, env?: Record<string, string | undefined>, run?: import("../image/run.js").Run, log?: (message: string) => void }} options
 * @returns {number} The exit code.
 * @throws {import("../image/run.js").UsageError} When the repository's image or pnpm can't be read.
 */
export function runInDocker({ root, update, owner, env = process.env, run = defaultRun, log }) {
  return runInImage({
    cwd: root,
    command: ["hm-test-visual", ...(update ? ["--update"] : [])],
    owner,
    env: { ...env, [CONTAINER_ENV]: undefined },
    run,
    ...(log ? { log } : {}),
  });
}
