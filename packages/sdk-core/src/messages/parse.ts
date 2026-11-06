import type { MessageFormats, PluralCategory, PluralMessage } from "./types.js";

/** A placeholder format. */
export type Format = keyof MessageFormats;

/** A compiled template: literal text and placeholders, in order. */
export type Template = ReadonlyArray<string | { readonly name: string; readonly format: Format }>;

/** The compiled forms of a plural message. `other` is always present. */
export type PluralForms = Readonly<Partial<Record<PluralCategory, Template>>> & {
  readonly other: Template;
};

/** A compiled message, ready to render. */
export type CompiledMessage =
  | { readonly kind: "text"; readonly template: Template }
  | { readonly kind: "plural"; readonly selector: string; readonly forms: PluralForms };

/** Formats that can be named in a placeholder. `default` is implied by `{name}`. */
const NAMED_FORMATS: ReadonlySet<string> = new Set<Format>(["number", "fileSize", "date", "time"]);
const PLURAL_CATEGORIES: ReadonlySet<string> = new Set<PluralCategory>([
  "zero",
  "one",
  "two",
  "few",
  "many",
  "other",
]);
const NAME = /^[A-Za-z_$][\w$]*$/;

/**
 * Compiles a template. Returns `undefined` for a malformed one: an unbalanced
 * brace, an empty or invalid name, or an unknown format.
 *
 * @param source - The template text.
 */
export function parseTemplate(source: string): Template | undefined {
  const parts: Array<string | { name: string; format: Format }> = [];
  let index = 0;
  while (index < source.length) {
    const open = source.indexOf("{", index);
    const close = source.indexOf("}", index);
    if (close !== -1 && (open === -1 || close < open)) {
      return undefined;
    }
    if (open === -1) {
      parts.push(source.slice(index));
      break;
    }
    if (open > index) {
      parts.push(source.slice(index, open));
    }
    const end = source.indexOf("}", open);
    const body = end === -1 ? undefined : source.slice(open + 1, end);
    if (body === undefined || body.includes("{")) {
      return undefined;
    }
    const [rawName = "", rawFormat, ...extra] = body.split(",");
    const name = rawName.trim();
    const format = rawFormat?.trim();
    const validFormat = format === undefined || NAMED_FORMATS.has(format);
    if (extra.length > 0 || !NAME.test(name) || !validFormat) {
      return undefined;
    }
    parts.push({ name, format: (format ?? "default") as Format });
    index = end + 1;
  }
  return parts;
}

/**
 * Compiles a message value, validating it as untrusted input.
 *
 * @param value - A string or a plural object, from code or from JSON.
 * @returns The compiled message, or `undefined` if it's malformed.
 */
export function compileMessage(value: unknown): CompiledMessage | undefined {
  if (typeof value === "string") {
    const template = parseTemplate(value);
    return template && { kind: "text", template };
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const plural = value as Partial<PluralMessage> & Record<string, unknown>;
  if (
    typeof plural.$plural !== "string" ||
    !NAME.test(plural.$plural) ||
    typeof plural.other !== "string"
  ) {
    return undefined;
  }
  const forms: Partial<Record<PluralCategory, Template>> = {};
  for (const [key, text] of Object.entries(plural)) {
    if (key === "$plural") {
      continue;
    }
    const template =
      typeof text === "string" && PLURAL_CATEGORIES.has(key) ? parseTemplate(text) : undefined;
    if (template === undefined) {
      return undefined;
    }
    forms[key as PluralCategory] = template;
  }
  return { kind: "plural", selector: plural.$plural, forms: forms as PluralForms };
}

/**
 * Lists the parameter names a compiled message uses.
 *
 * @param message - A compiled message.
 */
export function parameterNames(message: CompiledMessage): Set<string> {
  const templates = message.kind === "text" ? [message.template] : Object.values(message.forms);
  const names = new Set<string>(message.kind === "plural" ? [message.selector] : []);
  for (const template of templates) {
    for (const part of template ?? []) {
      if (typeof part !== "string") {
        names.add(part.name);
      }
    }
  }
  return names;
}
