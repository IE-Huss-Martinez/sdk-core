/**
 * What a key's target is, read by duck typing so that no DOM types are
 * needed: a field that keeps every key, a control that keeps the keys that
 * operate it, or anything else.
 */
export type TargetKind = "editable" | "control" | "other";

interface TargetLike {
  readonly tagName?: unknown;
  readonly type?: unknown;
  readonly isContentEditable?: unknown;
  getAttribute?(name: string): string | null;
}

/** Input types that are controls rather than fields. */
const CONTROL_INPUTS = new Set([
  "button",
  "submit",
  "reset",
  "checkbox",
  "radio",
  "range",
  "color",
  "file",
  "image",
]);
const EDITABLE_ROLES = new Set(["textbox", "searchbox", "combobox", "spinbutton"]);
const CONTROL_ROLES = new Set([
  "button",
  "checkbox",
  "switch",
  "radio",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "option",
  "tab",
  "slider",
  "link",
  "treeitem",
]);

export function targetKind(target: unknown): TargetKind {
  if (target === null || typeof target !== "object") {
    return "other";
  }
  const element = target as TargetLike;
  if (element.isContentEditable === true) {
    return "editable";
  }
  const role = typeof element.getAttribute === "function" ? element.getAttribute("role") : null;
  if (role && EDITABLE_ROLES.has(role)) {
    return "editable";
  }
  if (role && CONTROL_ROLES.has(role)) {
    return "control";
  }
  const tag = typeof element.tagName === "string" ? element.tagName.toUpperCase() : "";
  switch (tag) {
    case "TEXTAREA":
    case "SELECT":
      return "editable";
    case "INPUT":
      return CONTROL_INPUTS.has(String(element.type ?? "text").toLowerCase())
        ? "control"
        : "editable";
    case "BUTTON":
    case "SUMMARY":
      return "control";
    case "A":
      return element.getAttribute?.("href") != null ? "control" : "other";
    default:
      return "other";
  }
}
