import type { Tool } from "./tool.js";

/**
 * Options for {@link createToolRegistry}: an editor's `tools`, `toolbar` and
 * capability settings, as plain data (ADR 0009).
 *
 * @public
 */
export interface ToolRegistryOptions {
  /** Which tools are present, in order. All of them, in definition order, by default. */
  readonly tools?: readonly string[];
  /**
   * The toolbar's groups, as tool ids, such as
   * `[["pdf.undo", "pdf.redo"], ["pdf.rotate-left"]]`. By default, the present
   * tools grouped by their `group`, in order of first appearance.
   */
  readonly toolbar?: readonly (readonly string[])[];
  /**
   * The capabilities that are on. A tool that requires one that isn't is left
   * out. None by default.
   */
  readonly capabilities?: Iterable<string>;
}

/**
 * An editor's tools, resolved from its options.
 *
 * @typeParam T - The tools.
 * @public
 */
export interface ToolRegistry<T extends Tool<never, never, unknown>> {
  /** The present tools, in order. */
  readonly tools: readonly T[];
  /** The toolbar's groups of present tools. Empty groups are left out. */
  readonly toolbar: readonly (readonly T[])[];
  /** The ids of tools left out because a capability they require is off. */
  readonly omitted: readonly string[];
  /** A present tool by id. */
  get(id: string): T | undefined;
}

/**
 * Resolves an editor's tools from its options (ADR 0030). Mistakes fail when
 * the editor is created, not silently: an unknown or repeated id throws.
 *
 * @example
 * ```ts
 * const registry = createToolRegistry(pdfTools, {
 *   tools: props.tools,
 *   toolbar: props.toolbar,
 *   capabilities: detectCapabilities(),
 * });
 * ```
 *
 * @param tools - Every tool the editor knows, from {@link defineTool}.
 * @param options - The editor's settings.
 * @throws `TypeError` if two tools share an id, or the options name a tool
 *   that doesn't exist, name one twice, or put a tool on the toolbar that
 *   `tools` leaves out.
 * @public
 */
export function createToolRegistry<T extends Tool<never, never, unknown>>(
  tools: readonly T[],
  options: ToolRegistryOptions = {},
): ToolRegistry<T> {
  const byId = new Map<string, T>();
  const repeated = new Set<string>();
  for (const tool of tools) {
    if (byId.has(tool.id)) {
      repeated.add(tool.id);
    }
    byId.set(tool.id, tool);
  }
  if (repeated.size > 0) {
    throw new TypeError(`More than one tool has the id ${list(repeated)}.`);
  }

  const known = (ids: readonly string[], option: string) => {
    const unknown = ids.filter((id) => !byId.has(id));
    if (unknown.length > 0) {
      throw new TypeError(`The ${option} option names unknown tools: ${list(unknown)}.`);
    }
    const twice = ids.filter((id, index) => ids.indexOf(id) !== index);
    if (twice.length > 0) {
      throw new TypeError(`The ${option} option names tools more than once: ${list(twice)}.`);
    }
  };

  const chosen = options.tools ?? tools.map((tool) => tool.id);
  known(chosen, "tools");
  const capabilities = new Set(options.capabilities ?? []);
  const omitted: string[] = [];
  const present: T[] = [];
  for (const id of chosen) {
    const tool = byId.get(id) as T;
    if ((tool.requires ?? []).every((capability) => capabilities.has(capability))) {
      present.push(tool);
    } else {
      omitted.push(id);
    }
  }
  const presentIds = new Set(present.map((tool) => tool.id));

  let toolbar: T[][];
  if (options.toolbar) {
    const ids = options.toolbar.flat();
    known(ids, "toolbar");
    const left = ids.filter((id) => !chosen.includes(id));
    if (left.length > 0) {
      throw new TypeError(`The toolbar option names tools that tools leaves out: ${list(left)}.`);
    }
    toolbar = options.toolbar.map((group) =>
      group.filter((id) => presentIds.has(id)).map((id) => byId.get(id) as T),
    );
  } else {
    const groups = new Map<string, T[]>();
    for (const tool of present) {
      groups.set(tool.group, [...(groups.get(tool.group) ?? []), tool]);
    }
    toolbar = [...groups.values()];
  }

  return Object.freeze({
    tools: Object.freeze(present),
    toolbar: Object.freeze(
      toolbar.filter((group) => group.length > 0).map((group) => Object.freeze(group)),
    ),
    omitted: Object.freeze(omitted),
    get: (id: string) => (presentIds.has(id) ? byId.get(id) : undefined),
  });
}

const list = (ids: Iterable<string>) => [...ids].map((id) => `"${id}"`).join(", ");
