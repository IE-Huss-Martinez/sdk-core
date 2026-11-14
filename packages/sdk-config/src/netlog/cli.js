#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { netlogErrors } from "./errors.js";

const USAGE = `Usage: hm-netlog-errors <netlog>...

Lists the requests that failed with a network error in Chromium net logs,
such as those that HM_BROWSER_DIAGNOSTICS writes for the browser tests
(@hussmartinez/sdk-config/testing/browser-instances): one line per failure,
the error and then the URL.

Exit codes:
  0  the logs were read, whether or not anything failed
  2  usage error, or a log that can't be read
`;

const files = process.argv.slice(2);
if (files.length === 0 || files.includes("-h") || files.includes("--help")) {
  (files.length === 0 ? process.stderr : process.stdout).write(USAGE);
  process.exit(files.length === 0 ? 2 : 0);
}
for (const file of files) {
  let failed;
  try {
    failed = netlogErrors(readFileSync(file, "utf8"));
  } catch (error) {
    process.stderr.write(
      `hm-netlog-errors: ${file} isn't a readable net log: ${error instanceof Error ? error.message : error}\n`,
    );
    process.exit(2);
  }
  process.stdout.write(
    failed.length === 0
      ? `${file}: no request failed\n`
      : failed.map(({ url, error }) => `${error} ${url}\n`).join(""),
  );
}
