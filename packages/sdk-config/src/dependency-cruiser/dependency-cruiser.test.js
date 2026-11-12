import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cruise } from "dependency-cruiser";
import { describe, expect, it } from "vitest";
import config from "./index.js";

/**
 * Cruises a fixture package with the preset and lists each violation as
 * `rule: from -> to`, with paths relative to the fixture's `src/`.
 *
 * @param {string} fixture Folder name under `test/fixtures`.
 * @returns {Promise<string[]>}
 */
async function violations(fixture) {
  const baseDir = fileURLToPath(new URL(`../../test/fixtures/${fixture}`, import.meta.url));
  const { output } = await cruise(["src"], {
    ...config.options,
    baseDir,
    ruleSet: { forbidden: config.forbidden ?? [] },
    validate: true,
  });
  if (typeof output === "string") {
    throw new TypeError("expected a structured cruise result");
  }
  /** @param {string} path */
  const relative = (path) => path.replace(/^src\//, "");
  return output.summary.violations
    .map(({ rule, from, to }) => `${rule.name}: ${relative(from)} -> ${relative(to)}`)
    .sort();
}

/**
 * @param {string[]} list
 * @param {string} rule
 * @returns {string[]}
 */
const withRule = (list, rule) => list.filter((violation) => violation.startsWith(`${rule}:`));

/**
 * @param {string[]} list
 * @param {string} rule
 * @returns {string[]}
 */
const withoutRule = (list, rule) => list.filter((violation) => !violation.startsWith(`${rule}:`));

describe("dependency-cruiser preset", () => {
  it("reports every forbidden edge between the layers of ADR 0008 and ADR 0017", async () => {
    // The fixture installs no packages, so its npm imports are also unresolvable.
    const layerViolations = withoutRule(await violations("layered-sdk"), "not-to-unresolvable");
    expect(layerViolations).toEqual([
      "core-no-ui: core/operations/rotate.ts -> @hussmartinez/ui",
      "core-no-ui: core/session/store.ts -> react",
      "layer-adapters: adapters/engine/engine.ts -> core/session/events.ts",
      "layer-core: core/session/store.ts -> adapters/engine/engine.ts",
      "layer-errors: core/errors/errors.ts -> core/session/events.ts",
      "layer-features: features/rotate/rotate.operation.ts -> adapters/engine/engine.ts",
      "layer-model: core/model/page.ts -> core/session/events.ts",
      "layer-operations: core/operations/rotate.ts -> core/ports/engine.ts",
    ]);
  });

  it("reports imports that don't resolve", async () => {
    expect(withRule(await violations("layered-sdk"), "not-to-unresolvable")).toEqual([
      "not-to-unresolvable: core/errors/errors.ts -> @hussmartinez/sdk-core",
      "not-to-unresolvable: core/operations/rotate.ts -> @hussmartinez/ui",
      "not-to-unresolvable: core/session/store.ts -> @hussmartinez/sdk-core",
      "not-to-unresolvable: core/session/store.ts -> react",
    ]);
  });

  it("keeps React and ui out of the core, adapters and workers (ADR 0017, ADR 0036)", async () => {
    // The fixture installs no packages, so its npm imports are also unresolvable.
    expect(withRule(await violations("ui-reach"), "core-no-ui")).toEqual([
      "core-no-ui: adapters/engine/engine.ts -> react",
      // Even ui's root entry, and even as types.
      "core-no-ui: core/session/icons.ts -> @hussmartinez/ui",
      "core-no-ui: workers/render.worker.ts -> @hussmartinez/ui",
    ]);
  });

  it("keeps React and ui's React entry out of everything the . entry reaches, even as types", async () => {
    expect(withRule(await violations("ui-reach"), "entry-no-react")).toEqual([
      "entry-no-react: index.ts -> @hussmartinez/ui/react",
      "entry-no-react: index.ts -> react",
    ]);
  });

  it("lets a feature the . entry reaches import ui's root entry, types and values", async () => {
    const reported = withoutRule(await violations("ui-reach"), "not-to-unresolvable");
    expect(
      reported.filter((violation) => violation.includes("features/tools/rotate.tool.ts")),
    ).toEqual([]);
    // Nothing reports the root entry itself as reached from index.ts.
    expect(reported).not.toContain("entry-no-react: index.ts -> @hussmartinez/ui");
  });

  it("matches React and ui's React entry as installed, but not ui's root entry", () => {
    const rule = /** @type {{ to: { path?: string | string[] } } | undefined} */ (
      (config.forbidden ?? []).find(({ name }) => name === "entry-no-react")
    );
    const patterns = [rule?.to.path ?? []].flat().map((path) => new RegExp(path));
    const matches = (/** @type {string} */ path) => patterns.some((pattern) => pattern.test(path));
    const ui = "node_modules/.pnpm/@hussmartinez+ui@0.3.0/node_modules/@hussmartinez/ui";
    for (const path of [
      "react",
      "react-dom/client",
      "node_modules/.pnpm/react@19.3.1/node_modules/react/index.js",
      "@hussmartinez/ui/react",
      `${ui}/dist/react.js`,
      `${ui}/dist/react.d.ts`,
      "node_modules/react/index.js",
      "node_modules/@hussmartinez/ui/dist/react.js",
    ]) {
      expect(matches(path), path).toBe(true);
    }
    for (const path of [
      "@hussmartinez/ui",
      `${ui}/dist/index.js`,
      `${ui}/dist/index.d.ts`,
      `${ui}/dist/shared/pair-BrwWt2Rz.js`,
      "node_modules/react-markdown/index.js",
    ]) {
      expect(matches(path), path).toBe(false);
    }
  });

  it("names the path from the . entry to React", async () => {
    const baseDir = fileURLToPath(new URL("../../test/fixtures/ui-reach", import.meta.url));
    const { output } = await cruise(["src"], {
      ...config.options,
      baseDir,
      ruleSet: { forbidden: config.forbidden ?? [] },
      validate: true,
    });
    if (typeof output === "string") {
      throw new TypeError("expected a structured cruise result");
    }
    const paths = output.summary.violations
      .filter(({ rule }) => rule.name === "entry-no-react")
      .map(({ via }) => via?.map(({ name }) => name));
    expect(paths).toEqual(
      expect.arrayContaining([
        ["src/features/toolbar/toolbar.ts", "@hussmartinez/ui/react"],
        ["src/features/tools/render.ts", "react"],
      ]),
    );
  });

  describe("with installed packages that live in dist/", () => {
    /**
     * A package with real `node_modules`, written to a temporary directory
     * because git doesn't keep `node_modules` in fixtures. Its packages keep
     * their code in `dist/`, as most published packages do.
     */
    const FILES = {
      "package.json": JSON.stringify({
        name: "installed-sdk",
        type: "module",
        dependencies: { "@hussmartinez/ui": "0.3.0", engine: "1.0.0" },
        devDependencies: { tester: "1.0.0" },
      }),
      "node_modules/@hussmartinez/ui/package.json": JSON.stringify({
        name: "@hussmartinez/ui",
        type: "module",
        exports: { ".": "./dist/index.js", "./react": "./dist/react.js" },
      }),
      "node_modules/@hussmartinez/ui/dist/index.js": "export const Button = 1;\n",
      "node_modules/@hussmartinez/ui/dist/react.js": "export const Toolbar = 1;\n",
      "node_modules/engine/package.json": JSON.stringify({
        name: "engine",
        type: "module",
        main: "dist/index.js",
      }),
      "node_modules/engine/dist/index.js": "export const decode = 1;\n",
      "node_modules/tester/package.json": JSON.stringify({
        name: "tester",
        type: "module",
        main: "dist/index.js",
      }),
      "node_modules/tester/dist/index.js": "export const it = 1;\n",
      "src/index.ts": 'export { Toolbar } from "@hussmartinez/ui/react";\n',
      "src/core/model/page.ts":
        'import { Button } from "@hussmartinez/ui";\nexport const page = Button;\n',
      "src/adapters/engine.ts": 'import { it } from "tester";\nexport const engine = it;\n',
      "src/core/errors/errors.ts":
        'import { decode } from "engine";\nexport const errors = decode;\n',
      "src/core/errors/errors.test.ts":
        'import { it } from "tester";\nimport { errors } from "./errors.ts";\nit(errors);\n',
      // The package's own build output and fixtures stay out of the cruise.
      "dist/index.js": 'import "@hussmartinez/ui/react";\n',
      "src/fixtures/leak.ts": 'import "@hussmartinez/ui/react";\n',
    };

    /** @returns {Promise<string[]>} */
    async function installedViolations() {
      const baseDir = await mkdtemp(join(tmpdir(), "hm-installed-sdk-"));
      try {
        for (const [path, content] of Object.entries(FILES)) {
          await mkdir(dirname(join(baseDir, path)), { recursive: true });
          await writeFile(join(baseDir, path), content);
        }
        const { output } = await cruise(["src", "dist"], {
          ...config.options,
          baseDir,
          ruleSet: { forbidden: config.forbidden ?? [] },
          validate: true,
        });
        if (typeof output === "string") {
          throw new TypeError("expected a structured cruise result");
        }
        return output.summary.violations
          .map(({ rule, from, to }) => `${rule.name}: ${from} -> ${to}`)
          .sort();
      } finally {
        await rm(baseDir, { recursive: true, force: true });
      }
    }

    it("checks imports that resolve into a package's dist/, and only the package's own dist/ is left out", async () => {
      expect(await installedViolations()).toEqual([
        "core-no-ui: src/core/model/page.ts -> node_modules/@hussmartinez/ui/dist/index.js",
        "entry-no-react: src/index.ts -> node_modules/@hussmartinez/ui/dist/react.js",
        "layer-errors: src/core/errors/errors.ts -> node_modules/engine/dist/index.js",
        "not-to-dev-dep: src/adapters/engine.ts -> node_modules/tester/dist/index.js",
      ]);
    });
  });

  it("leaves out the repository's build output and fixtures, but not packages' dist/", () => {
    const exclude = /** @type {{ path: string[] }} */ (config.options?.exclude);
    const patterns = exclude.path.map((path) => new RegExp(path));
    const excluded = {
      test: (/** @type {string} */ path) => patterns.some((pattern) => pattern.test(path)),
    };
    for (const path of [
      "dist/index.js",
      "temp/types/index.d.ts",
      "coverage/index.html",
      "packages/sdk-core/dist/index.js",
      "apps/docs/dist/main.js",
      "src/worker/fixtures/echo.ts",
      "test/fixtures/layered-sdk/src/index.ts",
    ]) {
      expect(excluded.test(path), path).toBe(true);
    }
    for (const path of [
      "node_modules/@hussmartinez/ui/dist/react.js",
      "node_modules/.pnpm/mediabunny@1.0.0/node_modules/mediabunny/dist/bundles/mediabunny.mjs",
      "node_modules/react/cjs/react.production.js",
      "node_modules/some-package/fixtures/x.js",
      "src/core/model/page.ts",
      "src/dist-helpers/format.ts",
    ]) {
      expect(excluded.test(path), path).toBe(false);
    }
  });

  it("reports cycles", async () => {
    await expect(violations("cycle")).resolves.toEqual(["no-circular: a.ts -> b.ts"]);
  });
});
