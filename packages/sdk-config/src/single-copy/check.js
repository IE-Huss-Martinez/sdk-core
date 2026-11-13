import { readFileSync } from "node:fs";
import { parseAllDocuments } from "yaml";

/** Exit code when every package in the scope resolves to one version. */
export const EXIT_OK = 0;
/** Exit code when a package resolves to more than one version. */
export const EXIT_FAILED = 1;
/** Exit code for usage errors, or a lockfile that can't be read. */
export const EXIT_USAGE = 2;

/**
 * An error the user can fix, reported as a message without a stack trace.
 */
export class UsageError extends Error {
  /** @override */
  name = "UsageError";
}

/**
 * Splits a lockfile key, such as `@hussmartinez/ui@0.5.0(react@19.3.1)`,
 * into the package's name and version, without peer suffixes.
 *
 * @param {string} key
 * @returns {{ name: string, version: string } | undefined}
 */
export function parseKey(key) {
  const at = key.indexOf("@", key.startsWith("@") ? 1 : 0);
  if (at <= 0) {
    return undefined;
  }
  const version = key.slice(at + 1).split("(")[0] ?? "";
  return version ? { name: key.slice(0, at), version } : undefined;
}

/** A dependency's resolved version, or undefined for a workspace link. */
const resolvedVersion = (/** @type {unknown} */ value) => {
  const version =
    typeof value === "string" ? value : /** @type {{ version?: unknown }} */ (value)?.version;
  if (
    typeof version !== "string" ||
    version.startsWith("link:") ||
    version.startsWith("workspace:")
  ) {
    return undefined;
  }
  return version.split("(")[0];
};

const DEPENDENCY_FIELDS = ["dependencies", "devDependencies", "optionalDependencies"];

/**
 * @typedef {object} Duplicate
 * @property {string} name The package.
 * @property {Array<{ version: string, through: string[] }>} versions Each
 *   version, with what depends on it: `name@version` of a package, or
 *   `the workspace (path)` for one of the workspace's own packages.
 */

/**
 * Finds the packages in the scopes that a pnpm lockfile resolves to more
 * than one version (sdk-core ADR 0047).
 *
 * @param {string} text The lockfile.
 * @param {string[]} scopes Scopes, such as `@hussmartinez`.
 * @returns {Duplicate[]}
 */
export function findDuplicates(text, scopes) {
  const inScope = (/** @type {string} */ name) =>
    scopes.some((scope) => name.startsWith(`${scope}/`));
  /** @type {Map<string, Map<string, Set<string>>>} name → version → dependents */
  const found = new Map();
  const record = (
    /** @type {string} */ name,
    /** @type {string} */ version,
    /** @type {string | undefined} */ by,
  ) => {
    const versions = found.get(name) ?? new Map();
    found.set(name, versions);
    const dependents = versions.get(version) ?? new Set();
    versions.set(version, dependents);
    if (by) {
      dependents.add(by);
    }
  };

  for (const document of parseAllDocuments(text)) {
    if (document.errors.length > 0) {
      throw new UsageError(`The lockfile isn't valid YAML: ${document.errors[0]?.message}`);
    }
    const lockfile = /** @type {Record<string, any> | null} */ (document.toJS());
    if (!lockfile || typeof lockfile !== "object") {
      continue;
    }
    for (const key of Object.keys(lockfile["packages"] ?? {})) {
      const parsed = parseKey(key);
      if (parsed && inScope(parsed.name)) {
        record(parsed.name, parsed.version, undefined);
      }
    }
    for (const [key, snapshot] of Object.entries(lockfile["snapshots"] ?? {})) {
      const dependent = parseKey(key);
      for (const field of DEPENDENCY_FIELDS) {
        for (const [name, value] of Object.entries(snapshot?.[field] ?? {})) {
          const version = resolvedVersion(value);
          if (version && inScope(name)) {
            record(name, version, dependent ? `${dependent.name}@${dependent.version}` : key);
          }
        }
      }
    }
    for (const [path, importer] of Object.entries(lockfile["importers"] ?? {})) {
      for (const field of DEPENDENCY_FIELDS) {
        for (const [name, value] of Object.entries(importer?.[field] ?? {})) {
          const version = resolvedVersion(value);
          if (version && inScope(name)) {
            record(name, version, `the workspace (${path})`);
          }
        }
      }
    }
  }

  return [...found]
    .filter(([, versions]) => versions.size > 1)
    .map(([name, versions]) => ({
      name,
      versions: [...versions]
        .map(([version, through]) => ({ version, through: [...through].sort() }))
        .sort((a, b) => a.version.localeCompare(b.version, "en", { numeric: true })),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Checks a lockfile, and returns the exit code and the report.
 *
 * @param {{ lockfile: string, scopes: string[] }} options
 * @returns {{ exitCode: number, report: string }}
 */
export function checkSingleCopy({ lockfile, scopes }) {
  let text;
  try {
    text = readFileSync(lockfile, "utf8");
  } catch (error) {
    throw new UsageError(
      `Can't read ${lockfile}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const duplicates = findDuplicates(text, scopes);
  if (duplicates.length === 0) {
    return {
      exitCode: EXIT_OK,
      report: `Every ${scopes.join(", ")} package in ${lockfile} resolves to one version.\n`,
    };
  }
  const lines = duplicates.flatMap(({ name, versions }) => [
    `${name} resolves to ${versions.length} versions in ${lockfile}:`,
    ...versions.map(
      ({ version, through }) =>
        `  ${version}${through.length > 0 ? `, through ${through.join(", ")}` : ""}`,
    ),
  ]);
  return {
    exitCode: EXIT_FAILED,
    report: `${lines.join("\n")}\nAn application must get one copy of each (sdk-core ADR 0036, ADR 0047): move every dependent to the same version.\n`,
  };
}
