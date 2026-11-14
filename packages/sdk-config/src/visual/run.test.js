import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, posix } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  BASELINES,
  dockerfile,
  dockerRunArgs,
  imageTag,
  readImage,
  readPinnedPnpm,
  readWorkspace,
  runInContainer,
  runInDocker,
  UsageError,
  workspacePackageDirs,
} from "./run.js";

const CLI = fileURLToPath(new URL("./cli.js", import.meta.url));
const IMAGE =
  "mcr.microsoft.com/playwright:v1.65.0-noble@sha256:9beb546099e11f52d62e505537914870e01a67e0e6b00ae41da4775324e73dbe";

/** The integrities sdk-core's pnpm-lock.yaml records for pnpm 12.18.0. */
const PINNED = {
  version: "12.18.0",
  integrity:
    "sha512-nXiC1dyCFH7PxOBiqjSDTgrQKWcQoYN6ERWuASEn02txCeMhrBWYod0KZVl2gbHpmRfhLtDXSerpEYeUM2O+sw==",
  binaries: {
    "linux-x64":
      "sha512-OJ+X2wcraldCwj75pCIerWARQSRpdfj0eBTs/2ODyhfeW46ylOnjTIE/GKra6Mn6E72/gBmXS8igrUioa+F9fQ==",
    "linux-arm64":
      "sha512-2dpyVBCHT+FfpuQh9i+7MXAqNWYLCvD5vYr5p6Eimxoga8USLnjbUgyj72AOrO0hjc5ri3TEFP3jiyBHjkSZpQ==",
  },
};

/**
 * A pnpm 12 lockfile, as pnpm writes it: a first document for the package
 * manager itself, then the dependencies'.
 *
 * @param {{ version?: string, integrity?: string, x64?: string }} [overrides]
 */
const lockfile = ({
  version = "12.18.0",
  integrity = PINNED.integrity,
  x64 = PINNED.binaries["linux-x64"],
} = {}) => `---
lockfileVersion: '9.0'

importers:

  .:
    configDependencies: {}
    packageManagerDependencies:
      pnpm:
        specifier: ${version}
        version: ${version}

packages:

  '@pnpm/exe.linux-arm64@${version}':
    resolution: {integrity: ${PINNED.binaries["linux-arm64"]}}
    cpu: [arm64]
    os: [linux]
    libc: [glibc]

  '@pnpm/exe.linux-x64@${version}':
    resolution: {integrity: '${x64}'}
    cpu: [x64]
    os: [linux]
    libc: [glibc]

  pnpm@${version}:
    resolution: {integrity: ${integrity}}
    hasBin: true

---
lockfileVersion: '9.0'

importers:

  .: {}
`;

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
    "pnpm-lock.yaml": lockfile(),
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

describe("readPinnedPnpm", () => {
  it("reads pnpm's and its Linux binaries' integrity from the lockfile", async () => {
    expect(readPinnedPnpm(await repository(), "12.18.0")).toEqual(PINNED);
  });

  it("rejects a lockfile written for another pnpm", async () => {
    const root = await repository({ "pnpm-lock.yaml": lockfile({ version: "12.17.0" }) });
    expect(() => readPinnedPnpm(root, "12.18.0")).toThrow(
      "pnpm-lock.yaml records pnpm 12.17.0, but packageManager is pnpm@12.18.0. Run pnpm install with pnpm 12.18.0, so pnpm-lock.yaml records it.",
    );
  });

  it("rejects a lockfile that doesn't record pnpm itself", async () => {
    const root = await repository({
      "pnpm-lock.yaml": "lockfileVersion: '9.0'\nimporters:\n  .: {}\n",
    });
    expect(() => readPinnedPnpm(root, "12.18.0")).toThrow(/doesn't record pnpm itself/);
  });

  it.each([
    ["a missing integrity", lockfile({ integrity: "''" })],
    ["a sha1 integrity", lockfile({ integrity: "sha1-2jmj7l5rSw0yVb/vlWAYkK/YBwk=" })],
    // A hostile lockfile can't reach the Dockerfile's shell.
    [
      "an integrity with shell syntax",
      lockfile({ x64: `${PINNED.binaries["linux-x64"]}"; touch /pwned; "` }),
    ],
  ])("rejects %s", async (_, content) => {
    const root = await repository({ "pnpm-lock.yaml": content });
    expect(() => readPinnedPnpm(root, "12.18.0")).toThrow(UsageError);
    expect(() => readPinnedPnpm(root, "12.18.0")).toThrow(/has no sha512 integrity for/);
  });

  it("rejects a repository without a lockfile", async () => {
    const root = await repository();
    await rm(join(root, "pnpm-lock.yaml"));
    expect(() => readPinnedPnpm(root, "12.18.0")).toThrow(/pnpm-lock.yaml can't be read/);
  });
});

describe("the image", () => {
  it("installs pnpm and its binary only after checking them against the lockfile", () => {
    const text = dockerfile(IMAGE, PINNED);
    const lines = text.split("\n");
    expect(lines[0]).toBe(`FROM ${IMAGE}`);
    expect(lines.at(-2)).toBe("ENV HM_VISUAL_CONTAINER=1");
    expect(text).toContain(
      `x86_64) target=linux-x64; binary_integrity=${PINNED.binaries["linux-x64"]};;`,
    );
    expect(text).toContain(
      `aarch64) target=linux-arm64; binary_integrity=${PINNED.binaries["linux-arm64"]};;`,
    );
    expect(text).toContain(
      '*) echo "hm-test-visual: no pinned pnpm binary for $(uname -m)." >&2; exit 1;;',
    );
    const check = text.indexOf(`"$wrapper" "${PINNED.integrity}" "$binary" "$binary_integrity"`);
    const install = text.indexOf(
      'npm install --global --ignore-scripts --no-audit --no-fund "./$wrapper" "./$binary"',
    );
    expect(check).toBeGreaterThan(text.indexOf("wrapper=$(npm pack --silent pnpm@12.18.0)"));
    expect(install).toBeGreaterThan(check);
    // Installed from the checked files only, never by name from the registry.
    expect(text).not.toMatch(/npm install[^\n]* pnpm@/);
  });

  it("fails the build when a tarball doesn't match its integrity", async () => {
    const text = dockerfile(IMAGE, PINNED);
    const script = /** @type {string} */ (/node -e '([^']+)'/.exec(text)?.[1]);
    const dir = await mkdtemp(join(tmpdir(), "hm-visual-verify-"));
    scratch.push(dir);
    await writeFile(join(dir, "good.tgz"), "good");
    await writeFile(join(dir, "bad.tgz"), "tampered");
    const hash = (/** @type {string} */ content) =>
      `sha512-${createHash("sha512").update(content).digest("base64")}`;
    const verify = (/** @type {string[]} */ args) =>
      spawnSync(process.execPath, ["-e", script, ...args], { cwd: dir, encoding: "utf8" });

    expect(verify(["good.tgz", hash("good"), "bad.tgz", hash("tampered")]).status).toBe(0);
    const failed = verify(["good.tgz", hash("good"), "bad.tgz", hash("bad")]);
    expect(failed.status).toBe(1);
    expect(failed.stderr).toBe(
      `hm-test-visual: bad.tgz is ${hash("tampered")}, but pnpm-lock.yaml records ${hash("bad")}.\n`,
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

describe("a workspace that lists its root, as Changesets needs", () => {
  /** pnpm-workspace.yaml as most SDKs have it, with the root listed as ".", and other spellings of it. */
  const listsRoot = {
    "pnpm-workspace.yaml":
      'packages:\n  - "."\n  - ./\n  - packages/..\n  - packages/*\n  - ./e2e\n  - examples/*\n',
  };

  it("leaves the root out, whatever it's spelled as, and normalises the rest", async () => {
    expect(workspacePackageDirs(await repository(listsRoot))).toEqual([
      "packages/image-sdk",
      "e2e",
      "examples/vite",
    ]);
  });

  it("mounts each node_modules once, so Docker accepts the mounts", async () => {
    const root = await repository(listsRoot);
    const args = dockerRunArgs({
      root,
      tag: "hm-visual-x",
      dirs: workspacePackageDirs(root),
      owner: "1000:1000",
      update: false,
    });
    const targets = args
      .filter((_, index) => args[index - 1] === "--volume")
      // Docker compares normalised paths: /work/./node_modules is /work/node_modules.
      .map((volume) => posix.normalize(volume.slice(volume.indexOf(":") + 1)));
    expect(new Set(targets).size).toBe(targets.length);
    expect(targets.filter((target) => target === "/work/node_modules")).toHaveLength(1);
  });

  it("never mounts a folder outside the root", async () => {
    const root = await repository({
      "pnpm-workspace.yaml": "packages:\n  - ../elsewhere\n  - e2e\n",
    });
    expect(workspacePackageDirs(root)).toEqual(["e2e"]);
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
