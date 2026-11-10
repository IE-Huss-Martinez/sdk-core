import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as esbuild from "esbuild";
import { build } from "vite";
import { afterAll, describe, expect, it } from "vitest";

/**
 * The package, built with its real Vite config into a temporary directory.
 * The directory has no package.json, so the `sideEffects` field can't help:
 * bundlers drop only what they can prove has no side effects.
 */
const builtPackage = (async () => {
  const directory = await mkdtemp(join(tmpdir(), "hm-sdk-core-build-"));
  await build({
    configFile: new URL("../vite.config.ts", import.meta.url).pathname,
    logLevel: "silent",
    build: { outDir: directory, emptyOutDir: true },
  });
  return directory;
})();

afterAll(async () => {
  await rm(await builtPackage, { recursive: true, force: true });
});

/**
 * Bundles an application that imports `name` alone from the built package,
 * minified. esbuild stands for the bundlers that rely on `@__PURE__`
 * annotations rather than analysing function bodies, such as webpack with
 * Terser. Rolldown, which Vite uses, analyses more, so it would hide a missing
 * annotation.
 */
async function bundleImport(name: string): Promise<string> {
  const directory = await builtPackage;
  const entry = join(directory, `app-${name}.js`);
  await writeFile(entry, `import { ${name} } from "./index.js";\nglobalThis.imported = ${name};\n`);
  const result = await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    minify: true,
    format: "esm",
    write: false,
    logLevel: "silent",
  });
  return result.outputFiles.map((file) => file.text).join("\n");
}

// Strings that only appear in sdkCoreMessages, the English catalogue.
const CATALOGUE = ["Something went wrong. Please try again.", "You can add up to {maximum} files"];

describe("tree-shaking the built package", () => {
  it("bundles the catalogue when it's imported", async () => {
    const code = await bundleImport("sdkCoreMessages");
    for (const text of CATALOGUE) {
      expect(code).toContain(text);
    }
  });

  it.each(["SdkError", "createMessages", "createWorkerClient"])(
    "drops the English catalogue from a bundle that imports only %s",
    async (name) => {
      const code = await bundleImport(name);
      for (const text of CATALOGUE) {
        expect(code).not.toContain(text);
      }
    },
  );

  it("drops SdkError from a bundle that doesn't use it", async () => {
    const code = await bundleImport("plural");
    expect(code).not.toContain("SdkError");
  });
});
