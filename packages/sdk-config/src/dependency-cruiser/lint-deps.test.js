import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { EXIT_FAILED, EXIT_OK, EXIT_USAGE, lintDeps } from "./lint-deps.js";

const PRESET_URL = new URL("./index.js", import.meta.url).href;
const CLI = fileURLToPath(new URL("./cli.js", import.meta.url));
const HIDE_TYPESCRIPT = fileURLToPath(new URL("../../test/hide-typescript.js", import.meta.url));

/** A small, valid package: TypeScript and JavaScript sources plus files that aren't cruised. */
const SOURCES = {
  "package.json": '{ "name": "fixture", "private": true, "type": "module" }\n',
  "src/index.ts": 'export { helper } from "./helper.js";\n',
  "src/helper.ts": "export const helper = (): number => 1;\n",
  "src/legacy.js": 'import { helper } from "./helper.js";\nexport const legacy = helper;\n',
  "src/types.d.ts": "export type Id = string;\n",
  "src/data.json": "{}\n",
  "src/styles.css": ".hm-a {}\n",
  "src/README.md": "# Fixture\n",
  "src/fixtures/broken.ts": 'import "./missing.js";\n',
};

/** @type {string[]} */
const repos = [];

/**
 * Creates a git repository with the preset's configuration and the given
 * files staged, so `git ls-files` lists them.
 *
 * @param {Record<string, string>} files
 * @param {{ git?: boolean, config?: string }} [options]
 * @returns {Promise<string>}
 */
async function repository(files, { git = true, config } = {}) {
  const root = await mkdtemp(join(tmpdir(), "hm-lint-deps-"));
  repos.push(root);
  const all = {
    ".dependency-cruiser.js": config ?? `export { default } from ${JSON.stringify(PRESET_URL)};\n`,
    ...files,
  };
  for (const [path, content] of Object.entries(all)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), content);
  }
  if (git) {
    execFileSync("git", ["init", "-q"], { cwd: root });
    execFileSync("git", ["add", "-A"], { cwd: root });
  }
  return root;
}

/**
 * @param {string} cwd
 * @param {string[]} args
 * @param {string[]} [nodeOptions]
 */
function runCli(cwd, args, nodeOptions = []) {
  return spawnSync(process.execPath, [...nodeOptions, CLI, ...args], { cwd, encoding: "utf8" });
}

afterEach(async () => {
  await Promise.all(repos.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("hm-lint-deps", () => {
  it("passes when every tracked source file is analysed", async () => {
    const cwd = await repository(SOURCES);
    const result = await lintDeps({ paths: ["src"], cwd });

    expect(result).toMatchObject({ exitCode: EXIT_OK, problems: "" });
    expect(result.report).toContain("no dependency violations found");
  });

  it("fails and names the .ts files when TypeScript can't be loaded", async () => {
    const cwd = await repository(SOURCES);
    const { status, stderr } = runCli(cwd, ["src"], ["--import", HIDE_TYPESCRIPT]);

    expect(status).toBe(EXIT_FAILED);
    expect(stderr).toContain(
      "didn't analyse 2 tracked source files:\n  src/helper.ts\n  src/index.ts\n",
    );
    expect(stderr).toContain("can't parse .ts files");
    expect(stderr).toContain("typescript >=");
    // The JavaScript file is still analysed, which is why a module count can't catch this.
    expect(stderr).not.toContain("src/legacy.js");
  });

  it("fails on a tracked file whose parser isn't installed", async () => {
    const cwd = await repository(
      { ...SOURCES, "src/old.coffee": "legacy = 1\n" },
      {
        config: [
          `import preset from ${JSON.stringify(PRESET_URL)};`,
          "const extensions = [...preset.options.enhancedResolveOptions.extensions, '.coffee'];",
          "export default {",
          "  ...preset,",
          "  options: {",
          "    ...preset.options,",
          "    enhancedResolveOptions: { ...preset.options.enhancedResolveOptions, extensions },",
          "  },",
          "};",
          "",
        ].join("\n"),
      },
    );
    const result = await lintDeps({ paths: ["src"], cwd });

    expect(result.exitCode).toBe(EXIT_FAILED);
    expect(result.problems).toContain("didn't analyse 1 tracked source file:\n  src/old.coffee\n");
    expect(result.problems).toContain("can't parse .coffee files");
  });

  it("still reports rule violations", async () => {
    const cwd = await repository({
      ...SOURCES,
      "src/a.ts": 'import { b } from "./b.js";\nexport const a = b;\n',
      "src/b.ts": 'import { a } from "./a.js";\nexport const b = a;\n',
    });
    const result = await lintDeps({ paths: ["src"], cwd });

    expect(result.exitCode).toBe(EXIT_FAILED);
    expect(result.report).toContain("no-circular");
    expect(result.problems).toBe("");
  });

  it("lists at most 20 missing files, then a count", async () => {
    const many = Object.fromEntries(
      Array.from({ length: 23 }, (_, index) => [
        `src/file-${String(index).padStart(2, "0")}.ts`,
        "export {};\n",
      ]),
    );
    const cwd = await repository({ ...SOURCES, ...many });
    const { status, stderr } = runCli(cwd, ["src"], ["--import", HIDE_TYPESCRIPT]);

    expect(status).toBe(EXIT_FAILED);
    expect(stderr).toContain("didn't analyse 25 tracked source files:");
    expect(stderr).toContain("  … and 5 more\n");
    expect(stderr.match(/^ {2}src\//gm)).toHaveLength(20);
  });

  describe("usage and configuration errors", () => {
    it("fails outside a git repository with a message, not a stack trace", async () => {
      const cwd = await repository(SOURCES, { git: false });
      const { status, stderr } = runCli(cwd, ["src"]);

      expect(status).toBe(EXIT_USAGE);
      expect(stderr).toMatch(/^hm-lint-deps: .+ isn't inside a git work tree\./);
      expect(stderr).not.toContain("    at ");
    });

    it("reports git's own error for a path outside the repository", async () => {
      const cwd = await repository(SOURCES);
      const outside = join(dirname(cwd), "elsewhere");
      const { status, stderr } = runCli(cwd, [outside]);

      expect(status).toBe(EXIT_USAGE);
      expect(stderr).toMatch(/^hm-lint-deps: git ls-files failed: .*is outside repository/);
      expect(stderr).not.toContain("isn't inside a git work tree");
      expect(stderr).not.toContain("    at ");
    });

    it("fails without paths", async () => {
      const cwd = await repository(SOURCES);
      const { status, stderr } = runCli(cwd, []);

      expect(status).toBe(EXIT_USAGE);
      expect(stderr).toContain("Usage: hm-lint-deps");
    });

    it("fails on an unknown option", async () => {
      const cwd = await repository(SOURCES);
      expect(runCli(cwd, ["--strict", "src"]).status).toBe(EXIT_USAGE);
    });

    it("fails when the configuration can't be loaded", async () => {
      const cwd = await repository(SOURCES);
      const { status, stderr } = runCli(cwd, ["--config", "missing.js", "src"]);

      expect(status).toBe(EXIT_USAGE);
      expect(stderr).toContain("Can't load the configuration");
    });

    it("fails when the paths contain no tracked source files", async () => {
      const cwd = await repository(SOURCES);
      const result = await lintDeps({ paths: ["docs"], cwd });

      expect(result.exitCode).toBe(EXIT_USAGE);
      expect(result.problems).toContain("git tracks no source files under docs");
    });
  });
});
