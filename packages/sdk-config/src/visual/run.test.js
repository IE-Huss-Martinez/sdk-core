import { spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  BASELINES,
  dockerfile,
  dockerRunArgs,
  imageTag,
  readImage,
  readWorkspace,
  runInContainer,
  runInDocker,
  UsageError,
  workspacePackageDirs,
} from "./run.js";

const CLI = fileURLToPath(new URL("./cli.js", import.meta.url));
const IMAGE =
  "mcr.microsoft.com/playwright:v1.65.0-noble@sha256:9beb546099e11f52d62e505537914870e01a67e0e6b00ae41da4775324e73dbe";

/** @type {string[]} */
const scratch = [];
afterEach(async () => {
  for (const dir of scratch.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

/**
 * A repository shaped like image-sdk's: a FROM-only ci/Dockerfile, pnpm in
 * packageManager, and a workspace of the package, its e2e suite and examples.
 *
 * @param {Record<string, string>} [files] Files to add or replace.
 */
async function repository(files = {}) {
  const root = await mkdtemp(join(tmpdir(), "hm-visual-"));
  scratch.push(root);
  const all = {
    "package.json": JSON.stringify({
      name: "@hussmartinez/image-sdk-workspace",
      packageManager: "pnpm@12.18.0",
    }),
    "pnpm-workspace.yaml":
      "packages:\n  - packages/*\n  - e2e\n  # the examples\n  - examples/*\n\ncatalog:\n  x: ^1\n",
    "ci/Dockerfile": `# The browser test image.\nFROM ${IMAGE}\n`,
    "packages/image-sdk/package.json": "{}",
    "e2e/package.json": "{}",
    "examples/vite/package.json": "{}",
    "examples/notes/README.md": "not a package",
    ...files,
  };
  for (const [path, content] of Object.entries(all)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), content);
  }
  return root;
}

describe("readImage", () => {
  it("reads the pinned image from ci/Dockerfile's FROM line", async () => {
    expect(readImage(await repository())).toBe(IMAGE);
  });

  it.each([
    ["no FROM line", "# nothing\n", /exactly one FROM line, not 0/],
    ["two FROM lines", `FROM ${IMAGE}\nFROM ${IMAGE}\n`, /exactly one FROM line, not 2/],
    ["an image without a digest", "FROM mcr.microsoft.com/playwright:v1.65.0-noble\n", /must be/],
    ["another image", `FROM node:24@sha256:${"0".repeat(64)}\n`, /must be/],
  ])("rejects %s", async (_, content, message) => {
    const root = await repository({ "ci/Dockerfile": content });
    expect(() => readImage(root)).toThrow(UsageError);
    expect(() => readImage(root)).toThrow(message);
  });

  it("rejects a repository without ci/Dockerfile", async () => {
    const root = await repository();
    await rm(join(root, "ci"), { recursive: true });
    expect(() => readImage(root)).toThrow(/ci\/Dockerfile doesn't exist/);
  });
});

describe("readWorkspace", () => {
  it("reads the name and pnpm's version, without a hash", async () => {
    const root = await repository({
      "package.json": JSON.stringify({ name: "w", packageManager: "pnpm@12.18.0+sha512.abc" }),
    });
    expect(readWorkspace(root)).toEqual({ name: "w", pnpm: "12.18.0" });
  });

  it("rejects another package manager", async () => {
    const root = await repository({
      "package.json": JSON.stringify({ packageManager: "npm@11.0.0" }),
    });
    expect(() => readWorkspace(root)).toThrow(/pnpm@<version>/);
  });
});

describe("the image", () => {
  it("adds the repository's pnpm and the container variable to the pinned image", () => {
    expect(dockerfile(IMAGE, "12.18.0")).toBe(
      `FROM ${IMAGE}\nRUN npm install --global --ignore-scripts pnpm@12.18.0\nENV HM_VISUAL_CONTAINER=1\n`,
    );
  });

  it("is tagged after the workspace, in the characters Docker allows", () => {
    expect(imageTag("@hussmartinez/image-sdk-workspace")).toBe(
      "hm-visual-hussmartinez-image-sdk-workspace",
    );
    expect(imageTag("")).toBe("hm-visual-workspace");
  });
});

describe("workspacePackageDirs", () => {
  it("expands folder/* globs, skips folders without a package.json, and ignores comments", async () => {
    expect(workspacePackageDirs(await repository())).toEqual([
      "packages/image-sdk",
      "e2e",
      "examples/vite",
    ]);
  });
});

describe("dockerRunArgs", () => {
  const args = dockerRunArgs({
    root: "/home/me/image-sdk",
    tag: "hm-visual-x",
    dirs: ["packages/image-sdk", "e2e"],
    owner: "1000:1000",
    update: true,
  });

  it("mounts the checkout, and a node_modules volume for the root and every package", () => {
    expect(args).toEqual(
      expect.arrayContaining([
        "/home/me/image-sdk:/work",
        "hm-visual-x-root-modules:/work/node_modules",
      ]),
    );
    expect(args).toContain(
      "hm-visual-x-packages-image-sdk-modules:/work/packages/image-sdk/node_modules",
    );
    expect(args).toContain("hm-visual-x-e2e-modules:/work/e2e/node_modules");
    expect(args).toContain("hm-visual-x-store:/pnpm-store");
  });

  it("runs itself inside, then hands root-owned files back without failing the run", () => {
    const script = /** @type {string} */ (args.at(-1));
    expect(script).toContain("&& pnpm exec hm-test-visual --update; status=$?;");
    expect(script).toContain(
      "find /work -xdev -user 0 -exec chown 1000:1000 {} + 2>/dev/null || true;",
    );
    expect(script.endsWith("exit $status")).toBe(true);
  });
});

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
      "hm-visual-hussmartinez-image-sdk-workspace",
      "-",
    ]);
    expect(calls[1]?.input).toBe(dockerfile(IMAGE, "12.18.0"));
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
