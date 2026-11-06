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

describe("dependency-cruiser preset", () => {
  it("reports every forbidden edge between the layers of ADR 0008", async () => {
    await expect(violations("layered-sdk")).resolves.toEqual([
      "core-no-react: core/session/store.ts -> react",
      "layer-adapters: adapters/engine/engine.ts -> core/session/events.ts",
      "layer-core: core/session/store.ts -> adapters/engine/engine.ts",
      "layer-features: features/rotate/rotate.operation.ts -> adapters/engine/engine.ts",
      "layer-model: core/model/page.ts -> core/session/events.ts",
      "layer-operations: core/operations/rotate.ts -> core/ports/engine.ts",
      "not-to-unresolvable: core/session/store.ts -> react",
    ]);
  });

  it("reports cycles", async () => {
    await expect(violations("cycle")).resolves.toEqual(["no-circular: a.ts -> b.ts"]);
  });
});
