import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { allExtensions, cruise, format, getAvailableTranspilers } from "dependency-cruiser";
import extractDepcruiseConfig from "dependency-cruiser/config-utl/extract-depcruise-config";
import extractTSConfig from "dependency-cruiser/config-utl/extract-ts-config";

/** Exit code when the cruise is clean and covers every source file. */
export const EXIT_OK = 0;
/** Exit code for rule violations or source files the cruise didn't analyse. */
export const EXIT_FAILED = 1;
/** Exit code for usage and configuration errors. */
export const EXIT_USAGE = 2;

const MAX_LISTED_FILES = 20;
const DECLARATION_FILE = /\.d\.[cm]?ts$/;
const TYPESCRIPT_EXTENSION = /^\.[cm]?tsx?$/;

/**
 * An error the user can fix, reported as a message without a stack trace.
 */
export class UsageError extends Error {
  /** @override */
  name = "UsageError";
}

/**
 * @typedef {object} LintDepsOptions
 * @property {string[]} paths Files and folders to cruise, relative to `cwd`.
 * @property {string} [cwd] Working directory. Defaults to `process.cwd()`.
 * @property {string} [configFile] dependency-cruiser configuration file.
 *   Defaults to `.dependency-cruiser.js`.
 */

/**
 * @typedef {object} LintDepsResult
 * @property {number} exitCode {@link EXIT_OK}, {@link EXIT_FAILED} or {@link EXIT_USAGE}.
 * @property {string} report dependency-cruiser's error report, for stdout.
 * @property {string} problems Coverage and usage problems, for stderr.
 */

/**
 * Runs dependency-cruiser once with the repository's configuration, and also
 * fails when the cruise didn't analyse a tracked source file. A missing parser
 * makes dependency-cruiser skip files silently: without TypeScript, every
 * `.ts` file is left out, or kept as a module with no dependencies when a
 * JavaScript file imports it, and the run still passes.
 *
 * The expected files are those tracked by git under `paths` whose extension
 * the configuration resolves (`enhancedResolveOptions.extensions`) and
 * dependency-cruiser can parse in principle, minus declaration files and the
 * configuration's `exclude`, `doNotFollow` and `includeOnly` filters.
 *
 * @param {LintDepsOptions} options
 * @returns {Promise<LintDepsResult>}
 */
export async function lintDeps({
  paths,
  cwd = process.cwd(),
  configFile = ".dependency-cruiser.js",
}) {
  try {
    if (paths.length === 0) {
      throw new UsageError("Pass at least one file or folder to check.");
    }

    const config = await loadConfig(resolve(cwd, configFile), cwd);
    const { options = {}, ...ruleSet } = config;
    const expected = expectedSourceFiles(listTrackedFiles(paths, cwd), options);
    if (expected.length === 0) {
      throw new UsageError(
        `git tracks no source files under ${paths.join(", ")}, so there is nothing to check.`,
      );
    }

    const result = await runCruise(paths, cwd, options, ruleSet);
    const { output: report, exitCode: violations } = await format(result, { outputType: "err" });

    const missing = unanalysedFiles(expected, result);

    return {
      exitCode: violations > 0 || missing.length > 0 ? EXIT_FAILED : EXIT_OK,
      report: typeof report === "string" ? report : "",
      problems: missing.length > 0 ? describeMissing(missing) : "",
    };
  } catch (error) {
    const message =
      error instanceof UsageError
        ? error.message
        : `dependency-cruiser failed: ${errorText(error)}`;
    return { exitCode: EXIT_USAGE, report: "", problems: `hm-lint-deps: ${message}\n` };
  }
}

/**
 * @param {string} configPath
 * @param {string} cwd
 * @returns {Promise<import("dependency-cruiser").IConfiguration>}
 */
async function loadConfig(configPath, cwd) {
  /** @type {import("dependency-cruiser").IConfiguration} */
  let config;
  try {
    config = await extractDepcruiseConfig(configPath, new Set(), cwd);
  } catch (error) {
    throw new UsageError(`Can't load the configuration ${configPath}: ${errorText(error)}`);
  }
  for (const option of /** @type {const} */ (["webpackConfig", "babelConfig"])) {
    if (config.options?.[option]) {
      throw new UsageError(`The ${option} option isn't supported. Use depcruise directly.`);
    }
  }
  return config;
}

/**
 * Lists tracked files, with `/` separators and relative to `cwd`.
 *
 * @param {string[]} paths
 * @param {string} cwd
 * @returns {string[]}
 */
function listTrackedFiles(paths, cwd) {
  try {
    const output = execFileSync("git", ["ls-files", "-z", "--", ...paths], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return output.split("\0").filter(Boolean);
  } catch {
    throw new UsageError(
      `${cwd} isn't inside a git repository. hm-lint-deps compares the cruise with the files git tracks.`,
    );
  }
}

/**
 * Selects the files the cruise must analyse.
 *
 * @param {string[]} files Tracked files, relative to the working directory.
 * @param {import("dependency-cruiser").ICruiseOptions} options
 * @returns {string[]}
 */
export function expectedSourceFiles(files, options) {
  const configured = options.enhancedResolveOptions?.extensions;
  if (!configured || configured.length === 0) {
    throw new UsageError(
      "The configuration sets no enhancedResolveOptions.extensions, so the expected files are unknown.",
    );
  }
  const parseable = new Set(allExtensions.map(({ extension }) => extension));
  const extensions = configured.filter((extension) => parseable.has(extension));
  const exclude = patterns(options.exclude);
  const doNotFollow = patterns(options.doNotFollow);
  const includeOnly = patterns(options.includeOnly);

  return files.filter(
    (file) =>
      extensions.some((extension) => file.endsWith(extension)) &&
      !DECLARATION_FILE.test(file) &&
      !exclude.some((pattern) => pattern.test(file)) &&
      !doNotFollow.some((pattern) => pattern.test(file)) &&
      (includeOnly.length === 0 || includeOnly.some((pattern) => pattern.test(file))),
  );
}

/**
 * A file counts as analysed when it's in the cruise result and
 * dependency-cruiser can parse its extension. The second check matters,
 * because a file reached only through an import appears in the result even
 * when it couldn't be parsed.
 *
 * @param {string[]} expected
 * @param {import("dependency-cruiser").ICruiseResult} result
 * @returns {string[]}
 */
function unanalysedFiles(expected, result) {
  const cruised = new Set(result.modules.map((module) => module.source));
  const unparseable = allExtensions
    .filter(({ available }) => !available)
    .map(({ extension }) => extension);
  return expected.filter(
    (file) =>
      !cruised.has(file) || unparseable.some((extension) => extensionOf(file) === extension),
  );
}

/**
 * The longest known extension a file ends with, so `.d.ts` wins over `.ts`.
 *
 * @param {string} file
 * @returns {string | undefined}
 */
function extensionOf(file) {
  return allExtensions
    .map(({ extension }) => extension)
    .filter((extension) => file.endsWith(extension))
    .sort((a, b) => b.length - a.length)[0];
}

/**
 * @param {string | string[] | { path?: string | string[] } | undefined} option
 * @returns {RegExp[]}
 */
function patterns(option) {
  const value = typeof option === "object" && !Array.isArray(option) ? option.path : option;
  if (value === undefined) {
    return [];
  }
  return (Array.isArray(value) ? value : [value]).map((pattern) => new RegExp(pattern));
}

/**
 * @param {string[]} paths
 * @param {string} cwd
 * @param {import("dependency-cruiser").ICruiseOptions} options
 * @param {import("dependency-cruiser").IFlattenedRuleSet} ruleSet
 * @returns {Promise<import("dependency-cruiser").ICruiseResult>}
 */
async function runCruise(paths, cwd, options, ruleSet) {
  const tsConfigFile = options.tsConfig?.fileName;
  const tsConfig = tsConfigFile ? extractTSConfig(resolve(cwd, tsConfigFile)) : undefined;
  const { output } = await cruise(
    paths,
    { ...options, baseDir: cwd, ruleSet, validate: true },
    {},
    tsConfig ? { tsConfig } : {},
  );
  if (typeof output === "string") {
    throw new Error("expected a structured cruise result");
  }
  return output;
}

/**
 * @param {string[]} missing
 * @returns {string}
 */
function describeMissing(missing) {
  const listed = missing.slice(0, MAX_LISTED_FILES).map((file) => `  ${file}`);
  if (missing.length > MAX_LISTED_FILES) {
    listed.push(`  … and ${missing.length - MAX_LISTED_FILES} more`);
  }
  const count =
    missing.length === 1 ? "1 tracked source file" : `${missing.length} tracked source files`;
  return [
    `hm-lint-deps: dependency-cruiser didn't analyse ${count}:`,
    ...listed,
    "",
    likelyCause(missing),
    "",
  ].join("\n");
}

/**
 * @param {string[]} missing
 * @returns {string}
 */
function likelyCause(missing) {
  const unavailable = allExtensions
    .filter(
      ({ available, extension }) =>
        !available && missing.some((file) => extensionOf(file) === extension),
    )
    .map(({ extension }) => extension);

  if (unavailable.length === 0) {
    return "Likely cause: these files aren't reachable from the paths passed. Check them and the configuration's exclude, doNotFollow and includeOnly options.";
  }

  const cause = `Likely cause: dependency-cruiser can't parse ${unavailable.join(", ")} files in this environment, because their parser isn't installed or isn't a supported version.`;
  if (!unavailable.some((extension) => TYPESCRIPT_EXTENSION.test(extension))) {
    return `${cause} Run "depcruise --info" to see which parsers it found.`;
  }
  const typescript = getAvailableTranspilers().find(({ name }) => name === "typescript");
  return `${cause} For TypeScript, install a version dependency-cruiser supports (typescript ${typescript?.version ?? "see depcruise --info"}).`;
}

/**
 * @param {unknown} error
 * @returns {string}
 */
function errorText(error) {
  return error instanceof Error ? error.message : String(error);
}
