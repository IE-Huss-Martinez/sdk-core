import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { checkSingleCopy, findDuplicates, parseKey, UsageError } from "./check.js";

const CLI = fileURLToPath(new URL("./cli.js", import.meta.url));

/**
 * A lockfile shaped like image-sdk's on 2026-11-13: pnpm's config document
 * first, then the lockfile, where ui 0.5.0 brings sdk-core 0.3.0 next to the
 * workspace's 0.4.1.
 */
const DUPLICATED = `---
lockfileVersion: '9.0'

importers:

  .:
    configDependencies: {}

packages: {}

snapshots: {}

---
lockfileVersion: '9.0'

importers:

  .:
    dependencies:
      '@hussmartinez/sdk-core':
        specifier: 'catalog:'
        version: 0.4.1
      '@hussmartinez/ui':
        specifier: 'catalog:'
        version: 0.5.0(react-dom@19.3.1(react@19.3.1))(react@19.3.1)
    devDependencies:
      '@hussmartinez/sdk-config':
        specifier: 'catalog:'
        version: 0.2.1(typescript@6.0.3)

packages:

  '@hussmartinez/sdk-config@0.2.1':
    resolution: {integrity: sha512-a}

  '@hussmartinez/sdk-core@0.3.0':
    resolution: {integrity: sha512-b}

  '@hussmartinez/sdk-core@0.4.1':
    resolution: {integrity: sha512-c}

  '@hussmartinez/ui@0.5.0':
    resolution: {integrity: sha512-d}

  react@19.3.1:
    resolution: {integrity: sha512-e}

  react@18.3.1:
    resolution: {integrity: sha512-f}

snapshots:

  '@hussmartinez/sdk-config@0.2.1(typescript@6.0.3)': {}

  '@hussmartinez/sdk-core@0.3.0': {}

  '@hussmartinez/sdk-core@0.4.1': {}

  '@hussmartinez/ui@0.5.0(react-dom@19.3.1(react@19.3.1))(react@19.3.1)':
    dependencies:
      '@hussmartinez/sdk-core': 0.3.0
    optionalDependencies:
      react: 19.3.1
`;

/** One copy of each: ui and the workspace agree, and a peer variant counts once. */
const SINGLE = `lockfileVersion: '9.0'

importers:

  .:
    dependencies:
      '@hussmartinez/sdk-core':
        specifier: 'catalog:'
        version: 0.4.1
      '@hussmartinez/ui':
        specifier: 'catalog:'
        version: 0.6.0(react@19.3.1)

  packages/editor:
    dependencies:
      '@hussmartinez/sdk-core':
        specifier: workspace:*
        version: link:../sdk-core

packages:

  '@hussmartinez/sdk-core@0.4.1':
    resolution: {integrity: sha512-c}

  '@hussmartinez/ui@0.6.0':
    resolution: {integrity: sha512-g}

snapshots:

  '@hussmartinez/sdk-core@0.4.1': {}

  '@hussmartinez/ui@0.6.0(react@19.3.1)':
    dependencies:
      '@hussmartinez/sdk-core': 0.4.1

  '@hussmartinez/ui@0.6.0(react@18.3.1)':
    dependencies:
      '@hussmartinez/sdk-core': 0.4.1
`;

describe("parseKey", () => {
  it("splits scoped and unscoped keys, without peer suffixes", () => {
    expect(
      parseKey("@hussmartinez/ui@0.5.0(react-dom@19.3.1(react@19.3.1))(react@19.3.1)"),
    ).toEqual({
      name: "@hussmartinez/ui",
      version: "0.5.0",
    });
    expect(parseKey("react@19.3.1")).toEqual({ name: "react", version: "19.3.1" });
    expect(parseKey("@hussmartinez/ui")).toBeUndefined();
  });
});

describe("findDuplicates", () => {
  it("finds a package resolved twice, and what brings each version", () => {
    expect(findDuplicates(DUPLICATED, ["@hussmartinez"])).toEqual([
      {
        name: "@hussmartinez/sdk-core",
        versions: [
          { version: "0.3.0", through: ["@hussmartinez/ui@0.5.0"] },
          { version: "0.4.1", through: ["the workspace (.)"] },
        ],
      },
    ]);
  });

  it("passes one copy, ignoring workspace links and peer variants", () => {
    expect(findDuplicates(SINGLE, ["@hussmartinez"])).toEqual([]);
  });

  it("checks only the scopes it's given", () => {
    expect(findDuplicates(DUPLICATED, ["@other"])).toEqual([]);
    expect(
      findDuplicates(DUPLICATED.replaceAll("@hussmartinez/", "@other/"), ["@other"]),
    ).toHaveLength(1);
  });

  it("refuses a lockfile that isn't YAML", () => {
    expect(() => findDuplicates("packages: [unclosed", ["@hussmartinez"])).toThrow(UsageError);
  });
});

const temporary = await mkdtemp(join(tmpdir(), "hm-single-copy-"));
afterAll(() => rm(temporary, { recursive: true, force: true }));

/** Writes a lockfile and returns its path. */
async function lockfile(/** @type {string} */ text) {
  const path = join(temporary, `${Math.random().toString(36).slice(2)}.yaml`);
  await writeFile(path, text);
  return path;
}

describe("checkSingleCopy", () => {
  it("reports each duplicate, its versions and their dependents", async () => {
    const path = await lockfile(DUPLICATED);
    const result = checkSingleCopy({ lockfile: path, scopes: ["@hussmartinez"] });

    expect(result.exitCode).toBe(1);
    expect(result.report).toBe(
      `@hussmartinez/sdk-core resolves to 2 versions in ${path}:\n` +
        "  0.3.0, through @hussmartinez/ui@0.5.0\n" +
        "  0.4.1, through the workspace (.)\n" +
        "An application must get one copy of each (sdk-core ADR 0036, ADR 0047): move every dependent to the same version.\n",
    );
  });

  it("throws a UsageError for a lockfile it can't read", () => {
    expect(() =>
      checkSingleCopy({ lockfile: join(temporary, "missing.yaml"), scopes: ["@x"] }),
    ).toThrow(UsageError);
  });
});

describe("the command", () => {
  /** @param {string[]} args @param {string} [cwd] */
  const run = (args, cwd) => spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8", cwd });

  it("exits 0 for one copy and 1 for a duplicate, reading pnpm-lock.yaml by default", async () => {
    const single = await mkdtemp(join(temporary, "single-"));
    await writeFile(join(single, "pnpm-lock.yaml"), SINGLE);
    const ok = run([], single);
    expect(ok.status).toBe(0);
    expect(ok.stdout).toContain("resolves to one version");

    const failed = run([await lockfile(DUPLICATED)]);
    expect(failed.status).toBe(1);
    expect(failed.stderr).toContain("@hussmartinez/sdk-core resolves to 2 versions");
  });

  it("takes --scope, more than once", async () => {
    const path = await lockfile(DUPLICATED);
    expect(run(["--scope", "@other", path]).status).toBe(0);
    expect(run(["-s", "@other", "-s", "@hussmartinez", path]).status).toBe(1);
  });

  it("exits 2 for usage errors and unreadable lockfiles", () => {
    expect(run(["a.yaml", "b.yaml"]).status).toBe(2);
    expect(run(["--unknown"]).status).toBe(2);
    const missing = run([join(temporary, "missing.yaml")]);
    expect(missing.status).toBe(2);
    expect(missing.stderr).toContain("hm-check-single-copy: Can't read");
    expect(run(["--help"]).stdout).toContain("Usage: hm-check-single-copy");
  });
});
