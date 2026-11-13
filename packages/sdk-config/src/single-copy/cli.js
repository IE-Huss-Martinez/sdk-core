#!/usr/bin/env node
import { parseArgs } from "node:util";
import { checkSingleCopy, EXIT_OK, EXIT_USAGE, UsageError } from "./check.js";

const USAGE = `Usage: hm-check-single-copy [--scope <scope>]... [<lockfile>]

Fails when a pnpm lockfile resolves more than one version of any package in
the scopes (sdk-core ADR 0047). Workspace links aren't copies, and versions
that differ only in their peer dependencies count once.

Options:
  -s, --scope <scope>  a scope to check, such as @hussmartinez (the default);
                       repeat it for several
  -h, --help           show this help

The lockfile defaults to pnpm-lock.yaml.

Exit codes:
  0  every package resolves to one version
  1  a package resolves to more than one version
  2  usage error, or a lockfile that can't be read
`;

/**
 * @returns {{ scopes: string[], help: boolean, lockfile: string }}
 */
function parseCommandLine() {
  try {
    const { values, positionals } = parseArgs({
      allowPositionals: true,
      options: {
        scope: { type: "string", short: "s", multiple: true },
        help: { type: "boolean", short: "h", default: false },
      },
    });
    if (positionals.length > 1) {
      throw new Error("Give at most one lockfile.");
    }
    return {
      scopes: values.scope ?? ["@hussmartinez"],
      help: values.help,
      lockfile: positionals[0] ?? "pnpm-lock.yaml",
    };
  } catch (error) {
    process.stderr.write(
      `hm-check-single-copy: ${error instanceof Error ? error.message : error}\n\n${USAGE}`,
    );
    process.exit(EXIT_USAGE);
  }
}

const args = parseCommandLine();
if (args.help) {
  process.stdout.write(USAGE);
  process.exit(EXIT_OK);
}
try {
  const { exitCode, report } = checkSingleCopy(args);
  (exitCode === EXIT_OK ? process.stdout : process.stderr).write(report);
  process.exitCode = exitCode;
} catch (error) {
  if (!(error instanceof UsageError)) {
    throw error;
  }
  process.stderr.write(`hm-check-single-copy: ${error.message}\n`);
  process.exitCode = EXIT_USAGE;
}
