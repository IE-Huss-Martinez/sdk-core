#!/usr/bin/env node
import { parseArgs } from "node:util";
import { EXIT_OK, EXIT_USAGE, lintDeps } from "./lint-deps.js";

const USAGE = `Usage: hm-lint-deps [--config <file>] <path>...

Runs dependency-cruiser with the repository's configuration, and fails when it
didn't analyse a source file that git tracks under the given paths.

Options:
  -c, --config <file>  dependency-cruiser configuration (default: .dependency-cruiser.js)
  -h, --help           show this help

Exit codes:
  0  no violations, and every source file was analysed
  1  rule violations, or source files dependency-cruiser didn't analyse
  2  usage or configuration error
`;

/**
 * @returns {{ config: string | undefined, help: boolean, paths: string[] }}
 */
function parseCommandLine() {
  try {
    const { values, positionals } = parseArgs({
      allowPositionals: true,
      options: {
        config: { type: "string", short: "c" },
        help: { type: "boolean", short: "h", default: false },
      },
    });
    return { config: values.config, help: values.help, paths: positionals };
  } catch (error) {
    process.stderr.write(
      `hm-lint-deps: ${error instanceof Error ? error.message : error}\n\n${USAGE}`,
    );
    process.exit(EXIT_USAGE);
  }
}

const args = parseCommandLine();
if (args.help) {
  process.stdout.write(USAGE);
  process.exit(EXIT_OK);
}
if (args.paths.length === 0) {
  process.stderr.write(USAGE);
  process.exit(EXIT_USAGE);
}

const { exitCode, report, problems } = await lintDeps({
  paths: args.paths,
  ...(args.config ? { configFile: args.config } : {}),
});
process.stdout.write(report);
process.stderr.write(problems);
process.exitCode = exitCode;
