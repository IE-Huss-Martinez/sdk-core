import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveAssetsBase } from "./assets-url.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resolveAssetsBase", () => {
  it("keeps an absolute URL, adding the trailing slash", () => {
    expect(resolveAssetsBase("https://cdn.example.com/sdk/assets")).toBe(
      "https://cdn.example.com/sdk/assets/",
    );
    expect(resolveAssetsBase(new URL("https://cdn.example.com/sdk/assets/"))).toBe(
      "https://cdn.example.com/sdk/assets/",
    );
  });

  it("resolves a relative URL against the page", () => {
    vi.stubGlobal("location", { href: "https://app.example.com/editor/index.html" });

    expect(resolveAssetsBase("/static/audio-sdk")).toBe(
      "https://app.example.com/static/audio-sdk/",
    );
    expect(resolveAssetsBase("assets/")).toBe("https://app.example.com/editor/assets/");
    expect(resolveAssetsBase("../shared/assets")).toBe("https://app.example.com/shared/assets/");
  });

  it("gives a base that assets resolve under", () => {
    const base = resolveAssetsBase("https://app.example.com/assets");

    expect(new URL("audio/audio.worker.js", base).href).toBe(
      "https://app.example.com/assets/audio/audio.worker.js",
    );
  });

  it("throws a TypeError for a relative URL with no page to resolve it against", () => {
    vi.stubGlobal("location", undefined);

    expect(() => resolveAssetsBase("/assets/")).toThrow(TypeError);
    expect(() => resolveAssetsBase("/assets/")).toThrow(/absolute URL, or relative to the page/);
  });

  it.each(["https://cdn.example.com/assets/?v=2", "https://cdn.example.com/assets/#x"])(
    "throws a TypeError for a URL with a query or fragment: %s",
    (url) => {
      expect(() => resolveAssetsBase(url)).toThrow(/can't have a query or fragment/);
    },
  );
});
