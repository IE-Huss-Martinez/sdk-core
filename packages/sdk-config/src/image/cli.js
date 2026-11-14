#!/usr/bin/env node
import { CONTAINER_ENV, EXIT_OK, EXIT_USAGE, runInImage, UsageError } from "./run.js";

const USAGE = `Usage: hm-in-image [--] <command> [<argument>...]

Runs a command in the browser test image that ci/Dockerfile pins (sdk-core
ADR 0049), as CI's verify job does, so browser tests run away from the host's
network changes and with CI's browsers. Run it from anywhere in the
repository; the command runs in the same folder of the checkout.

Outside the image it needs Docker: it builds the image with the repository's
pnpm, installs the locked dependencies into the container's own volumes, and
runs the command there. Inside it, as in CI's verify job, where
${CONTAINER_ENV}=1, it runs the command directly. CI and DEBUG are passed on.

  "test:browser": "hm-in-image vitest run --project browser"

Exit codes:
  the command's own, once it ran
  1  Docker isn't available, or the image didn't build
  2  usage error, or a repository this can't read
`;

const args = process.argv.slice(2);
const command = args[0] === "--" ? args.slice(1) : args;
if (args.length === 0 || (args[0] !== "--" && (args[0] === "-h" || args[0] === "--help"))) {
  (args.length === 0 ? process.stderr : process.stdout).write(USAGE);
  process.exit(args.length === 0 ? EXIT_USAGE : EXIT_OK);
}
try {
  process.exitCode = runInImage({
    cwd: process.cwd(),
    command,
    owner:
      typeof process.getuid === "function" && typeof process.getgid === "function"
        ? `${process.getuid()}:${process.getgid()}`
        : "0:0",
    log: (message) => process.stderr.write(`hm-in-image: ${message}\n`),
  });
} catch (error) {
  if (!(error instanceof UsageError)) {
    throw error;
  }
  process.stderr.write(`hm-in-image: ${error.message}\n`);
  process.exitCode = EXIT_USAGE;
}
