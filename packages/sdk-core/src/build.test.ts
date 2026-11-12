import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
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
    configFile: fileURLToPath(new URL("../vite.config.ts", import.meta.url)),
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

/**
 * Bundles an application that calls `createMessages` with an invalid locale,
 * which warns in development, with `process.env.NODE_ENV` defined as an
 * application's bundler defines it. Both esbuild and Rolldown, through Vite,
 * must drop the warning's text from a production bundle.
 */
async function bundleForEnvironment(
  bundler: "esbuild" | "rolldown",
  environment: "production" | "development",
): Promise<string> {
  const directory = await builtPackage;
  const entry = join(directory, `app-${bundler}-${environment}.js`);
  await writeFile(
    entry,
    `import { createMessages } from "./index.js";\nglobalThis.messages = createMessages({}, { locale: globalThis.locale });\n`,
  );
  const define = { "process.env.NODE_ENV": JSON.stringify(environment) };
  if (bundler === "esbuild") {
    const result = await esbuild.build({
      entryPoints: [entry],
      bundle: true,
      minify: true,
      format: "esm",
      write: false,
      logLevel: "silent",
      define,
    });
    return result.outputFiles.map((file) => file.text).join("\n");
  }
  const output = await build({
    configFile: false,
    logLevel: "silent",
    define,
    build: {
      write: false,
      minify: true,
      lib: { entry, formats: ["es"], fileName: "app" },
    },
  });
  const results = Array.isArray(output) ? output : [output];
  return results
    .flatMap((result) => ("output" in result ? result.output : []))
    .map((chunk) => (chunk.type === "chunk" ? chunk.code : ""))
    .join("\n");
}

// The text of the invalid-locale warning, which createMessages can print.
const WARNING = "isn't a valid locale";

describe("development warnings in the built package", () => {
  it.each(["esbuild", "rolldown"] as const)(
    "keeps them in a development bundle from %s",
    async (bundler) => {
      expect(await bundleForEnvironment(bundler, "development")).toContain(WARNING);
    },
  );

  it.each(["esbuild", "rolldown"] as const)(
    "drops their text from a production bundle from %s",
    async (bundler) => {
      const code = await bundleForEnvironment(bundler, "production");
      expect(code).not.toContain(WARNING);
      expect(code).not.toContain("[@hussmartinez/sdk-core]");
    },
  );

describe("the built element entry (ADR 0040)", () => {
  it("imports and creates a definition on a server, without browser APIs", async () => {
    const directory = await builtPackage;
    const element = (await import(
      pathToFileURL(join(directory, "element.js")).href
    )) as typeof import("./element.js");

    const define = element.createEditorElement({
      kind: "pdf",
      mount: () => ({ update() {}, unmount() {}, handle: {} }),
    });

    expect(typeof HTMLElement).toBe("undefined");
    expect(() => define()).toThrow(expect.objectContaining({ code: "UNSUPPORTED_ENVIRONMENT" }));
  });
});
