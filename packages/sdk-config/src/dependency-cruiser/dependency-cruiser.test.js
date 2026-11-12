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

  it("reports cycles", async () => {
    await expect(violations("cycle")).resolves.toEqual(["no-circular: a.ts -> b.ts"]);
  });
});
