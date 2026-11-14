import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { netlogErrors } from "./errors.js";

const CLI = fileURLToPath(new URL("./cli.js", import.meta.url));
/**
 * Recorded from Chromium 1.65's build: a page whose module import, and whose
 * module worker's import, the server answered by closing the connection, as
 * video-sdk#55 suspects. Trimmed to the requests to that server.
 */
const FIXTURE = fileURLToPath(new URL("../../test/fixtures/chromium.netlog.json", import.meta.url));

/** @type {string[]} */
const scratch = [];
afterEach(async () => {
  for (const dir of scratch.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

describe("netlogErrors", () => {
  it("lists each failed request once, with Chromium's error name", async () => {
    expect(netlogErrors(await readFile(FIXTURE, "utf8"))).toEqual([
      { url: "http://localhost:4396/dep.js", error: "ERR_CONNECTION_CLOSED" },
      { url: "http://localhost:4396/dep.js", error: "ERR_EMPTY_RESPONSE" },
      { url: "http://localhost:4396/gone.js", error: "ERR_CONNECTION_CLOSED" },
      { url: "http://localhost:4396/gone.js", error: "ERR_EMPTY_RESPONSE" },
    ]);
  });

  it("reads a log that a killed browser left unfinished", async () => {
    const { constants, events } = JSON.parse(await readFile(FIXTURE, "utf8"));
    // Chromium writes the constants, then each event as it happens, followed
    // by a comma, and closes the array only when the browser exits.
    const unfinished = `{"constants": ${JSON.stringify(constants)},\n"events": [\n${events
      .map((/** @type {unknown} */ event) => `${JSON.stringify(event)},\n`)
      .join("")}`;
    expect(netlogErrors(unfinished)).toHaveLength(4);
  });

  it("ignores requests that succeeded, including those a WebSocket took over", () => {
    // ERR_WS_UPGRADE is what a passing Vitest run records for its own
    // WebSockets, on the orchestrator, the tester and Vite's client.
    const log = {
      constants: { netError: { ERR_FAILED: -2, ERR_WS_UPGRADE: -3 } },
      events: [
        { source: { id: 1 }, params: { url: "http://localhost/ok.js" } },
        { source: { id: 1 }, params: { net_error: 0 } },
        { source: { id: 2 }, params: { url: "ws://localhost/__vitest_browser_api__" } },
        { source: { id: 2 }, params: { net_error: -3 } },
      ],
    };
    expect(netlogErrors(JSON.stringify(log))).toEqual([]);
  });
});

describe("hm-netlog-errors", () => {
  /** @param {string[]} args */
  const run = (args) => spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });

  it("prints one line per failure: the error, then the URL", () => {
    const { status, stdout } = run([FIXTURE]);
    expect(status).toBe(0);
    expect(stdout).toBe(
      [
        "ERR_CONNECTION_CLOSED http://localhost:4396/dep.js",
        "ERR_EMPTY_RESPONSE http://localhost:4396/dep.js",
        "ERR_CONNECTION_CLOSED http://localhost:4396/gone.js",
        "ERR_EMPTY_RESPONSE http://localhost:4396/gone.js",
        "",
      ].join("\n"),
    );
  });

  it("says so when nothing failed", async () => {
    const dir = await mkdtemp(join(tmpdir(), "hm-netlog-"));
    scratch.push(dir);
    const file = join(dir, "ok.netlog.json");
    await writeFile(file, JSON.stringify({ constants: { netError: {} }, events: [] }));
    expect(run([file]).stdout).toBe(`${file}: no request failed\n`);
  });

  it("is a usage error without a log, or with one it can't read", () => {
    expect(run([]).status).toBe(2);
    const missing = run(["/nonexistent.netlog.json"]);
    expect(missing.status).toBe(2);
    expect(missing.stderr).toMatch(
      /^hm-netlog-errors: \/nonexistent\.netlog\.json isn't a readable net log/,
    );
  });
});
