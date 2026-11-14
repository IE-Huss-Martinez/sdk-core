import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, posix } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { cleanUp, IMAGE, lockfile, PINNED, repository } from "../../test/image-repository.js";
import {
  dockerfile,
  dockerRunArgs,
  findRoot,
  imageTag,
  readImage,
  readPinnedPnpm,
  readWorkspace,
  runInImage,
  shellQuote,
  UsageError,
  workspacePackageDirs,
} from "./run.js";

const CLI = fileURLToPath(new URL("./cli.js", import.meta.url));

/** @type {string[]} */
const scratch = [];
afterEach(async () => {
  await cleanUp();
  for (const dir of scratch.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

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
      '*) echo "browser test image: no pinned pnpm binary for $(uname -m)." >&2; exit 1;;',
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
      `browser test image: bad.tgz is ${hash("tampered")}, but pnpm-lock.yaml records ${hash("bad")}.\n`,
    );
  });

  it("is tagged after the workspace, in the characters Docker allows", () => {
    expect(imageTag("@hussmartinez/image-sdk-workspace")).toBe(
      "hm-browser-hussmartinez-image-sdk-workspace",
    );
    expect(imageTag("")).toBe("hm-browser-workspace");
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
      tag: "hm-browser-x",
      dirs: workspacePackageDirs(root),
      owner: "1000:1000",
      workdir: "",
      command: ["pnpm", "test:browser"],
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
    tag: "hm-browser-x",
    dirs: ["packages/image-sdk", "e2e"],
    owner: "1000:1000",
    workdir: "packages/image-sdk",
    command: ["vitest", "run", "--project", "browser", "--testNamePattern", "it's open"],
    env: { CI: "1", DEBUG: "pw:browser", HOME: "/home/me" },
  });

  it("mounts the checkout, and a node_modules volume for the root and every package", () => {
    expect(args).toEqual(
      expect.arrayContaining([
        "/home/me/image-sdk:/work",
        "hm-browser-x-root-modules:/work/node_modules",
      ]),
    );
    expect(args).toContain(
      "hm-browser-x-packages-image-sdk-modules:/work/packages/image-sdk/node_modules",
    );
    expect(args).toContain("hm-browser-x-e2e-modules:/work/e2e/node_modules");
    expect(args).toContain("hm-browser-x-store:/pnpm-store");
  });

  it("passes on CI and DEBUG by name, and nothing else from the host", () => {
    const passed = args.filter((_, index) => args[index - 1] === "--env");
    expect(passed).toEqual(["HUSKY=0", "CI", "DEBUG"]);
  });

  it("runs the command, quoted, in its folder, then hands root-owned files back without failing the run", () => {
    const script = /** @type {string} */ (args.at(-1));
    expect(script).toContain(
      "&& cd /work/packages/image-sdk && pnpm exec vitest run --project browser --testNamePattern 'it'\\''s open'; status=$?;",
    );
    expect(script).toContain(
      "find /work -xdev -user 0 -exec chown 1000:1000 {} + 2>/dev/null || true;",
    );
    expect(script.endsWith("exit $status")).toBe(true);
  });
});

describe("shellQuote", () => {
  it("leaves plain words alone, and quotes everything else so bash passes it unchanged", () => {
    expect(shellQuote("--project")).toBe("--project");
    for (const word of ["it's open", "a b", "$HOME", "`x`", "", "a;b", "*"]) {
      const echoed = spawnSync("bash", ["-c", `printf %s ${shellQuote(word)}`], {
        encoding: "utf8",
      });
      expect(echoed.stdout).toBe(word);
    }
  });
});

describe("findRoot", () => {
  it("finds the workspace above a package's folder", async () => {
    const root = await repository();
    expect(findRoot(join(root, "packages", "image-sdk"))).toBe(root);
    expect(findRoot(root)).toBe(root);
  });

  it("keeps the folder in a repository without a workspace", async () => {
    const dir = await mkdtemp(join(tmpdir(), "hm-no-workspace-"));
    scratch.push(dir);
    expect(findRoot(dir)).toBe(dir);
  });
});

describe("runInImage", () => {
  /** @type {Array<{ command: string, args: string[], cwd: string, input?: string | undefined }>} */
  let calls = [];
  /** @param {number} status */
  const recorder =
    (status = 0) =>
    (
      /** @type {string} */ command,
      /** @type {string[]} */ args,
      /** @type {{ cwd: string, input?: string }} */ { cwd, input },
    ) => {
      calls.push({ command, args, cwd, input });
      return status;
    };
  afterEach(() => {
    calls = [];
  });

  it("runs the command directly inside the image, as in CI", async () => {
    const root = await repository();
    const cwd = join(root, "packages", "image-sdk");
    const status = runInImage({
      cwd,
      command: ["vitest", "run", "--project", "browser"],
      owner: "1000:1000",
      env: { HM_VISUAL_CONTAINER: "1" },
      run: recorder(3),
    });
    expect(status).toBe(3);
    expect(calls).toEqual([
      { command: "vitest", args: ["run", "--project", "browser"], cwd, input: undefined },
    ]);
  });

  it("otherwise builds the pinned image and runs the command in the same folder of the checkout", async () => {
    const root = await repository();
    const status = runInImage({
      cwd: join(root, "packages", "image-sdk"),
      command: ["vitest", "run", "--project", "browser"],
      owner: "1000:1000",
      env: {},
      run: recorder(),
    });
    expect(status).toBe(0);
    expect(calls.map((call) => call.args[0])).toEqual(["info", "build", "run"]);
    expect(calls[1]?.input).toBe(dockerfile(IMAGE, PINNED));
    expect(calls[2]?.args.at(-1)).toContain(
      "&& cd /work/packages/image-sdk && pnpm exec vitest run --project browser; status=$?;",
    );
    expect(calls.every((call) => call.cwd === root)).toBe(true);
  });

  it("fails with a one-line fix when Docker isn't available, and never skips", async () => {
    const root = await repository();
    /** @type {string[]} */
    const messages = [];
    const status = runInImage({
      cwd: root,
      command: ["vitest"],
      owner: "1000:1000",
      env: {},
      run: () => 1,
      log: (message) => messages.push(message),
    });
    expect(status).toBe(1);
    expect(messages).toEqual([expect.stringMatching(/^Docker isn't available\. Install Docker/)]);
  });

  it("needs a command", async () => {
    expect(() =>
      runInImage({ cwd: tmpdir(), command: [], owner: "0:0", env: {}, run: recorder() }),
    ).toThrow(UsageError);
  });
});

describe("hm-in-image", () => {
  /**
   * Runs the command with fake `docker` and `vitest` executables first on
   * the PATH, which record their arguments and folder.
   *
   * @param {string} cwd
   * @param {string[]} args
   * @param {Record<string, string>} env
   */
  async function cli(cwd, args, env = {}) {
    const bin = await mkdtemp(join(tmpdir(), "hm-image-bin-"));
    scratch.push(bin);
    const log = join(bin, "calls.log");
    /** @type {Array<[string, number]>} */
    const fakes = [
      ["docker", 1],
      ["vitest", 4],
    ];
    for (const [name, status] of fakes) {
      await writeFile(
        join(bin, name),
        `#!/bin/sh\necho "${name} $* in $PWD" >> "${log}"\nexit ${status}\n`,
      );
      await chmod(join(bin, name), 0o755);
    }
    const result = spawnSync(process.execPath, [CLI, ...args], {
      cwd,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}:${process.env["PATH"]}`,
        HM_VISUAL_CONTAINER: "",
        ...env,
      },
    });
    return { ...result, calls: await readFile(log, "utf8").catch(() => "") };
  }

  it("runs the command directly inside the image, with its exit code", async () => {
    const root = await repository();
    const cwd = join(root, "packages", "image-sdk");
    const { status, calls } = await cli(cwd, ["--", "vitest", "run", "--project", "browser"], {
      HM_VISUAL_CONTAINER: "1",
    });
    expect(status).toBe(4);
    expect(calls).toBe(`vitest run --project browser in ${cwd}\n`);
  });

  it("fails outside the image without Docker, with how to fix it", async () => {
    const root = await repository();
    const { status, stderr } = await cli(root, ["vitest", "run"]);
    expect(status).toBe(1);
    expect(stderr).toMatch(/^hm-in-image: Docker isn't available\./);
  });

  it("is a usage error without a command, or in a repository it can't read", async () => {
    const root = await repository({ "ci/Dockerfile": "# nothing\n" });
    expect((await cli(root, [])).status).toBe(2);
    const unreadable = await cli(root, ["vitest"]);
    expect(unreadable.status).toBe(2);
    expect(unreadable.stderr).toBe(
      "hm-in-image: ci/Dockerfile must have exactly one FROM line, not 0.\n",
    );
  });
});
