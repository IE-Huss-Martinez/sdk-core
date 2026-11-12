#!/usr/bin/env node
import { parseArgs } from "node:util";
import { checkApiReports, EXIT_OK, EXIT_USAGE, UsageError } from "./check-reports.js";

const USAGE = `Usage: hm-check-api-reports --main <report> --types <rollup> [<report>...]

Checks the API reports of a package's other entry points. Each may copy the
package's types only if the main entry point exports them, and never a class
with private, protected or #private members, whose copy would be a different
type.

Options:
  -m, --main <report>   the main entry point's API report (.api.md)
  -t, --types <rollup>  the main entry point's declaration rollup (.d.ts)
  -h, --help            show this help

Exit codes:
  0  every report passes
  1  a report has problems
  2  usage error, or a file that can't be read
`;

/**
 * @returns {{ main: string | undefined, types: string | undefined, help: boolean, secondary: string[] }}
 */
function parseCommandLine() {
  try {
    const { values, positionals } = parseArgs({
      allowPositionals: true,
      options: {
        main: { type: "string", short: "m" },
        types: { type: "string", short: "t" },
        help: { type: "boolean", short: "h", default: false },
      },
    });
    return { main: values.main, types: values.types, help: values.help, secondary: positionals };
  } catch (error) {
    process.stderr.write(
      `hm-check-api-reports: ${error instanceof Error ? error.message : error}\n\n${USAGE}`,
    );
    process.exit(EXIT_USAGE);
  }
}

const args = parseCommandLine();
if (args.help) {
  process.stdout.write(USAGE);
  process.exit(EXIT_OK);
}
if (!args.main || !args.types) {
  process.stderr.write(USAGE);
  process.exit(EXIT_USAGE);
}

try {
  const { exitCode, problems } = await checkApiReports({
    main: args.main,
    types: args.types,
    secondary: args.secondary,
  });
  for (const problem of problems) {
    process.stderr.write(`${problem}\n`);
  }
  process.exitCode = exitCode;
} catch (error) {
  if (!(error instanceof UsageError)) {
    throw error;
  }
  process.stderr.write(`hm-check-api-reports: ${error.message}\n`);
  process.exitCode = EXIT_USAGE;
}
