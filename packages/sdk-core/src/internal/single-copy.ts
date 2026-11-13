import { warnInDevelopment } from "./development.js";

declare const process: { readonly env: { readonly NODE_ENV?: string } };

/**
 * sdk-core's version, written in by the library build. Pipelines that compile
 * the source themselves, such as the tests, leave it out.
 */
declare const __HM_SDK_CORE_VERSION__: string | undefined;

/** Where every copy of sdk-core on the page registers itself, shared across copies. */
const REGISTRY = /* @__PURE__ */ Symbol.for("@hussmartinez/sdk-core");

/** This copy's identity: two installs of the same version are still two copies. */
const THIS_COPY = {};

let checked = false;

/** This copy's version, or a placeholder where the build didn't write it in. */
function ownVersion(): string {
  return typeof __HM_SDK_CORE_VERSION__ === "string"
    ? __HM_SDK_CORE_VERSION__
    : "an unknown version";
}

/**
 * Warns once, in development, when a second copy of sdk-core is used on the
 * page (ADR 0047). `isSdkError` still recognises errors from either copy, but
 * `instanceof SdkError` fails silently across copies, and nothing else is
 * shared.
 *
 * Called on first use by sdk-core's most used entry points, never on import,
 * so importing sdk-core stays free of side effects. It does nothing in
 * production, and bundlers drop it there.
 */
export function checkSingleCopy(): void {
  if (checked) {
    return;
  }
  checked = true;
  if (typeof process !== "undefined" && process.env.NODE_ENV !== "production") {
    const global = globalThis as { [REGISTRY]?: Map<object, string> };
    const copies = global[REGISTRY] ?? new Map<object, string>();
    global[REGISTRY] = copies;
    copies.set(THIS_COPY, ownVersion());
    if (copies.size > 1) {
      warnInDevelopment(
        `${copies.size} copies of @hussmartinez/sdk-core are in use (${[...copies.values()].join(", ")}). \`instanceof SdkError\` fails for errors from another copy, so use \`isSdkError\`, and each copy keeps its own caches. Install a single version: \`npm ls @hussmartinez/sdk-core\` shows where each comes from, and every SDK, \`@hussmartinez/ui\` and your application should use the same minor version.`,
      );
    }
  }
}
