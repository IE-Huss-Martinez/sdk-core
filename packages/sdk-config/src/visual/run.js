import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import { join, posix } from "node:path";
import { parse, parseAllDocuments } from "yaml";

/** Exit code when the screenshots match, or were written. */
export const EXIT_OK = 0;
/** Exit code when a screenshot differs, a test fails, or Docker isn't available. */
export const EXIT_FAILED = 1;
/** Exit code for usage errors, or a repository this can't read. */
export const EXIT_USAGE = 2;

/** The environment variable the browser test image sets (ADR 0048). */
export const CONTAINER_ENV = "HM_VISUAL_CONTAINER";
/** The visual Playwright configuration, relative to the repository. */
export const CONFIG = "e2e/playwright.visual.config.ts";
/** The committed baselines, relative to the repository. */
export const BASELINES = "e2e/visual/__screenshots__";

/** The browser test image's only allowed form (ADR 0025), as sdk-ci's image action checks it. */
const IMAGE = /^mcr\.microsoft\.com\/playwright:v\d+\.\d+\.\d+-noble@sha256:[0-9a-f]{64}$/;

/**
 * An error the user can fix, reported as a message without a stack trace.
 */
export class UsageError extends Error {
  /** @override */
  name = "UsageError";
}

/**
 * Reads the browser test image from `ci/Dockerfile`'s only `FROM` line.
 *
 * @param {string} root The repository.
 * @returns {string} The image, pinned by tag and digest.
 * @throws {UsageError} Without exactly one `FROM` line in the allowed form.
 */
export function readImage(root) {
  const file = join(root, "ci", "Dockerfile");
  if (!existsSync(file)) {
    throw new UsageError(
      "ci/Dockerfile doesn't exist; it holds the browser test image (sdk-core ADR 0025).",
    );
  }
  const froms = readFileSync(file, "utf8")
    .split("\n")
    .map((line) => /^\s*FROM\s+(\S+)/i.exec(line)?.[1])
    .filter((image) => image !== undefined);
  if (froms.length !== 1) {
    throw new UsageError(`ci/Dockerfile must have exactly one FROM line, not ${froms.length}.`);
  }
  const image = /** @type {string} */ (froms[0]);
  if (!IMAGE.test(image)) {
    throw new UsageError(
      `ci/Dockerfile's image must be mcr.microsoft.com/playwright:v<version>-noble@sha256:<digest>, not ${image}.`,
    );
  }
  return image;
}

/**
 * Reads the root package.json's name and its pnpm version.
 *
 * @param {string} root The repository.
 * @returns {{ name: string, pnpm: string }}
 * @throws {UsageError} Without a `packageManager` of the form `pnpm@<version>`.
 */
export function readWorkspace(root) {
  /** @type {{ name?: unknown, packageManager?: unknown }} */
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  } catch {
    throw new UsageError("package.json can't be read; run this from the repository's root.");
  }
  const pnpm = /^pnpm@(\d+\.\d+\.\d+)(?:\+.*)?$/.exec(String(manifest.packageManager ?? ""))?.[1];
  if (!pnpm) {
    throw new UsageError('package.json\'s packageManager must be "pnpm@<version>".');
  }
  return { name: typeof manifest.name === "string" ? manifest.name : "", pnpm };
}

/** A Subresource Integrity value as pnpm records it. Checked before it's written into a Dockerfile. */
const INTEGRITY = /^sha512-[A-Za-z0-9+/]{86}==$/;

/** The pnpm binaries the browser test image can need: it's Ubuntu, on x64 or arm64. */
const PNPM_BINARIES = /** @type {const} */ (["linux-x64", "linux-arm64"]);

/**
 * @typedef {object} PinnedPnpm
 * @property {string} version The version, from `packageManager`.
 * @property {string} integrity The `pnpm` package's tarball integrity.
 * @property {Record<(typeof PNPM_BINARIES)[number], string>} binaries The
 *   integrity of each `@pnpm/exe.<target>` tarball, which carries the native
 *   binary the `pnpm` package runs.
 */

/**
 * Reads the integrity of pnpm and of its Linux binaries from the document
 * that pnpm-lock.yaml keeps for the package manager itself, so the image
 * installs exactly what the repository's lockfile records.
 *
 * @param {string} root The repository.
 * @param {string} version The pnpm version from `packageManager`.
 * @returns {PinnedPnpm}
 * @throws {UsageError} When the lockfile doesn't record that version of
 *   pnpm with every integrity.
 */
export function readPinnedPnpm(root, version) {
  let text;
  try {
    text = readFileSync(join(root, "pnpm-lock.yaml"), "utf8");
  } catch {
    throw new UsageError("pnpm-lock.yaml can't be read; it records pnpm's integrity.");
  }
  const fix = `Run pnpm install with pnpm ${version}, so pnpm-lock.yaml records it.`;
  for (const document of parseAllDocuments(text)) {
    const lockfile = /** @type {Record<string, any> | null} */ (
      document.errors.length > 0 ? null : document.toJS()
    );
    const recorded = lockfile?.["importers"]?.["."]?.["packageManagerDependencies"]?.["pnpm"];
    if (recorded === undefined) {
      continue;
    }
    if (recorded?.version !== version) {
      throw new UsageError(
        `pnpm-lock.yaml records pnpm ${recorded?.version}, but packageManager is pnpm@${version}. ${fix}`,
      );
    }
    const integrity = (/** @type {string} */ key) => {
      const value = lockfile?.["packages"]?.[key]?.["resolution"]?.["integrity"];
      if (typeof value !== "string" || !INTEGRITY.test(value)) {
        throw new UsageError(`pnpm-lock.yaml has no sha512 integrity for ${key}. ${fix}`);
      }
      return value;
    };
    return {
      version,
      integrity: integrity(`pnpm@${version}`),
      binaries: {
        "linux-x64": integrity(`@pnpm/exe.linux-x64@${version}`),
        "linux-arm64": integrity(`@pnpm/exe.linux-arm64@${version}`),
      },
    };
  }
  throw new UsageError(`pnpm-lock.yaml doesn't record pnpm itself. ${fix}`);
}

/** Checks tarballs against their integrity: `node -e` this with file and integrity pairs. */
const VERIFY = [
  'const { createHash } = require("node:crypto");',
  'const { readFileSync } = require("node:fs");',
  "const pairs = process.argv.slice(1);",
  "for (let i = 0; i < pairs.length; i += 2) {",
  '  const actual = "sha512-" + createHash("sha512").update(readFileSync(pairs[i])).digest("base64");',
  "  if (actual !== pairs[i + 1]) {",
  '    console.error("hm-test-visual: " + pairs[i] + " is " + actual + ", but pnpm-lock.yaml records " + pairs[i + 1] + ".");',
  "    process.exit(1);",
  "  }",
  "}",
].join(" ");

/**
 * The image's Dockerfile: the browser test image, with the repository's pnpm
 * and the variable that lets the visual configuration run.
 *
 * pnpm is installed from tarballs checked against the integrity in
 * pnpm-lock.yaml: the `pnpm` package and the native binary for the image's
 * architecture, both as local files, with no install scripts, so nothing
 * else is fetched or downloaded on first use.
 *
 * @param {string} image The browser test image.
 * @param {PinnedPnpm} pnpm The pnpm version and its integrity.
 * @returns {string}
 */
export function dockerfile(image, pnpm) {
  const { version, integrity, binaries } = pnpm;
  const arches = PNPM_BINARIES.map(
    (target) =>
      `${target === "linux-x64" ? "x86_64" : "aarch64"}) target=${target}; binary_integrity=${binaries[target]};;`,
  ).join(" ");
  const steps = [
    "set -eu",
    "cd /tmp",
    `case "$(uname -m)" in ${arches} *) echo "hm-test-visual: no pinned pnpm binary for $(uname -m)." >&2; exit 1;; esac`,
    `wrapper=$(npm pack --silent pnpm@${version})`,
    `binary=$(npm pack --silent "@pnpm/exe.$target@${version}")`,
    `node -e '${VERIFY}' "$wrapper" "${integrity}" "$binary" "$binary_integrity"`,
    'npm install --global --ignore-scripts --no-audit --no-fund "./$wrapper" "./$binary"',
    'rm -f "$wrapper" "$binary"',
  ];
  return [`FROM ${image}`, `RUN ${steps.join("; \\\n  ")}`, `ENV ${CONTAINER_ENV}=1`, ""].join(
    "\n",
  );
}

/**
 * The image's tag and the prefix of its volumes: `hm-visual-` and the
 * workspace's name, in the characters Docker allows.
 *
 * @param {string} name The root package.json's name.
 * @returns {string}
 */
export function imageTag(name) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `hm-visual-${slug || "workspace"}`;
}

/**
 * Every folder `pnpm-workspace.yaml` covers that has a package.json, in
 * order, except the root itself. It supports what the family's workspaces
 * use: literal folders, `folder/*` and `.`.
 *
 * @param {string} root The repository.
 * @returns {string[]} Folders relative to the root, with `/` separators.
 */
export function workspacePackageDirs(root) {
  const file = join(root, "pnpm-workspace.yaml");
  if (!existsSync(file)) {
    return [];
  }
  const { packages = [] } = /** @type {{ packages?: unknown[] }} */ (
    parse(readFileSync(file, "utf8")) ?? {}
  );
  /** @type {string[]} */
  const dirs = [];
  for (const pattern of packages) {
    if (typeof pattern !== "string" || pattern.startsWith("!")) {
      continue;
    }
    const clean = pattern.replace(/\/+$/, "");
    const candidates = clean.endsWith("/*")
      ? readdirSync(join(root, clean.slice(0, -2)), { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .map((entry) => `${clean.slice(0, -2)}/${entry.name}`)
          .sort()
      : [clean];
    for (const candidate of candidates) {
      const dir = posix.normalize(candidate);
      // The root, such as the "." that Changesets needs listed, already has
      // its node_modules volume, and Docker refuses a second mount there.
      // Nothing outside the root is mounted at all.
      if (dir === "." || dir === ".." || dir.startsWith("../") || dir.startsWith("/")) {
        continue;
      }
      if (existsSync(join(root, dir, "package.json")) && !dirs.includes(dir)) {
        dirs.push(dir);
      }
    }
  }
  return dirs;
}

/**
 * The arguments of `docker run`: the checkout mounted at `/work`, its own
 * volumes for every `node_modules` and the pnpm store, so the container never
 * writes into the host's, and afterwards every root-owned file in the
 * checkout, such as new screenshots and results, handed back to the caller.
 *
 * @param {{ root: string, tag: string, dirs: string[], owner: string, update: boolean }} options
 * @returns {string[]}
 */
export function dockerRunArgs({ root, tag, dirs, owner, update }) {
  const volume = (/** @type {string} */ name, /** @type {string} */ path) => [
    "--volume",
    `${tag}-${name}:/work/${path}`,
  ];
  const script = [
    "pnpm install --frozen-lockfile --store-dir /pnpm-store --reporter=silent",
    `&& pnpm exec hm-test-visual${update ? " --update" : ""}; status=$?;`,
    // -xdev stays on the checkout's filesystem, out of the volumes. It never
    // fails the run: the tests' status is what counts.
    `find /work -xdev -user 0 -exec chown ${owner} {} + 2>/dev/null || true;`,
    "exit $status",
  ].join(" ");
  return [
    "run",
    "--rm",
    "--init",
    "--ipc=host",
    "--env",
    "HUSKY=0",
    "--volume",
    `${root}:/work`,
    ...volume("root-modules", "node_modules"),
    // One per package: pnpm installs into each, and a package left out would
    // get root-owned node_modules in the host's checkout.
    ...dirs.flatMap((dir) => volume(`${dir.replaceAll("/", "-")}-modules`, `${dir}/node_modules`)),
    "--volume",
    `${tag}-store:/pnpm-store`,
    "--workdir",
    "/work",
    tag,
    "bash",
    "-c",
    script,
  ];
}

/**
 * @typedef {(command: string, args: string[], options: { cwd: string, input?: string, quiet?: boolean }) => number} Run
 *   Runs a command and returns its exit status. Its output is the caller's,
 *   unless `quiet`.
 */

/** @type {Run} */
const defaultRun = (command, args, { cwd, input, quiet = false }) => {
  const output = quiet ? "ignore" : "inherit";
  const result = spawnSync(command, args, {
    cwd,
    input,
    stdio: [input === undefined ? "inherit" : "pipe", output, output],
  });
  return result.error ? EXIT_FAILED : (result.status ?? EXIT_FAILED);
};

/**
 * Inside the browser test image: runs the visual configuration with
 * Playwright. With `update`, the baselines are moved aside first and written
 * afresh, so screenshots that no state produces any more disappear; if the
 * run fails, the previous baselines are put back.
 *
 * @param {{ root: string, update: boolean, run?: Run }} options
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
 * Outside the image: builds it from `ci/Dockerfile`'s image and the
 * repository's pnpm, then runs `hm-test-visual` inside it.
 *
 * @param {{ root: string, update: boolean, owner: string, run?: Run, log?: (message: string) => void }} options
 * @returns {number} The exit code.
 * @throws {UsageError} When the repository's image or pnpm can't be read.
 */
export function runInDocker({ root, update, owner, run = defaultRun, log = () => {} }) {
  const image = readImage(root);
  const { name, pnpm: version } = readWorkspace(root);
  const pnpm = readPinnedPnpm(root, version);
  if (run("docker", ["info", "--format", "{{.ServerVersion}}"], { cwd: root, quiet: true }) !== 0) {
    log(
      "Docker isn't available. Install Docker (https://docs.docker.com/get-docker/), start it, and run this again.",
    );
    return EXIT_FAILED;
  }
  const tag = imageTag(name);
  if (
    run("docker", ["build", "--quiet", "--tag", tag, "-"], {
      cwd: root,
      input: dockerfile(image, pnpm),
    }) !== 0
  ) {
    log("the visual test image didn't build.");
    return EXIT_FAILED;
  }
  const dirs = workspacePackageDirs(root);
  return run("docker", dockerRunArgs({ root, tag, dirs, owner, update }), { cwd: root });
}
