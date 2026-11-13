import { createElement, type KeyboardEvent as ReactKeyboardEvent, useEffect, useRef } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { createShortcutRegistry, type ShortcutRegistry } from "./registry.js";

let root: Root | undefined;

afterEach(() => {
  flushSync(() => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
});

/** A `<dialog>` shown with showModal() once it's mounted. */
function ModalDialog({ id, children }: { id: string; children?: unknown }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return createElement("dialog", { ref: dialog, id }, children as never);
}

/**
 * An editor as the SDKs write them: its root listens for keys with React's
 * onKeyDown, and holds a canvas button and an export dialog of its own.
 */
function Editor({
  registry,
  passRoot,
  onMatch,
}: {
  registry: ShortcutRegistry;
  passRoot: boolean;
  onMatch: (id: string | undefined) => void;
}) {
  return createElement(
    "div",
    {
      id: "editor",
      onKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) =>
        onMatch(
          passRoot
            ? registry.match(event.nativeEvent, { root: event.currentTarget })
            : registry.match(event.nativeEvent),
        ),
    },
    createElement("div", { id: "canvas", tabIndex: 0 }),
    createElement(ModalDialog, {
      id: "export",
      children: createElement("input", { id: "format", type: "radio" }),
    }),
  );
}

/**
 * Renders a host app whose own React modal holds the editor, then sends a real
 * keydown from `targetId` and returns what the editor matched.
 */
function pressInHostDialog(targetId: string, passRoot: boolean): string | undefined {
  const registry = createShortcutRegistry({
    platform: "other",
    tools: [{ id: "rotate", shortcuts: ["]"] }],
  });
  let matched: string | undefined = "not called";
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  flushSync(() =>
    root?.render(
      createElement(ModalDialog, {
        id: "host",
        children: createElement(Editor, {
          registry,
          passRoot,
          onMatch: (id) => {
            matched = id;
          },
        }),
      }),
    ),
  );
  const target = document.getElementById(targetId);
  target?.dispatchEvent(new KeyboardEvent("keydown", { key: "]", bubbles: true, composed: true }));
  return matched;
}

describe("shortcuts in React, with the editor inside a host's React modal", () => {
  it("fire when the handler passes the editor as root", () => {
    expect(document.getElementById("host")).toBeNull();
    expect(pressInHostDialog("canvas", true)).toBe("rotate");
    expect(document.getElementById("host")?.matches(":modal")).toBe(true);
  });

  it("are silenced without root, because nativeEvent.currentTarget is React's container", () => {
    expect(pressInHostDialog("canvas", false)).toBeUndefined();
  });

  it("still leave keys to a modal dialog inside the editor when root is passed", () => {
    expect(pressInHostDialog("format", true)).toBeUndefined();
  });
});
