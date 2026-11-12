import { describe, expect, it } from "vitest";
import { sdkCoreMessages } from "../messages/core-messages.js";
import { parseChord } from "./chord.js";
import { type FamilyAction, familyShortcuts } from "./family.js";
import { platformOf } from "./platform.js";
import { createShortcutRegistry, type KeyboardEventLike } from "./registry.js";

/** A keyboard event on an ordinary element, with these changes. */
const press = (key: string, extra: Partial<KeyboardEventLike> = {}): KeyboardEventLike => ({
  key,
  target: { tagName: "DIV", getAttribute: () => null },
  ...extra,
});

/** An element, by duck typing, as `match` sees event targets. */
const element = (tagName: string, attributes: Record<string, string> = {}, extra = {}) => ({
  tagName,
  getAttribute: (name: string) => attributes[name] ?? null,
  ...extra,
});

/** A registry with every family action registered as a tool of the same name. */
const family = (platform: "apple" | "other") =>
  createShortcutRegistry({
    platform,
    tools: (Object.keys(familyShortcuts) as FamilyAction[]).map((action) => ({
      id: action,
      shortcuts: action,
    })),
  });

describe("parseChord", () => {
  it.each([
    ["Mod+Shift+Z", "apple", { meta: true, control: false, shift: true, key: "z", symbol: false }],
    ["Mod+Shift+Z", "other", { meta: false, control: true, shift: true, key: "z" }],
    ["Delete", "other", { key: "Delete", symbol: false }],
    ["Space", "apple", { key: " ", symbol: false }],
    ["+", "other", { key: "+", symbol: true, shift: false }],
    ["Mod++", "other", { key: "+", control: true }],
    ["Alt+F5", "apple", { key: "F5", alt: true }],
    ["0", "other", { key: "0", symbol: true }],
  ] as const)("parses %j on %s", (source, platform, expected) => {
    expect(parseChord(source, platform)).toMatchObject(expected);
  });

  it.each([
    ["", "is empty"],
    ["Mod+", "has an empty part"],
    ["Hyper+Z", 'has an unknown modifier, "Hyper"'],
    ["Mod+Mod+Z", "repeats a modifier"],
    ["Mod+Meta+Z", "names Mod and the key it stands for"],
    ["Mod+Enterr", 'has an unknown key, "Enterr"'],
    ["Shift+=", "uses Shift with a character other than a letter"],
  ])("refuses %j", (source, problem) => {
    expect(() => parseChord(source, "apple")).toThrow(
      new TypeError(
        `The shortcut "${source}" ${problem}${problem.endsWith(".") ? "" : "."}`.replace(
          "letter.",
          "letter; write the character itself.",
        ),
      ),
    );
  });
});

describe("platformOf", () => {
  it.each([
    [{ userAgentData: { platform: "macOS" } }, "apple"],
    [{ platform: "MacIntel" }, "apple"],
    [{ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)" }, "apple"],
    [{ platform: "iPad" }, "apple"],
    [{ userAgentData: { platform: "Windows" }, platform: "Win32" }, "other"],
    [{ platform: "Linux x86_64" }, "other"],
    [undefined, "other"],
  ] as const)("reads %j as %s", (navigatorLike, platform) => {
    expect(platformOf(navigatorLike)).toBe(platform);
  });
});

describe("the family's shortcuts", () => {
  it("matches Mod+Z by platform", () => {
    expect(family("apple").match(press("z", { metaKey: true }))).toBe("undo");
    expect(family("apple").match(press("z", { ctrlKey: true }))).toBeUndefined();
    expect(family("other").match(press("z", { ctrlKey: true }))).toBe("undo");
    expect(family("other").match(press("z", { metaKey: true }))).toBeUndefined();
  });

  it("matches Shift exactly for letters, so Mod+Shift+Z is redo", () => {
    const registry = family("apple");

    expect(registry.match(press("Z", { metaKey: true, shiftKey: true }))).toBe("redo");
    expect(registry.match(press("z", { metaKey: true, shiftKey: true }))).toBe("redo");
    expect(registry.match(press("Z", { metaKey: true }))).toBe("undo");
  });

  it("adds Control+Y for redo only on other platforms", () => {
    expect(family("other").match(press("y", { ctrlKey: true }))).toBe("redo");
    expect(family("apple").match(press("y", { ctrlKey: true }))).toBeUndefined();
  });

  it("ignores Shift for symbols: + with Shift on a US layout, 0 with Shift on AZERTY", () => {
    const registry = family("other");

    expect(registry.match(press("+", { shiftKey: true }))).toBe("zoom-in");
    expect(registry.match(press("+"))).toBe("zoom-in");
    expect(registry.match(press("=", { shiftKey: false }))).toBe("zoom-in");
    expect(registry.match(press("0", { shiftKey: true }))).toBe("zoom-reset");
    expect(registry.match(press("-"))).toBe("zoom-out");
  });

  it("never takes the browser's page zoom keys", () => {
    for (const platform of ["apple", "other"] as const) {
      const modifier = platform === "apple" ? { metaKey: true } : { ctrlKey: true };
      for (const key of ["=", "+", "-", "0"]) {
        expect(
          family(platform).match(press(key, modifier)),
          `${platform} Mod+${key}`,
        ).toBeUndefined();
      }
    }
  });

  it("keeps fields' keys: no family shortcut fires in a text field", () => {
    const registry = family("apple");
    const fields = [
      element("INPUT", {}, { type: "text" }),
      element("INPUT", {}, { type: "search" }),
      element("TEXTAREA"),
      element("SELECT"),
      element("DIV", {}, { isContentEditable: true }),
      element("DIV", { role: "textbox" }),
    ];
    const keys: KeyboardEventLike[] = [
      press("z", { metaKey: true }),
      press("a", { metaKey: true }),
      press("Delete"),
      press("Backspace"),
      press(" "),
      press("+", { shiftKey: true }),
      press("0"),
    ];
    for (const target of fields) {
      for (const event of keys) {
        expect(
          registry.match({ ...event, target }),
          `${event.key} in ${target.tagName}`,
        ).toBeUndefined();
      }
    }
  });

  it("keeps controls' keys: Space never fires on a focused button, link or checkbox", () => {
    const registry = family("apple");
    const controls = [
      element("BUTTON"),
      element("A", { href: "/x" }),
      element("SUMMARY"),
      element("INPUT", {}, { type: "checkbox" }),
      element("INPUT", {}, { type: "range" }),
      element("DIV", { role: "checkbox" }),
      element("DIV", { role: "tab" }),
    ];
    for (const target of controls) {
      expect(registry.match(press(" ", { target })), target.tagName).toBeUndefined();
    }
    // Keys a control doesn't use still work on it.
    expect(registry.match(press("Delete", { target: element("BUTTON") }))).toBe("delete");
    expect(registry.match(press("z", { metaKey: true, target: element("BUTTON") }))).toBe("undo");
    // A link without href isn't a control.
    expect(registry.match(press(" ", { target: element("A") }))).toBe("play-pause");
    expect(registry.match(press(" "))).toBe("play-pause");
  });

  it("ignores held-down keys except where repeating is wanted", () => {
    const registry = family("apple");

    expect(registry.match(press(" ", { repeat: true }))).toBeUndefined();
    expect(registry.match(press("Delete", { repeat: true }))).toBeUndefined();
    expect(registry.match(press("+", { repeat: true }))).toBe("zoom-in");
    expect(registry.match(press("z", { metaKey: true, repeat: true }))).toBe("undo");
  });

  it("ignores handled events and IME composition", () => {
    const registry = family("apple");

    expect(registry.match(press("Escape", { defaultPrevented: true }))).toBeUndefined();
    expect(registry.match(press("Escape", { isComposing: true }))).toBeUndefined();
    expect(registry.match(press("Escape"))).toBe("cancel");
  });

  it("never uses Mod with the zoom keys", () => {
    const zoom = ["zoom-in", "zoom-out", "zoom-reset"] as const;
    for (const action of zoom) {
      for (const chord of familyShortcuts[action].all) {
        expect(chord.keys).not.toMatch(/Mod|Control|Meta/);
      }
    }
  });
});

describe("createShortcutRegistry", () => {
  it("fires an inEditable shortcut in fields", () => {
    const registry = createShortcutRegistry({ platform: "other" });
    registry.register("pdf.save", [{ keys: "Mod+S", inEditable: true }]);

    expect(registry.match(press("s", { ctrlKey: true, target: element("TEXTAREA") }))).toBe(
      "pdf.save",
    );
  });

  it("matches a letter with Alt on macOS by its physical key", () => {
    const registry = createShortcutRegistry({ platform: "apple" });
    registry.register("pdf.ink", ["Alt+K"]);

    expect(registry.match(press("˚", { altKey: true, code: "KeyK" }))).toBe("pdf.ink");
    expect(registry.match(press("˚", { altKey: true, code: "KeyL" }))).toBeUndefined();
  });

  it("requires Control, Meta and Alt to match exactly", () => {
    const registry = createShortcutRegistry({ platform: "other" });
    registry.register("pdf.zoom-in", ["+"]);

    expect(registry.match(press("+", { ctrlKey: true }))).toBeUndefined();
    expect(registry.match(press("+", { altKey: true }))).toBeUndefined();
    expect(registry.match(press("+", { metaKey: true }))).toBeUndefined();
  });

  it.each([
    [
      "another tool's chord",
      (registry: ReturnType<typeof createShortcutRegistry>) => {
        registry.register("pdf.undo", ["Mod+Z"]);
        registry.register("pdf.revert", ["Mod+Z"]);
      },
      'The shortcut "Mod+Z" of "pdf.revert" is already "Mod+Z" of "pdf.undo".',
    ],
    [
      "a chord that Mod resolves to on this platform",
      (registry: ReturnType<typeof createShortcutRegistry>) => {
        registry.register("pdf.undo", ["Mod+Z"]);
        registry.register("pdf.other", ["Control+Z"]);
      },
      'The shortcut "Control+Z" of "pdf.other" is already "Mod+Z" of "pdf.undo".',
    ],
    [
      "an id registered twice",
      (registry: ReturnType<typeof createShortcutRegistry>) => {
        registry.register("pdf.undo", ["Mod+Z"]);
        registry.register("pdf.undo", ["Mod+U"]);
      },
      '"pdf.undo" already has shortcuts.',
    ],
    [
      "an unknown family action",
      (registry: ReturnType<typeof createShortcutRegistry>) =>
        registry.register("pdf.x", "undoo" as never),
      '"pdf.x" names an unknown family action, "undoo".',
    ],
    [
      "a malformed chord",
      (registry: ReturnType<typeof createShortcutRegistry>) => registry.register("pdf.x", ["Mod+"]),
      'The shortcut "Mod+" has an empty part.',
    ],
  ])("refuses %s", (_, register, message) => {
    expect(() => register(createShortcutRegistry({ platform: "other" }))).toThrow(
      new TypeError(message),
    );
  });

  it("allows on Apple platforms what conflicts elsewhere", () => {
    const registry = createShortcutRegistry({ platform: "apple" });
    registry.register("pdf.undo", ["Mod+Z"]);

    expect(() => registry.register("pdf.other", ["Control+Z"])).not.toThrow();
  });

  it("refuses an unknown platform", () => {
    expect(() => createShortcutRegistry({ platform: "windows" as never })).toThrow(
      new TypeError('The platform must be "apple" or "other", not "windows".'),
    );
  });

  it("registers the tools option's shortcuts, skipping tools without any", () => {
    const registry = createShortcutRegistry({
      platform: "apple",
      tools: [{ id: "pdf.undo", shortcuts: "undo" }, { id: "pdf.rotate-left" }],
    });

    expect(registry.match(press("z", { metaKey: true }))).toBe("pdf.undo");
    expect(registry.ariaKeyShortcuts("pdf.rotate-left")).toBeUndefined();
  });
});

describe("aria-keyshortcuts and labels", () => {
  it.each([
    ["apple", "undo", "Meta+Z"],
    ["other", "undo", "Control+Z"],
    ["apple", "redo", "Shift+Meta+Z"],
    ["other", "redo", "Control+Shift+Z Control+Y"],
    ["other", "zoom-in", "Plus ="],
    ["other", "play-pause", "Space"],
    ["other", "delete", "Delete Backspace"],
  ] as const)("on %s, gives %s the value %j", (platform, action, value) => {
    expect(family(platform).ariaKeyShortcuts(action)).toBe(value);
  });

  it("describes chords as parts with message keys for modifiers and named keys", () => {
    expect(family("apple").describe("undo")).toEqual([
      [
        { kind: "modifier", value: "Meta", message: "keys.apple.meta" },
        { kind: "key", value: "Z" },
      ],
    ]);
    expect(family("other").describe("redo")[0]).toEqual([
      { kind: "modifier", value: "Control", message: "keys.control" },
      { kind: "modifier", value: "Shift", message: "keys.shift" },
      { kind: "key", value: "Z" },
    ]);
    expect(family("other").describe("play-pause")).toEqual([
      [{ kind: "key", value: "Space", message: "keys.space" }],
    ]);
    expect(family("other").describe("zoom-in")[0]).toEqual([{ kind: "key", value: "+" }]);
    expect(family("other").describe("unknown")).toEqual([]);
  });

  it("only uses message keys that sdkCoreMessages has", () => {
    const registry = createShortcutRegistry({ platform: "apple" });
    const other = createShortcutRegistry({ platform: "other" });
    const named = [
      "Space",
      "Enter",
      "Escape",
      "Tab",
      "Delete",
      "Backspace",
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "Home",
      "End",
      "PageUp",
      "PageDown",
    ];
    for (const [index, key] of named.entries()) {
      for (const target of [registry, other]) {
        target.register(`test.key-${index}`, [`Control+Alt+Shift+Meta+${key}`]);
      }
    }
    const used = new Set(
      [registry, other].flatMap((target) =>
        named.flatMap((_, index) =>
          target
            .describe(`test.key-${index}`)
            .flat()
            .flatMap((part) => (part.message ? [part.message] : [])),
        ),
      ),
    );

    expect(used.size).toBe(8 + named.length);
    for (const message of used) {
      expect(Object.keys(sdkCoreMessages), message).toContain(message);
    }
  });
});
