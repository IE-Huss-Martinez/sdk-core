#!/usr/bin/env node
import { parseArgs } from "node:util";
import { CONTAINER_ENV, EXIT_OK, EXIT_USAGE, UsageError } from "../image/run.js";
import { runInContainer, runInDocker } from "./run.js";

const USAGE = `Usage: hm-test-visual [--update]

Runs an SDK's visual regression tests (sdk-core ADR 0048), configured in
e2e/playwright.visual.config.ts, inside the browser test image that
ci/Dockerfile pins, so screenshots match pixel for pixel on any machine.
Run it from the repository's root, after building the examples.

Outside the image it needs Docker: it builds the image with the repository's
pnpm and runs itself there. Inside it, as in CI's verify job, where
${CONTAINER_ENV}=1, it runs the tests directly.

Options:
  -u, --update  write the baselines in e2e/visual/__screenshots__ afresh, and
                remove those no test produces; a failed run keeps the old ones
  -h, --help    show this help

Exit codes:
  0  every screenshot matches, or the baselines were written
  1  a screenshot differs, a test fails, or Docker isn't available
  2  usage error, or a repository this can't read
`;

/** @returns {{ update: boolean, help: boolean }} */
function parseCommandLine() {
  try {
    const { values } = parseArgs({
      options: {
        update: { type: "boolean", short: "u", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
    });
    return values;
  } catch (error) {
    process.stderr.write(
      `hm-test-visual: ${error instanceof Error ? error.message : error}\n\n${USAGE}`,
    );
    process.exit(EXIT_USAGE);
  }
}

const args = parseCommandLine();
if (args.help) {
  process.stdout.write(USAGE);
  process.exit(EXIT_OK);
}
const root = process.cwd();
try {
  process.exitCode =
    process.env[CONTAINER_ENV] === "1"
      ? runInContainer({ root, update: args.update })
      : runInDocker({
          root,
          update: args.update,
          owner:
            typeof process.getuid === "function" && typeof process.getgid === "function"
              ? `${process.getuid()}:${process.getgid()}`
              : "0:0",
          log: (message) => process.stderr.write(`hm-test-visual: ${message}\n`),
        });
} catch (error) {
  if (!(error instanceof UsageError)) {
    throw error;
  }
  process.stderr.write(`hm-test-visual: ${error.message}\n`);
  process.exitCode = EXIT_USAGE;
}
