import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const TSC = createRequire(import.meta.url).resolve("typescript/bin/tsc");

it("ships declarations for the testing entries that match their JSDoc", async () => {
  const out = await mkdtemp(join(tmpdir(), "hm-sdk-config-types-"));
  try {
    execFileSync(process.execPath, [TSC, "-p", "tsconfig.types.json", "--outDir", out], {
      cwd: ROOT,
    });
    for (const name of ["audio-output.d.ts", "conformance.d.ts", "visual.d.ts"]) {
      const generated = await readFile(join(out, "testing", name), "utf8");
      const committed = await readFile(join(ROOT, "src", "testing", name), "utf8");
      expect(committed, `src/testing/${name} is out of date: run pnpm types:update`).toBe(
        generated,
      );
    }
  } finally {
    await rm(out, { recursive: true, force: true });
  }
}, 60_000);
