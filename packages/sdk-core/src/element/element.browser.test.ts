import { afterEach, describe, expect, it, vi } from "vitest";
import { adoptSharedStyleSheet, createEditorElement, type MountedEditor } from "../element.js";

interface Props {
  theme: string;
  tools: string[];
  file: Blob;
}

interface Methods {
  undo(): string;
  open(file: Blob): Promise<void>;
}

let counter = 0;
/** A unique kind per test, because a tag name can be registered only once per page. */
const uniqueKind = () => `test${++counter}`;

/** A definition whose mount records what happens to it. */
function setup(kind = uniqueKind()) {
  const log: string[] = [];
  const updates: Partial<Props>[] = [];
  let mounted: { host: HTMLElement; props: Partial<Props> } | undefined;
  let dispatch: ((name: "change" | "error", detail?: unknown) => void) | undefined;
  const define = createEditorElement<Props, Methods, "change" | "error">({
    kind,
    attributes: {
      theme: "theme",
      tools: { property: "tools", parse: (value) => value.split(/\s+/).filter(Boolean) },
    },
    properties: ["file"],
    methods: ["undo", "open"],
    events: ["change", "error"],
    mount(host, props, context): MountedEditor<Props, Methods> {
      log.push("mount");
      mounted = { host, props };
      dispatch = context.dispatch;
      host.textContent = "editor";
      return {
        update(next) {
          log.push("update");
          updates.push(next);
        },
        unmount() {
          log.push("unmount");
        },
        handle: {
          undo: () => "undone",
          open: async () => {},
        },
      };
    },
  });
  return {
    kind,
    define,
    log,
    updates,
    mounted: () => mounted,
    dispatch: (...args: Parameters<NonNullable<typeof dispatch>>) => dispatch?.(...args),
  };
}

const microtask = () => new Promise<void>((resolve) => queueMicrotask(resolve));

afterEach(() => {
  document.body.replaceChildren();
});

describe("createEditorElement", () => {
  describe("define", () => {
    it("registers hm-<kind>-editor by default and returns the same class again", () => {
      const { kind, define } = setup();

      const element = define();

      expect(customElements.get(`hm-${kind}-editor`)).toBe(element);
      expect(define()).toBe(element);
    });

    it("registers another name with its own class", () => {
      const { kind, define } = setup();

      const first = define();
      const second = define(`my-${kind}-editor`);

      expect(second).not.toBe(first);
      expect(customElements.get(`my-${kind}-editor`)).toBe(second);
    });

    it("throws a TypeError for a name another class has", () => {
      const kind = uniqueKind();
      customElements.define(`hm-${kind}-editor`, class extends HTMLElement {});

      expect(() => setup(kind).define()).toThrow(
        `"hm-${kind}-editor" is already registered by another class.`,
      );
    });

    it("throws a TypeError for a member that would replace HTMLElement's own", () => {
      const define = createEditorElement<{ title: string }>({
        kind: uniqueKind(),
        properties: ["title"],
        mount: () => ({ update() {}, unmount() {}, handle: {} }),
      });

      expect(() => define()).toThrow(`"title" would replace HTMLElement's own "title".`);
    });
  });

  describe("lifecycle", () => {
    it("mounts synchronously on connect, with the attributes and properties so far", () => {
      const { define, log, mounted } = setup();
      const element = new (define())();
      const file = new Blob(["x"]);
      element.setAttribute("theme", "dark");
      element.setAttribute("tools", "undo  redo");
      element.file = file;

      document.body.append(element);

      expect(log).toEqual(["mount"]);
      expect(mounted()?.host).toBe(element);
      expect(mounted()?.props).toEqual({ theme: "dark", tools: ["undo", "redo"], file });
      expect(element.textContent).toBe("editor");
      expect(element.shadowRoot).toBeNull();
    });

    it("applies properties set before the element was upgraded", () => {
      const { kind, define, mounted } = setup();
      const element = document.createElement(`hm-${kind}-editor`) as HTMLElement & Partial<Props>;
      const file = new Blob(["x"]);
      element.file = file;
      document.body.append(element);

      define();

      expect(mounted()?.props).toEqual({ file });
      expect(Object.hasOwn(element, "file")).toBe(false);
      expect(element.file).toBe(file);
    });

    it("batches changes into one update with every prop's current value", async () => {
      const { define, log, updates } = setup();
      const element = new (define())();
      document.body.append(element);

      element.setAttribute("theme", "dark");
      element.tools = ["undo"];
      element.setAttribute("theme", "light");
      await microtask();

      expect(log).toEqual(["mount", "update"]);
      expect(updates).toEqual([{ theme: "light", tools: ["undo"] }]);
      expect(element.theme).toBe("light");
    });

    it("sets a prop to undefined when its attribute is removed, and never writes attributes", async () => {
      const { define, updates } = setup();
      const element = new (define())();
      element.setAttribute("theme", "dark");
      document.body.append(element);

      element.removeAttribute("theme");
      await microtask();
      expect(updates.at(-1)).toHaveProperty("theme");
      expect(updates.at(-1)?.theme).toBeUndefined();

      element.theme = "light";
      await microtask();
      expect(updates.at(-1)).toEqual({ theme: "light" });
      expect(element.hasAttribute("theme")).toBe(false);
    });

    it("keeps the editor when the element is moved", async () => {
      const { define, log } = setup();
      const element = new (define())();
      const other = document.createElement("section");
      document.body.append(element, other);

      other.append(element);
      await microtask();

      expect(log).toEqual(["mount"]);
    });

    it("unmounts when the element is removed, and mounts again when it's added back", async () => {
      const { define, log } = setup();
      const element = new (define())();
      document.body.append(element);

      element.remove();
      await microtask();
      expect(log).toEqual(["mount", "unmount"]);

      document.body.append(element);
      expect(log).toEqual(["mount", "unmount", "mount"]);
    });

    it("doesn't update an unmounted editor", async () => {
      const { define, log } = setup();
      const element = new (define())();
      element.theme = "dark";
      await microtask();

      expect(log).toEqual([]);
    });
  });

  describe("methods", () => {
    it("forward to the mounted editor's handle", async () => {
      const { define } = setup();
      const element = new (define())();
      document.body.append(element);

      expect(element.undo()).toBe("undone");
      await expect(element.open(new Blob())).resolves.toBeUndefined();
    });

    it("throw InvalidStateError while the element isn't connected", () => {
      const { define } = setup();
      const element = new (define())();

      expect(() => element.undo()).toThrow(expect.objectContaining({ name: "InvalidStateError" }));
      document.body.append(element);
      element.remove();
      expect(() => element.undo()).toThrow(expect.objectContaining({ name: "InvalidStateError" }));
    });
  });

  describe("events", () => {
    it("fires hm-<kind>-editor-<name>, bubbling, composed and not cancelable", () => {
      const { kind, define, dispatch } = setup();
      const element = new (define())();
      document.body.append(element);
      const listener = vi.fn();
      document.addEventListener(`hm-${kind}-editor-change`, listener);

      dispatch("change", { canUndo: true });

      document.removeEventListener(`hm-${kind}-editor-change`, listener);
      const event = listener.mock.calls[0]?.[0] as CustomEvent;
      expect(event.target).toBe(element);
      expect(event).toMatchObject({ bubbles: true, composed: true, cancelable: false });
      expect(event.detail).toEqual({ canUndo: true });
    });

    it("keeps the kind's event names under another tag name", () => {
      const { kind, define, dispatch } = setup();
      const element = new (define(`renamed-${kind}`))();
      document.body.append(element);
      const listener = vi.fn();
      element.addEventListener(`hm-${kind}-editor-error`, listener);

      dispatch("error");

      expect(listener).toHaveBeenCalledOnce();
    });

    it("throws a TypeError for an event the definition doesn't list", () => {
      const { define, dispatch } = setup();
      document.body.append(new (define())());

      expect(() => dispatch("other" as "change")).toThrow(TypeError);
    });
  });
});

// Firefox's `document.adoptedStyleSheets` is an ObservableArray, not an
// Array, so `toEqual` against an array fails even with the same sheets. These
// tests compare a spread copy instead.
describe("adoptSharedStyleSheet", () => {
  afterEach(() => {
    document.adoptedStyleSheets = [];
  });

  it("adopts a package's styles once, and shares the sheet within a compatible line", () => {
    const name = `@test/${uniqueKind()}`;

    const first = adoptSharedStyleSheet({ name, version: "0.4.0", cssText: ".a { color: red; }" });
    const second = adoptSharedStyleSheet({
      name,
      version: "0.4.7",
      cssText: ".a { color: blue; }",
    });

    expect(second).toBe(first);
    expect([...document.adoptedStyleSheets]).toEqual([first]);
    expect(first.cssRules[0]?.cssText).toContain("red");
  });

  it("adopts another minor alongside, and warns once naming both versions", () => {
    const name = `@test/${uniqueKind()}`;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const older = adoptSharedStyleSheet({ name, version: "0.4.0", cssText: ".a {}" });
    const newer = adoptSharedStyleSheet({ name, version: "0.5.1", cssText: ".b {}" });
    adoptSharedStyleSheet({ name, version: "0.5.2", cssText: ".b {}" });

    expect(newer).not.toBe(older);
    expect([...document.adoptedStyleSheets]).toEqual([older, newer]);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[0]).toContain(`${name} 0.5.1 and 0.4.0`);
    warn.mockRestore();
  });

  it("shares by major after 1.0", () => {
    const name = `@test/${uniqueKind()}`;

    const first = adoptSharedStyleSheet({ name, version: "1.2.0", cssText: "" });

    expect(adoptSharedStyleSheet({ name, version: "1.9.3", cssText: "" })).toBe(first);
  });

  it("adopts the shared sheet again in a document that lost it", () => {
    const name = `@test/${uniqueKind()}`;
    const sheet = adoptSharedStyleSheet({ name, version: "0.1.0", cssText: "" });
    document.adoptedStyleSheets = [];

    adoptSharedStyleSheet({ name, version: "0.1.0", cssText: "" });

    expect([...document.adoptedStyleSheets]).toEqual([sheet]);
  });

  it("throws a TypeError for a version that isn't semver", () => {
    expect(() =>
      adoptSharedStyleSheet({ name: "@test/x", version: "latest", cssText: "" }),
    ).toThrow(TypeError);
  });
});
