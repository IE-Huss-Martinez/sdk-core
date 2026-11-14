import { spawnSync } from "node:child_process";
import { chmod, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { cleanUp, IMAGE, PINNED, repository } from "../../test/image-repository.js";
import { dockerfile } from "../image/run.js";
import { BASELINES, runInContainer, runInDocker } from "./run.js";

const CLI = fileURLToPath(new URL("./cli.js", import.meta.url));

afterEach(cleanUp);

describe("runInContainer", () => {
  it("compares with the visual configuration, writing nothing", async () => {
    const root = await repository();
    /** @type {string[][]} */
    const calls = [];
    const run = (/** @type {string} */ command, /** @type {string[]} */ args) => {
      calls.push([command, ...args]);
      return 0;
    };
    expect(runInContainer({ root, update: false, run })).toBe(0);
    expect(calls).toEqual([
      [
        "pnpm",
        "--dir",
        "e2e",
        "exec",
        "playwright",
        "test",
        "--config",
        "playwright.visual.config.ts",
      ],
    ]);
  });

  it("writes the baselines afresh with --update, so stale ones disappear", async () => {
    const root = await repository({
      [`${BASELINES}/editor.spec.ts/empty-light-compact-chromium-linux.png`]: "old",
      [`${BASELINES}/editor.spec.ts/removed-state-light-compact-chromium-linux.png`]: "stale",
    });
    /** @type {string[][]} */
    const calls = [];
    const status = runInContainer({
      root,
      update: true,
      run: (command, args, { cwd }) => {
        calls.push([command, ...args]);
        // Playwright writes only the states that exist, into an empty folder.
        spawnSync("bash", [
          "-c",
          `mkdir -p "${cwd}/${BASELINES}/editor.spec.ts" && echo new > "${cwd}/${BASELINES}/editor.spec.ts/empty-light-compact-chromium-linux.png"`,
        ]);
        return 0;
      },
    });
    expect(status).toBe(0);
    expect(calls[0]?.at(-1)).toBe("--update-snapshots=all");
    expect(await readdir(join(root, BASELINES, "editor.spec.ts"))).toEqual([
      "empty-light-compact-chromium-linux.png",
    ]);
    expect(await readdir(join(root, "e2e", "visual"))).toEqual(["__screenshots__"]);
  });

  it("keeps the previous baselines when the update fails", async () => {
    const file = `${BASELINES}/editor.spec.ts/empty-light-compact-chromium-linux.png`;
    const root = await repository({ [file]: "old" });
    const status = runInContainer({
      root,
      update: true,
      run: (_command, _args, { cwd }) => {
        spawnSync("bash", [
          "-c",
          `mkdir -p "${cwd}/${BASELINES}/half" && echo x > "${cwd}/${BASELINES}/half/a.png"`,
        ]);
        return 1;
      },
    });
    expect(status).toBe(1);
    expect(await readFile(join(root, file), "utf8")).toBe("old");
    expect(await readdir(join(root, BASELINES))).toEqual(["editor.spec.ts"]);
    expect(await readdir(join(root, "e2e", "visual"))).toEqual(["__screenshots__"]);
  });
});

describe("runInDocker", () => {
  it("builds the image from ci/Dockerfile and runs the tests in it", async () => {
    const root = await repository();
    /** @type {Array<{ command: string, args: string[], input?: string | undefined }>} */
    const calls = [];
    const status = runInDocker({
      root,
      update: false,
      owner: "1000:1000",
      run: (command, args, { input }) => {
        calls.push({ command, args, input });
        return 0;
      },
    });
    expect(status).toBe(0);
    expect(calls.map((call) => call.args[0])).toEqual(["info", "build", "run"]);
    expect(calls[1]?.args).toEqual([
      "build",
      "--quiet",
      "--tag",
      "hm-browser-hussmartinez-image-sdk-workspace",
      "-",
    ]);
    expect(calls[1]?.input).toBe(dockerfile(IMAGE, PINNED));
    expect(calls[2]?.args.at(-1)).toContain("pnpm exec hm-test-visual;");
  });

  it("fails with a one-line fix when Docker isn't available, and never skips", async () => {
    const root = await repository();
    /** @type {string[]} */
    const messages = [];
    const status = runInDocker({
      root,
      update: false,
      owner: "1000:1000",
      run: () => 1,
      log: (message) => messages.push(message),
    });
    expect(status).toBe(1);
    expect(messages).toEqual([expect.stringMatching(/^Docker isn't available\. Install Docker/)]);
  });
});

describe("hm-test-visual", () => {
  /**
   * Runs the command with fake `docker` and `pnpm` executables first on the
   * PATH, which record their arguments.
   *
   * @param {string} root
   * @param {string[]} args
   * @param {Record<string, string>} env
   */
  async function cli(root, args, env = {}) {
    const bin = join(root, ".bin");
    await mkdir(bin);
    /** @type {Array<[string, number]>} */
    const fakes = [
      ["docker", 1],
      ["pnpm", 0],
    ];
    for (const [name, status] of fakes) {
      await writeFile(
        join(bin, name),
        `#!/bin/sh\necho "${name} $*" >> "${root}/calls.log"\nexit ${status}\n`,
      );
      await chmod(join(bin, name), 0o755);
    }
    const result = spawnSync(process.execPath, [CLI, ...args], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}:${process.env["PATH"]}`,
        HM_VISUAL_CONTAINER: "",
        ...env,
      },
    });
    const calls = await readFile(join(root, "calls.log"), "utf8").catch(() => "");
    return { ...result, calls };
  }

  it("runs Playwright directly inside the image", async () => {
    const root = await repository();
    const { status, calls } = await cli(root, [], { HM_VISUAL_CONTAINER: "1" });
    expect(status).toBe(0);
    expect(calls).toBe(
      "pnpm --dir e2e exec playwright test --config playwright.visual.config.ts\n",
    );
  });

  it("fails outside the image without Docker, with how to fix it", async () => {
    const root = await repository();
    const { status, stderr } = await cli(root, []);
    expect(status).toBe(1);
    expect(stderr).toMatch(/^hm-test-visual: Docker isn't available\./);
  });

  it("reports a repository it can't read as a usage error", async () => {
    const root = await repository({ "ci/Dockerfile": "# nothing\n" });
    const { status, stderr } = await cli(root, []);
    expect(status).toBe(2);
    expect(stderr).toBe("hm-test-visual: ci/Dockerfile must have exactly one FROM line, not 0.\n");
  });

  it("rejects unknown options", async () => {
    const root = await repository();
    const { status, stderr } = await cli(root, ["--grep", "empty"]);
    expect(status).toBe(2);
    expect(stderr).toMatch(/^hm-test-visual: Unknown option '--grep'/);
  });
});
