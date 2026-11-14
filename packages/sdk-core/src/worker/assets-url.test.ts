import { afterEach, describe, expect, it, vi } from "vitest";
import { createAssetsResolver, resolveAssetsBase } from "./assets-url.js";

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
    expect(() => resolveAssetsBase("/assets/")).toThrow(
      /must be absolute where there's no page .* Use createAssetsResolver/,
    );
  });

  it.each(["https://cdn.example.com/assets/?v=2", "https://cdn.example.com/assets/#x"])(
    "throws a TypeError for a URL with a query or fragment: %s",
    (url) => {
      expect(() => resolveAssetsBase(url)).toThrow(/can't have a query or fragment/);
    },
  );
});

describe("createAssetsResolver", () => {
  it("resolves files under an absolute URL, on a server too", () => {
    vi.stubGlobal("location", undefined);
    const asset = createAssetsResolver("https://cdn.example.com/sdk/assets");

    expect(asset("audio/audio.worker.js")).toBe(
      "https://cdn.example.com/sdk/assets/audio/audio.worker.js",
    );
  });

  it("accepts a URL relative to the page during server rendering, and resolves it in the browser", () => {
    // Created while a React tree renders on the server: there's no page yet.
    vi.stubGlobal("location", undefined);
    const asset = createAssetsResolver("/video-sdk/");

    // The first worker starts in the browser.
    vi.stubGlobal("location", { href: "https://app.example.com/editor/index.html" });
    expect(asset("video/media.worker.js")).toBe(
      "https://app.example.com/video-sdk/video/media.worker.js",
    );
  });

  it("resolves a relative URL against the page once, on first use", () => {
    vi.stubGlobal("location", { href: "https://app.example.com/editor/index.html" });
    const asset = createAssetsResolver("assets/");
    expect(asset("a.js")).toBe("https://app.example.com/editor/assets/a.js");

    // A later client-side navigation doesn't move the files.
    vi.stubGlobal("location", { href: "https://app.example.com/other/page/index.html" });
    expect(asset("b.js")).toBe("https://app.example.com/editor/assets/b.js");
  });

  it("throws on use if there's still no page to resolve a relative URL against", () => {
    vi.stubGlobal("location", undefined);
    const asset = createAssetsResolver("/assets/");

    expect(() => asset("a.js")).toThrow(TypeError);
  });

  it.each([
    "/assets/?v=2",
    "/assets/#x",
    "https://cdn.example.com/assets/?v=2",
    "https://cdn.example.com/assets/#x",
  ])("rejects a query or fragment at once, even on a server: %s", (url) => {
    vi.stubGlobal("location", undefined);

    expect(() => createAssetsResolver(url)).toThrow(TypeError);
    expect(() => createAssetsResolver(url)).toThrow(/can't have a query or fragment/);
  });

  it("rejects a URL that can't be parsed at once", () => {
    vi.stubGlobal("location", undefined);

    expect(() => createAssetsResolver("https://[bad")).toThrow(TypeError);
  });
});
