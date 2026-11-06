import { createEngine } from "@secretlint/node";
import { describe, expect, it } from "vitest";
import config from "./index.js";

/**
 * @param {string} content
 * @returns {Promise<{ ok: boolean, output: string }>}
 */
async function scan(content) {
  const engine = await createEngine({
    configFileJSON: config,
    formatter: "stylish",
    color: false,
    maskSecrets: true,
  });
  return engine.executeOnContent({ content, filePath: "src/config.ts" });
}

// Built at runtime, so this file doesn't itself contain token-shaped strings.
const GITHUB_TOKEN = `ghp_${"a1B2c3D4e5".repeat(4).slice(0, 36)}`;
const NPM_TOKEN = `npm_${"Z9y8X7w6V5".repeat(4).slice(0, 36)}`;

describe("secretlint preset", () => {
  it("detects a leaked GitHub token and masks it in the report", async () => {
    const { ok, output } = await scan(`export const token = "${GITHUB_TOKEN}";\n`);
    expect(ok).toBe(false);
    expect(output).toContain("GITHUB_TOKEN");
    expect(output).not.toContain(GITHUB_TOKEN);
  });

  it("detects an npm token", async () => {
    const { ok, output } = await scan(`//registry.npmjs.org/:_authToken=${NPM_TOKEN}\n`);
    expect(ok).toBe(false);
    expect(output).toContain("NPM_ACCESS_TOKEN");
  });

  it("accepts ordinary code", async () => {
    await expect(scan('export const name = "sdk-core";\n')).resolves.toMatchObject({ ok: true });
  });
});
