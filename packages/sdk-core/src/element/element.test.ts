import { describe, expect, it } from "vitest";
import { adoptSharedStyleSheet, createEditorElement } from "../element.js";
import { isSdkError } from "../errors/sdk-error.js";

const mount = () => ({ update() {}, unmount() {}, handle: {} });

describe("the element entry on a server", () => {
  it("creates a definition without touching a browser API", () => {
    expect(typeof HTMLElement).toBe("undefined");
    expect(() => createEditorElement({ kind: "pdf", mount })).not.toThrow();
  });

  it("throws UNSUPPORTED_ENVIRONMENT from define where custom elements don't exist", () => {
    const define = createEditorElement({ kind: "pdf", mount });

    let error: unknown;
    try {
      define();
    } catch (caught) {
      error = caught;
    }
    expect(isSdkError(error, "UNSUPPORTED_ENVIRONMENT")).toBe(true);
    expect(error).toMatchObject({ details: { feature: "customElements" } });
  });

  it("throws UNSUPPORTED_ENVIRONMENT from adoptSharedStyleSheet without a document", () => {
    expect(() =>
      adoptSharedStyleSheet({ name: "@hussmartinez/ui/styles", version: "0.4.0", cssText: "" }),
    ).toThrow(expect.objectContaining({ code: "UNSUPPORTED_ENVIRONMENT" }));
  });
});

describe("createEditorElement's checks", () => {
  it.each(["PDF", "", "1pdf", "pdf editor"])("rejects the kind %j", (kind) => {
    expect(() => createEditorElement({ kind, mount })).toThrow(TypeError);
  });

  it("rejects invalid attribute and event names", () => {
    expect(() =>
      createEditorElement<{ theme: string }>({
        kind: "pdf",
        attributes: { Theme: "theme" },
        mount,
      }),
    ).toThrow(/Attribute and event names/);
    expect(() =>
      createEditorElement<object, object, string>({ kind: "pdf", events: ["Change"], mount }),
    ).toThrow(/Attribute and event names/);
  });

  it("rejects a member defined twice", () => {
    expect(() =>
      createEditorElement<{ theme: string }, { theme(): void }>({
        kind: "pdf",
        attributes: { theme: "theme" },
        methods: ["theme"],
        mount: mount as never,
      }),
    ).toThrow('"theme" is defined more than once.');
    expect(() =>
      createEditorElement<{ file: Blob }>({ kind: "pdf", properties: ["file", "file"], mount }),
    ).toThrow(/more than once/);
  });
});
