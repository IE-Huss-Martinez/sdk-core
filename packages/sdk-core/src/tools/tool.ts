/**
 * A tool's definition: one feature of an editor, such as rotating pages or
 * splitting a clip (ADR 0009, ADR 0030). Headless: `sdk-core` never reads
 * `view`, which is the SDK's own UI contribution.
 *
 * @typeParam State - The session state that availability is computed from.
 * @typeParam Context - What `run` receives, such as the session.
 * @typeParam View - The SDK's UI contribution, such as a React component.
 * @public
 */
export interface ToolDefinition<State = unknown, Context = unknown, View = unknown> {
  /** `<sdk>.<tool>`, lowercase, such as `pdf.rotate-left`. Unique in a registry. */
  readonly id: string;
  /** The message key of its label (ADR 0014), never text. */
  readonly label: string;
  /** The name of an icon from `@hussmartinez/ui`'s icon set. */
  readonly icon: string;
  /** The toolbar group it belongs to by default, such as `history`. */
  readonly group: string;
  /** Capabilities it needs, such as `encryption`. Without one, it's left out. */
  readonly requires?: readonly string[];
  /** Whether to show it now. Shown when omitted. */
  readonly isAvailable?: (state: State) => boolean;
  /** Whether it can run now; shown disabled otherwise. Enabled when omitted. */
  readonly isEnabled?: (state: State) => boolean;
  /** For toggles: whether it's on, shown with `aria-pressed`. */
  readonly isActive?: (state: State) => boolean;
  /** Does what the tool does. */
  readonly run: (context: Context) => void | Promise<void>;
  /** Its key chords, such as `["Mod+Shift+R"]`, or the name of a family action, such as `"undo"`. */
  readonly shortcuts?: string | readonly string[];
  /** The SDK's UI contribution, which only its own UI layer reads. */
  readonly view?: View;
}

/**
 * A tool, checked and frozen by {@link defineTool}.
 *
 * @public
 */
export type Tool<State = unknown, Context = unknown, View = unknown> = Readonly<
  ToolDefinition<State, Context, View>
>;

const ID = /^[a-z][a-z0-9]*\.[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const GROUP = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const KEYS = new Set([
  "id",
  "label",
  "icon",
  "group",
  "requires",
  "isAvailable",
  "isEnabled",
  "isActive",
  "run",
  "shortcuts",
  "view",
]);

const isText = (value: unknown): value is string => typeof value === "string" && value !== "";

/**
 * Checks a tool's definition and returns it frozen.
 *
 * @example
 * ```ts
 * export const rotateLeft = defineTool({
 *   id: "pdf.rotate-left",
 *   label: "tools.rotate-left",
 *   icon: "rotate-left",
 *   group: "pages",
 *   isEnabled: (state: PdfSessionSnapshot) => state.selection.length > 0,
 *   run: ({ session }: PdfToolContext) => session.rotateSelection(-90),
 *   shortcuts: ["Mod+Shift+L"],
 * });
 * ```
 *
 * @param definition - The tool.
 * @returns The same definition, frozen.
 * @throws `TypeError` if the definition is malformed, such as an `id` that
 *   isn't `<sdk>.<tool>`, a missing `run`, or an unknown key.
 * @public
 */
export function defineTool<State = unknown, Context = unknown, View = unknown>(
  definition: ToolDefinition<State, Context, View>,
): Tool<State, Context, View> {
  const where = isText(definition?.id) ? `Tool "${definition.id}"` : "A tool";
  const fail = (problem: string): never => {
    throw new TypeError(`${where} ${problem}.`);
  };
  if (definition === null || typeof definition !== "object") {
    fail("must be an object");
  }
  const unknown = Object.keys(definition).filter((key) => !KEYS.has(key));
  if (unknown.length > 0) {
    fail(`has unknown keys: ${unknown.join(", ")}`);
  }
  if (!isText(definition.id) || !ID.test(definition.id)) {
    fail(`needs an id like "pdf.rotate-left": "<sdk>.<tool>", in lowercase`);
  }
  for (const key of ["label", "icon"] as const) {
    if (!isText(definition[key])) {
      fail(`needs a ${key}`);
    }
  }
  if (!isText(definition.group) || !GROUP.test(definition.group)) {
    fail('needs a group in lowercase, such as "pages"');
  }
  if (
    definition.requires !== undefined &&
    !(Array.isArray(definition.requires) && definition.requires.every(isText))
  ) {
    fail("must list its requires as capability names");
  }
  for (const key of ["isAvailable", "isEnabled", "isActive"] as const) {
    if (definition[key] !== undefined && typeof definition[key] !== "function") {
      fail(`must have a function for ${key}`);
    }
  }
  if (typeof definition.run !== "function") {
    fail("needs a run function");
  }
  const { shortcuts } = definition;
  if (
    shortcuts !== undefined &&
    !isText(shortcuts) &&
    !(Array.isArray(shortcuts) && shortcuts.every(isText))
  ) {
    fail("must give its shortcuts as chords or a family action name");
  }
  return Object.freeze({
    ...definition,
    ...(definition.requires ? { requires: Object.freeze([...definition.requires]) } : {}),
    ...(Array.isArray(shortcuts) ? { shortcuts: Object.freeze([...shortcuts]) } : {}),
  });
}
