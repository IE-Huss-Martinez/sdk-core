import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Extractor, ExtractorConfig } from "@microsoft/api-extractor";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  checkApiReports,
  EXIT_FAILED,
  EXIT_OK,
  EXIT_USAGE,
  exportedSymbols,
  forgottenExports,
  nominalMembers,
  UsageError,
} from "./check-reports.js";

const BASE = fileURLToPath(new URL("../../api-extractor/base.json", import.meta.url));
const CLI = fileURLToPath(new URL("./cli.js", import.meta.url));

describe("forgottenExports", () => {
  it("lists each flagged symbol once, in order", () => {
    const report = [
      '    // Warning: (ae-forgotten-export) The symbol "Session" needs to be exported by the entry point react.d.ts',
      "    session: Session;",
      '    // Warning: (ae-forgotten-export) The symbol "Engine" needs to be exported by the entry point react.d.ts',
      '    // Warning: (ae-forgotten-export) The symbol "Session" needs to be exported by the entry point react.d.ts',
    ].join("\n");

    expect(forgottenExports(report)).toEqual(["Session", "Engine"]);
    expect(forgottenExports("export interface Session {}\n")).toEqual([]);
  });
});

describe("exportedSymbols", () => {
  it("reads declarations and export lists, with their kinds", () => {
    const report = [
      "export class PdfError extends SdkError<PdfErrorCode> {",
      "export abstract class Base {",
      "export interface Session {",
      "export type Code = string;",
      "export function open(): void;",
      "export const VERSION: string;",
      "export enum Mode {",
      "export namespace Tools {",
      "export { SdkError, type SdkErrorCode, Original as Renamed }",
      "    export class Indented {",
    ].join("\n");

    expect(Object.fromEntries(exportedSymbols(report))).toEqual({
      PdfError: "class",
      Base: "class",
      Session: "interface",
      Code: "type",
      open: "function",
      VERSION: "const",
      Mode: "enum",
      Tools: "namespace",
      SdkError: "reexport",
      SdkErrorCode: "reexport",
      Renamed: "reexport",
    });
  });
});

describe("nominalMembers", () => {
  it("finds #private, private and protected members, but not constructors", () => {
    const declarations = `
export declare class Secretive<T extends { a: string }> extends Base {
    #private;
    private hidden;
    protected readonly kept: number;
    static private shared;
    private constructor();
    protected constructor(value: string);
    value: { private: boolean };
    method(options: { protected: true }): void;
}
`;

    expect(nominalMembers(declarations, "Secretive")).toEqual([
      "#private",
      "private hidden",
      "protected readonly kept: number",
      "static private shared",
    ]);
  });

  it("ignores comments, strings and other classes", () => {
    const declarations = `
/** A note that says private thing; and { braces }. */
declare class Plain {
    // private comment;
    readonly label: "x; private leaked; }";
    /* ; private commented; */
    readonly key: \`keys.\${string}\`;
}
declare class PlainSecret {
    private secret;
}
`;

    expect(nominalMembers(declarations, "Plain")).toEqual([]);
    expect(nominalMembers(declarations, "PlainSecret")).toEqual(["private secret"]);
    expect(nominalMembers(declarations, "Missing")).toBeUndefined();
  });
});

/** Files written for a test, removed afterwards. */
const roots = /** @type {string[]} */ ([]);

/**
 * @param {Record<string, string>} files
 * @returns {Promise<string>}
 */
async function fixture(files) {
  const root = await mkdtemp(join(tmpdir(), "hm-check-api-reports-"));
  roots.push(root);
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), content);
  }
  return root;
}

afterAll(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

/**
 * Runs api-extractor on one entry point of a package, with a configuration
 * that extends the preset, as a consuming repository would.
 *
 * @param {string} root
 * @param {string} entry
 */
async function extract(root, entry) {
  const configPath = join(root, `api-extractor.${entry}.json`);
  await writeFile(
    configPath,
    JSON.stringify({
      extends: BASE,
      mainEntryPointFilePath: `<projectFolder>/types/${entry}.d.ts`,
      compiler: { tsconfigFilePath: "<projectFolder>/tsconfig.json" },
      apiReport: {
        enabled: true,
        reportFileName: `${entry}.api.md`,
        reportFolder: "<projectFolder>/api/",
        reportTempFolder: `<projectFolder>/temp/${entry}/`,
      },
      dtsRollup: { enabled: true, publicTrimmedFilePath: `<projectFolder>/dist/${entry}.d.ts` },
    }),
  );
  await mkdir(join(root, "api"), { recursive: true });
  /** @type {string[]} */
  const errors = [];
  Extractor.invoke(ExtractorConfig.loadFileAndPrepare(configPath), {
    localBuild: true,
    messageCallback: (message) => {
      message.handled = true;
      if (message.logLevel === "error") {
        errors.push(message.text);
      }
    },
  });
  return errors;
}

describe("checkApiReports", () => {
  /** A package with a main entry and a secondary one that uses its types. */
  const PACKAGE = {
    "package.json": '{ "name": "fixture", "version": "1.0.0" }\n',
    "tsconfig.json": JSON.stringify({
      compilerOptions: { target: "ES2022", module: "NodeNext", strict: true, skipLibCheck: true },
      include: ["types"],
    }),
    "types/model.d.ts": [
      "/** @public */",
      "export interface Session { readonly id: string; }",
      "/** @public */",
      "export declare class FixtureError extends Error { readonly code: string; }",
      "/** @public */",
      "export declare class Guarded { #private; readonly id: string; }",
      "/** @public */",
      "export interface Internal { readonly secret: string; }",
      "",
    ].join("\n"),
    "types/index.d.ts": [
      'export type { Session } from "./model.js";',
      'export { FixtureError, Guarded } from "./model.js";',
      "",
    ].join("\n"),
  };

  /** @type {string} */
  let root;
  beforeAll(async () => {
    root = await fixture(PACKAGE);
    expect(await extract(root, "index")).toEqual([]);
  });

  /**
   * @param {string} name
   * @param {string[]} lines
   */
  async function secondary(name, lines) {
    await writeFile(join(root, `types/${name}.d.ts`), `${lines.join("\n")}\n`);
    expect(await extract(root, name)).toEqual([]);
    return join(root, `api/${name}.api.md`);
  }

  const main = () => join(root, "api/index.api.md");
  const types = () => join(root, "dist/index.d.ts");

  it("passes when a secondary entry copies only exported types and plain classes", async () => {
    const react = await secondary("react", [
      'import type { FixtureError, Session } from "./model.js";',
      "/** @public */",
      "export declare function useSession(): Session;",
      "/** @public */",
      "export declare function useError(): FixtureError | undefined;",
    ]);

    expect(await readFile(react, "utf8")).toContain('The symbol "Session" needs to be exported');
    expect(await checkApiReports({ main: main(), types: types(), secondary: [react] })).toEqual({
      exitCode: EXIT_OK,
      problems: [],
    });
  });

  it("fails when a secondary entry copies a type the main entry doesn't export", async () => {
    const element = await secondary("element", [
      'import type { Internal } from "./model.js";',
      "/** @public */",
      "export declare function read(): Internal;",
    ]);

    const result = await checkApiReports({ main: main(), types: types(), secondary: [element] });

    expect(result.exitCode).toBe(EXIT_FAILED);
    expect(result.problems).toEqual([
      `${element}: "Internal" is copied from the package, but the main entry point doesn't export it.`,
    ]);
  });

  it("fails when a secondary entry copies a class with #private members", async () => {
    const guard = await secondary("guard", [
      'import type { Guarded } from "./model.js";',
      "/** @public */",
      "export declare function guard(): Guarded;",
    ]);

    const result = await checkApiReports({ main: main(), types: types(), secondary: [guard] });

    expect(result.exitCode).toBe(EXIT_FAILED);
    expect(result.problems).toEqual([
      expect.stringContaining(
        'the class "Guarded" is copied, and its non-public members (`#private`)',
      ),
    ]);
  });

  it("fails when the rollup doesn't declare a copied class", async () => {
    const guard = join(root, "api/guard.api.md");
    const empty = join(root, "dist/empty.d.ts");
    await writeFile(empty, "export {};\n");

    const result = await checkApiReports({ main: main(), types: empty, secondary: [guard] });

    expect(result.problems).toEqual([`${guard}: can't find the class "Guarded" in ${empty}.`]);
  });

  it("leaves the main entry's own forgotten exports alone, but not copies of them", async () => {
    const helpers = await fixture({
      ...PACKAGE,
      "types/index.d.ts": [
        'import type { Internal } from "./model.js";',
        "/** @public */",
        "export declare function read(): Internal;",
        "",
      ].join("\n"),
      "types/react.d.ts": [
        'import type { Internal } from "./model.js";',
        "/** @public */",
        "export declare function useRead(): Internal;",
        "",
      ].join("\n"),
    });
    expect(await extract(helpers, "index")).toEqual([]);
    expect(await extract(helpers, "react")).toEqual([]);

    const report = join(helpers, "api/index.api.md");
    const react = join(helpers, "api/react.api.md");
    const rollup = join(helpers, "dist/index.d.ts");

    expect(await readFile(report, "utf8")).toContain('The symbol "Internal" needs to be exported');
    expect(await checkApiReports({ main: report, types: rollup })).toEqual({
      exitCode: EXIT_OK,
      problems: [],
    });
    expect(
      (await checkApiReports({ main: report, types: rollup, secondary: [react] })).problems,
    ).toEqual([
      `${react}: "Internal" is copied from the package, but the main entry point doesn't export it.`,
    ]);
  });

  it("fails the build when a public type references an @internal one", async () => {
    const trimmed = await fixture({
      ...PACKAGE,
      "types/index.d.ts": [
        "/**",
        " * A helper.",
        " *",
        " * @internal",
        " */",
        "export type Helper<T> = { readonly value: T };",
        "/** @public */",
        "export type Wrapped = Helper<string>;",
        "",
      ].join("\n"),
    });

    expect(await extract(trimmed, "index")).toEqual([
      expect.stringContaining(
        '"Wrapped" is marked as @public, but its signature references "Helper"',
      ),
    ]);
    expect(await readFile(join(trimmed, "api/index.api.md"), "utf8").catch(() => "")).not.toContain(
      "ae-incompatible-release-tags",
    );
  });

  it("throws a UsageError for a file it can't read", async () => {
    await expect(
      checkApiReports({ main: join(root, "missing.api.md"), types: types() }),
    ).rejects.toBeInstanceOf(UsageError);
  });

  describe("the command", () => {
    /** @param {string[]} args */
    const run = (args) => spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });

    it("exits 0 for passing reports, and 1 with the problems otherwise", async () => {
      const react = join(root, "api/react.api.md");
      const element = join(root, "api/element.api.md");

      expect(run(["--main", main(), "--types", types(), react]).status).toBe(EXIT_OK);
      const failed = run(["-m", main(), "-t", types(), react, element]);
      expect(failed.status).toBe(EXIT_FAILED);
      expect(failed.stderr).toContain('"Internal" is copied from the package');
    });

    it("exits 2 for usage errors and unreadable files", () => {
      expect(run([]).status).toBe(EXIT_USAGE);
      expect(run(["--main", main()]).status).toBe(EXIT_USAGE);
      expect(run(["--unknown"]).status).toBe(EXIT_USAGE);
      const missing = run(["--main", join(root, "missing.api.md"), "--types", types()]);
      expect(missing.status).toBe(EXIT_USAGE);
      expect(missing.stderr).toContain("hm-check-api-reports: Can't read");
      expect(run(["--help"]).stdout).toContain("Usage: hm-check-api-reports");
    });
  });
});
