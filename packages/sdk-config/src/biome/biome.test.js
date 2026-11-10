import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const PRESET = fileURLToPath(new URL("../../biome/base.jsonc", import.meta.url));
const BIOME = fileURLToPath(new URL("../../node_modules/.bin/biome", import.meta.url));

/** @type {string} */
let project;

/**
 * Lints TypeScript with the preset, in a project that extends it the way a
 * consuming repository does, and returns the diagnostic categories.
 *
 * @param {string} code
 * @returns {Promise<string[]>}
 */
async function lint(code) {
  await writeFile(join(project, "probe.ts"), code);
  const { stdout } = spawnSync(BIOME, ["lint", "--reporter=json", "probe.ts"], {
    cwd: project,
    encoding: "utf8",
  });
  /** @type {{ diagnostics: Array<{ category: string }> }} */
  const report = JSON.parse(stdout);
  return report.diagnostics.map((diagnostic) => diagnostic.category);
}

beforeAll(async () => {
  project = await mkdtemp(join(tmpdir(), "hm-biome-"));
  // The preset reads .gitignore through Biome's git integration.
  execFileSync("git", ["init", "-q"], { cwd: project });
  await writeFile(join(project, ".gitignore"), "");
  await writeFile(join(project, "biome.json"), JSON.stringify({ extends: [PRESET] }));
});

afterAll(async () => {
  await rm(project, { recursive: true, force: true });
});

describe("Biome preset", () => {
  it("allows bracket access on index signatures, which the tsconfig preset requires", async () => {
    const code =
      'const values: Record<string, unknown> = {};\nexport const name = values["name"];\n';
    await expect(lint(code)).resolves.toEqual([]);
  });

  it("applies the preset's own rules", async () => {
    await expect(lint("export const value: any = 1;\n")).resolves.toEqual([
      "lint/suspicious/noExplicitAny",
    ]);
  });

  it("doesn't pin a Biome schema version", async () => {
    // A $schema here would be checked against each consumer's own Biome CLI,
    // so any other version would print a notice. Consumers keep their own.
    const preset = await readFile(PRESET, "utf8");

    expect(preset).not.toMatch(/"\$schema"/);
  });

  it("doesn't make Biome print a schema version notice", async () => {
    await writeFile(join(project, "probe.ts"), "export const value = 1;\n");
    const { stdout, stderr } = spawnSync(BIOME, ["lint", "probe.ts"], {
      cwd: project,
      encoding: "utf8",
    });

    expect(`${stdout}${stderr}`).not.toContain("schema version does not match");
  });
});
