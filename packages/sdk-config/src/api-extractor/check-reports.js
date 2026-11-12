import { readFile } from "node:fs/promises";

/** Exit code when every report passes. */
export const EXIT_OK = 0;
/** Exit code when a report has problems. */
export const EXIT_FAILED = 1;
/** Exit code for usage errors, such as a file that can't be read. */
export const EXIT_USAGE = 2;

/**
 * An error the user can fix, reported as a message without a stack trace.
 */
export class UsageError extends Error {
  /** @override */
  name = "UsageError";
}

const FORGOTTEN_EXPORT =
  /\/\/ Warning: \(ae-forgotten-export\) The symbol "([^"]+)" needs to be exported by the entry point/g;
const EXPORTED_DECLARATION =
  /^export (?:declare )?(?:abstract )?(?:default )?(class|interface|type|function|const|let|var|enum|namespace) ([A-Za-z_$][\w$]*)/gm;
const EXPORT_LIST = /^export (?:type )?\{([^}]*)\}/gm;

/**
 * The symbols an API report flags as forgotten exports, in report order and
 * without duplicates.
 *
 * @param {string} report The text of an `.api.md` file.
 * @returns {string[]}
 */
export function forgottenExports(report) {
  return [...new Set([...report.matchAll(FORGOTTEN_EXPORT)].map((match) => match[1] ?? ""))];
}

/**
 * The names an API report exports, mapped to their kind, such as `class` or
 * `interface`. Names in an `export { ... }` list have the kind `reexport`.
 *
 * @param {string} report The text of an `.api.md` file.
 * @returns {Map<string, string>}
 */
export function exportedSymbols(report) {
  /** @type {Map<string, string>} */
  const exported = new Map();
  for (const [, kind = "", name = ""] of report.matchAll(EXPORTED_DECLARATION)) {
    exported.set(name, kind);
  }
  for (const [, list = ""] of report.matchAll(EXPORT_LIST)) {
    for (const entry of list.split(",")) {
      const name = entry
        .trim()
        .replace(/^type\s+/, "")
        .split(/\s+as\s+/)
        .at(-1);
      if (name && !exported.has(name)) {
        exported.set(name, "reexport");
      }
    }
  }
  return exported;
}

/**
 * Replaces comments and the contents of string and template literals with
 * spaces, so braces and keywords inside them can't confuse the scanner.
 * Offsets are preserved.
 *
 * @param {string} source
 * @returns {string}
 */
function blankCommentsAndStrings(source) {
  let result = "";
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];
    /** @type {number} */
    let end;
    if (char === "/" && next === "/") {
      end = source.indexOf("\n", index);
      end = end === -1 ? source.length : end;
    } else if (char === "/" && next === "*") {
      end = source.indexOf("*/", index + 2);
      end = end === -1 ? source.length : end + 2;
    } else if (char === '"' || char === "'" || char === "`") {
      end = index + 1;
      while (end < source.length && source[end] !== char) {
        end += source[end] === "\\" ? 2 : 1;
      }
      end = Math.min(end + 1, source.length);
      result += char + " ".repeat(Math.max(end - index - 2, 0)) + (end - index > 1 ? char : "");
      index = end;
      continue;
    } else {
      result += char;
      index += 1;
      continue;
    }
    result += source.slice(index, end).replace(/[^\n]/g, " ");
    index = end;
  }
  return result;
}

/**
 * The members of a class in a declaration file that make it nominal: `#private`,
 * and `private` or `protected` members other than constructors. TypeScript
 * treats two declarations of such a class as incompatible types, even when they
 * are copies of each other.
 *
 * @param {string} declarations The text of a `.d.ts` file, such as a rollup.
 * @param {string} name The class's name.
 * @returns {string[] | undefined} The members, or `undefined` if the file
 *   doesn't declare the class.
 */
export function nominalMembers(declarations, name) {
  const code = blankCommentsAndStrings(declarations);
  const escaped = name.replace(/[$]/g, "\\$");
  const start = new RegExp(
    `(?:^|[\\s;}])(?:export\\s+)?(?:declare\\s+)?(?:abstract\\s+)?class\\s+${escaped}(?![\\w$])`,
    "m",
  ).exec(code);
  if (!start) {
    return undefined;
  }
  // The body's brace is the first one outside type parameters and heritage
  // clauses, such as `<T extends { a: string }>`.
  let open = -1;
  let nesting = 0;
  for (let index = start.index + start[0].length; index < code.length && open === -1; index += 1) {
    const char = code[index];
    if (char === "=" && code[index + 1] === ">") {
      index += 1;
    } else if (char === "<" || char === "(" || char === "[" || (char === "{" && nesting > 0)) {
      nesting += 1;
    } else if (char === ">" || char === ")" || char === "]" || char === "}") {
      nesting -= 1;
    } else if (char === "{") {
      open = index;
    }
  }
  if (open === -1) {
    return undefined;
  }
  /** @type {string[]} */
  const members = [];
  let depth = 0;
  let memberStart = open + 1;
  for (let index = open + 1; index < code.length; index += 1) {
    const char = code[index];
    if (char === "{" || char === "(" || char === "[") {
      depth += 1;
    } else if (char === ")" || char === "]") {
      depth -= 1;
    } else if (char === "}") {
      if (depth === 0) {
        members.push(declarations.slice(memberStart, index));
        break;
      }
      depth -= 1;
    } else if (char === ";" && depth === 0) {
      members.push(declarations.slice(memberStart, index));
      memberStart = index + 1;
    }
  }
  return members
    .map((member) => member.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "").trim())
    .filter(
      (member) =>
        member.startsWith("#") ||
        /^(?:(?:static|readonly|abstract|override|declare)\s+)*(?:private|protected)\s+(?!constructor\b)/.test(
          member,
        ),
    );
}

/**
 * @typedef {object} CheckApiReportsOptions
 * @property {string} main The main entry point's API report.
 * @property {string} types The main entry point's declaration rollup, which
 *   keeps the private members that API reports leave out.
 * @property {string[]} [secondary] The other entry points' API reports.
 */

/**
 * @typedef {object} CheckApiReportsResult
 * @property {number} exitCode {@link EXIT_OK} or {@link EXIT_FAILED}.
 * @property {string[]} problems One line per problem.
 */

/**
 * Checks that API reports only copy types the main entry point exports, and
 * never a class that copying would make incompatible with the original.
 *
 * @param {CheckApiReportsOptions} options
 * @returns {Promise<CheckApiReportsResult>}
 * @throws {UsageError} If a file can't be read.
 */
export async function checkApiReports({ main, types, secondary = [] }) {
  const read = async (/** @type {string} */ path) => {
    try {
      return await readFile(path, "utf8");
    } catch (error) {
      throw new UsageError(
        `Can't read ${path}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };
  const mainReport = await read(main);
  const declarations = await read(types);
  const exported = exportedSymbols(mainReport);
  /** @type {string[]} */
  const problems = [];

  for (const path of secondary) {
    for (const symbol of forgottenExports(await read(path))) {
      const kind = exported.get(symbol);
      if (kind === undefined) {
        problems.push(
          `${path}: "${symbol}" is copied from the package, but the main entry point doesn't export it.`,
        );
        continue;
      }
      if (kind !== "class") {
        continue;
      }
      const members = nominalMembers(declarations, symbol);
      if (members === undefined) {
        problems.push(`${path}: can't find the class "${symbol}" in ${types}.`);
      } else if (members.length > 0) {
        const listed = members.map((member) => `\`${member.replace(/\s+/g, " ")}\``).join(", ");
        problems.push(
          `${path}: the class "${symbol}" is copied, and its non-public members (${listed}) make the copy a different type from the original. Keep the class out of this entry point's API, such as behind an interface, or give it no private, protected or #private members.`,
        );
      }
    }
  }
  return { exitCode: problems.length === 0 ? EXIT_OK : EXIT_FAILED, problems };
}
