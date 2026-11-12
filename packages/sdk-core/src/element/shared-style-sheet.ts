import { SdkError } from "../errors/sdk-error.js";

/**
 * Options for {@link adoptSharedStyleSheet}.
 *
 * @public
 */
export interface SharedStyleSheetOptions {
  /** The package the styles belong to, such as `@hussmartinez/ui/styles`. */
  readonly name: string;
  /** The package's version, such as `0.4.2`. */
  readonly version: string;
  /** The styles. */
  readonly cssText: string;
}

interface SharedSheet {
  readonly sheet: CSSStyleSheet;
  readonly version: string;
}

/** The versions of a package that are compatible: the minor during `0.x`, then the major. */
function compatibleLine(version: string): string {
  const match = /^(\d+)\.(\d+)\.\d+/.exec(version);
  if (!match) {
    throw new TypeError(
      `The version must be semver, such as "0.4.2", not ${JSON.stringify(version)}.`,
    );
  }
  const [, major, minor] = match;
  return major === "0" ? `0.${minor}` : `${major}`;
}

/** Every compatible line of each package adopted on the page, to warn about mismatches once. */
const linesKey = /* @__PURE__ */ Symbol.for("@hussmartinez/sdk-core/shared-style-sheets");

/**
 * Adopts a standalone script's styles into the document once per page, and
 * shares them with every other standalone script that brings the same
 * package's styles (ADR 0040). The constructed sheet is registered on
 * `globalThis` under `Symbol.for("<name>@<line>")`, where the line is the
 * minor during `0.x` and the major afterwards, and nothing modifies it after
 * it's built.
 *
 * Within one line, the first script to load wins: a later script with
 * another patch or minor version of the same line reuses that sheet, and its
 * own `cssText` is ignored.
 *
 * A different line of the same package is adopted alongside, because its
 * components need their own styles, and the console warns once, naming both
 * versions. Standalone scripts are production builds, so the warning isn't
 * limited to development.
 *
 * @example
 * ```ts
 * adoptSharedStyleSheet({ name: "@hussmartinez/ui/styles", version: uiVersion, cssText: uiCss });
 * adoptSharedStyleSheet({ name: "@hussmartinez/pdf-sdk/styles", version, cssText: pdfCss });
 * ```
 *
 * The sheet is adopted into the global `document`.
 *
 * @param options - The package, its version and its styles.
 * @returns The shared sheet.
 * @throws `SdkError` `UNSUPPORTED_ENVIRONMENT` without constructable
 *   stylesheets; `TypeError` if the version isn't semver.
 * @public
 */
export function adoptSharedStyleSheet(options: SharedStyleSheetOptions): CSSStyleSheet {
  const { name, version, cssText } = options;
  // Always the global document: a constructed sheet belongs to the document
  // it was constructed for, so it can't be shared with another one.
  const document = globalThis.document as Document | undefined;
  if (
    document === undefined ||
    typeof CSSStyleSheet === "undefined" ||
    !("adoptedStyleSheets" in document)
  ) {
    throw new SdkError(
      "UNSUPPORTED_ENVIRONMENT",
      "Constructed stylesheets aren't available here.",
      {
        details: { feature: "adoptedStyleSheets" },
      },
    );
  }
  const line = compatibleLine(version);
  const registry = globalThis as unknown as Record<symbol, unknown>;
  const key = Symbol.for(`${name}@${line}`);

  let shared = registry[key] as SharedSheet | undefined;
  if (!shared) {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(cssText);
    shared = Object.freeze({ sheet, version });
    Object.defineProperty(registry, key, { value: shared });

    registry[linesKey] ??= new Map<string, string>();
    const lines = registry[linesKey] as Map<string, string>;
    const others = [...lines.entries()].filter(
      ([other]) => other.startsWith(`${name}@`) && other !== `${name}@${line}`,
    );
    if (others.length > 0) {
      // biome-ignore lint/suspicious/noConsole: standalone scripts have no development build to warn in (ADR 0040).
      console.warn(
        `[@hussmartinez/sdk-core] This page uses ${name} ${version} and ${others.map(([, v]) => v).join(", ")}. Load standalone scripts built with the same version, so its styles apply once.`,
      );
    }
    lines.set(`${name}@${line}`, version);
  }
  if (!document.adoptedStyleSheets.includes(shared.sheet)) {
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, shared.sheet];
  }
  return shared.sheet;
}
