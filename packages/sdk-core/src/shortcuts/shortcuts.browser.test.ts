import { afterEach, describe, expect, it } from "vitest";
import { createShortcutRegistry } from "./registry.js";

afterEach(() => {
  document.body.replaceChildren();
});

/** The editor's root, with a dialog inside it holding a radio button, as image-sdk's export dialog does. */
function editorWithDialog() {
  const root = document.createElement("div");
  const dialog = document.createElement("dialog");
  const radio = document.createElement("input");
  radio.type = "radio";
  dialog.append(radio);
  root.append(dialog);
  document.body.append(root);
  return { root, dialog, radio };
}

/** The tool a real keydown on `target` triggers, from a listener on `root`. */
function matchFrom(target: HTMLElement, root: HTMLElement, key: string): string | undefined {
  const registry = createShortcutRegistry({
    platform: "other",
    tools: [{ id: "rotate", shortcuts: ["]"] }],
  });
  let matched: string | undefined;
  root.addEventListener("keydown", (event) => {
    matched = registry.match(event);
  });
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, composed: true }));
  return matched;
}

describe("shortcuts and dialogs, with real elements", () => {
  it("leave keys to a dialog shown with showModal()", () => {
    const { root, dialog, radio } = editorWithDialog();
    dialog.showModal();

    expect(dialog.matches(":modal")).toBe(true);
    expect(matchFrom(radio, root, "]")).toBeUndefined();
  });

  it("still fire from a dialog shown with show(), which isn't modal", () => {
    const { root, dialog, radio } = editorWithDialog();
    dialog.show();

    expect(matchFrom(radio, root, "]")).toBe("rotate");
  });

  it("still fire when the editor itself is inside a host's modal dialog", () => {
    const host = document.createElement("dialog");
    const root = document.createElement("div");
    const button = document.createElement("div");
    root.append(button);
    host.append(root);
    document.body.append(host);
    host.showModal();

    expect(matchFrom(button, root, "]")).toBe("rotate");
  });
});
