import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const REGISTRY = Symbol.for("@hussmartinez/sdk-core");
const registry = () => (globalThis as { [REGISTRY]?: Map<object, string> })[REGISTRY];

let warnings: string[];

beforeEach(() => {
  delete (globalThis as { [REGISTRY]?: unknown })[REGISTRY];
  vi.resetModules();
  warnings = [];
  vi.spyOn(console, "warn").mockImplementation((message: string) => {
    warnings.push(message);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  delete (globalThis as { [REGISTRY]?: unknown })[REGISTRY];
});

/** A fresh copy of the module, as a second install of sdk-core would be. */
const loadCopy = async () => {
  vi.resetModules();
  return import("./single-copy.js");
};

describe("checkSingleCopy", () => {
  it("registers nothing on import, only on first use", async () => {
    const { checkSingleCopy } = await loadCopy();
    expect(registry()).toBeUndefined();

    checkSingleCopy();
    expect(registry()?.size).toBe(1);
  });

  it("stays quiet with one copy, however often it's used", async () => {
    const { checkSingleCopy } = await loadCopy();
    checkSingleCopy();
    checkSingleCopy();

    expect(warnings).toEqual([]);
  });

  it("warns once when a second copy is used, naming both versions", async () => {
    const first = await loadCopy();
    const second = await loadCopy();
    first.checkSingleCopy();
    second.checkSingleCopy();
    second.checkSingleCopy();

    expect(registry()?.size).toBe(2);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain(
      "2 copies of @hussmartinez/sdk-core are in use (an unknown version, an unknown version)",
    );
    expect(warnings[0]).toContain("`instanceof SdkError` fails for errors from another copy");
  });

  it("does nothing in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const first = await loadCopy();
    const second = await loadCopy();
    first.checkSingleCopy();
    second.checkSingleCopy();

    expect(registry()).toBeUndefined();
    expect(warnings).toEqual([]);
  });

  it("is called by sdk-core's entry points, such as SdkError", async () => {
    vi.resetModules();
    const { SdkError } = await import("../errors/sdk-error.js");
    expect(registry()).toBeUndefined();

    new SdkError("UNKNOWN", "x");

    expect(registry()?.size).toBe(1);
  });
});
