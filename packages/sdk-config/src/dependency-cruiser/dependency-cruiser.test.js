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

  it("keeps React and ui out of the adapters, the workers and everything the . entry reaches (ADR 0036)", async () => {
    // The fixture installs no packages, so its npm imports are also unresolvable.
    expect(withoutRule(await violations("ui-reach"), "not-to-unresolvable")).toEqual([
      "core-no-ui: adapters/engine/engine.ts -> react",
      "core-no-ui: workers/render.worker.ts -> @hussmartinez/ui",
      // Reached through the toolbar feature, which may import ui itself;
      // react.ts reaching the same feature is allowed, so it isn't listed.
      "entry-no-ui: index.ts -> @hussmartinez/ui/react",
    ]);
  });

  it("names the path from the . entry to ui", async () => {
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
    const entry = output.summary.violations.find(({ rule }) => rule.name === "entry-no-ui");
    expect(entry?.via?.map(({ name }) => name)).toEqual([
      "src/features/toolbar/toolbar.ts",
      "@hussmartinez/ui/react",
    ]);
  });

  it("reports cycles", async () => {
    await expect(violations("cycle")).resolves.toEqual(["no-circular: a.ts -> b.ts"]);
  });
});
