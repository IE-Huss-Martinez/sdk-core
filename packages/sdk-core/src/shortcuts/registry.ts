import { type Chord, type Modifier, type Platform, parseChord, signature } from "./chord.js";
import { type FamilyAction, familyShortcuts, type ShortcutChord } from "./family.js";
import { targetKind } from "./target.js";

/**
 * A tool's shortcuts: the name of a family action, or its own chords.
 *
 * @public
 */
export type ShortcutSpec = FamilyAction | readonly (string | ShortcutChord)[];

/**
 * What {@link ShortcutRegistry.match} reads from a keyboard event. A DOM
 * `KeyboardEvent`, a React keyboard event and a plain object in a test all
 * have this shape.
 *
 * @public
 */
export interface KeyboardEventLike {
  /** The character or named key, as `KeyboardEvent.key` reports it. */
  readonly key: string;
  /** The physical key, such as `KeyZ`, used when Alt on macOS turns a letter into a symbol. */
  readonly code?: string;
  /** Whether Control was held. */
  readonly ctrlKey?: boolean;
  /** Whether Alt, or Option on macOS, was held. */
  readonly altKey?: boolean;
  /** Whether Shift was held. Ignored for chords whose key is a symbol. */
  readonly shiftKey?: boolean;
  /** Whether Meta, Command on macOS, was held. */
  readonly metaKey?: boolean;
  /** Whether the key is held down and repeating. */
  readonly repeat?: boolean;
  /** Whether the key is part of an IME composition. */
  readonly isComposing?: boolean;
  /** Whether something, such as a dialog, has already handled the event. */
  readonly defaultPrevented?: boolean;
  /** The focused element. Fields and controls are recognised by duck typing. */
  readonly target?: unknown;
}

/**
 * One part of a chord, to show as a label. Show `message`'s text from the
 * message catalogue when it's set, and `value` otherwise.
 *
 * @public
 */
export interface ShortcutPart {
  /** Whether it's a modifier or the chord's key. */
  readonly kind: "modifier" | "key";
  /** The modifier, or the key as `KeyboardEvent.key` names it, with letters in capitals. */
  readonly value: string;
  /** A `keys.*` message key in `sdkCoreMessages`, for modifiers and named keys. */
  readonly message?: `keys.${string}`;
}

/**
 * Options for {@link createShortcutRegistry}.
 *
 * @public
 */
export interface ShortcutRegistryOptions {
  /** From {@link platformOf}. */
  readonly platform: Platform;
  /** Tools to register, such as a tool registry's present tools. */
  readonly tools?: readonly { readonly id: string; readonly shortcuts?: ShortcutSpec }[];
}

/**
 * Keyboard shortcuts for an editor's tools (ADR 0030).
 *
 * @public
 */
export interface ShortcutRegistry {
  /**
   * Registers an id's shortcuts.
   *
   * @throws `TypeError` if the id already has shortcuts, a chord is
   *   malformed, the family action is unknown, or another id already has one
   *   of the chords.
   */
  register(id: string, shortcuts: ShortcutSpec): void;
  /**
   * The id that a keyboard event triggers, if any. Call it from a listener on
   * the editor's root, never on `window` (WCAG 2.1.4), and call
   * `preventDefault` when it returns an id the editor handles.
   *
   * It ignores handled events, IME composition, and repeats unless the
   * shortcut allows them. It never fires in fields unless the shortcut sets
   * `inEditable`, and never takes unmodified `Space`, `Enter` or arrow keys
   * from controls such as buttons and links.
   */
  match(event: KeyboardEventLike): string | undefined;
  /** The value of `aria-keyshortcuts` for an id, such as `Meta+Z`. */
  ariaKeyShortcuts(id: string): string | undefined;
  /** Each of an id's chords as parts, to render as labels. */
  describe(id: string): readonly (readonly ShortcutPart[])[];
}

interface Binding extends Chord {
  readonly id: string;
  readonly inEditable: boolean;
  readonly repeat: boolean;
}

/** Keys that controls use themselves when pressed without a modifier. */
const CONTROL_KEYS = new Set([" ", "Enter", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);

/** Message keys of the named keys a chord can use. */
const KEY_MESSAGES: Record<string, `keys.${string}`> = {
  " ": "keys.space",
  Enter: "keys.enter",
  Escape: "keys.escape",
  Tab: "keys.tab",
  Delete: "keys.delete",
  Backspace: "keys.backspace",
  ArrowUp: "keys.arrowUp",
  ArrowDown: "keys.arrowDown",
  ArrowLeft: "keys.arrowLeft",
  ArrowRight: "keys.arrowRight",
  Home: "keys.home",
  End: "keys.end",
  PageUp: "keys.pageUp",
  PageDown: "keys.pageDown",
};

/** A binding's modifiers, in the order labels and `aria-keyshortcuts` list them. */
const modifiersOf = (binding: Binding): Modifier[] =>
  (
    [
      ["Control", binding.control],
      ["Alt", binding.alt],
      ["Shift", binding.shift],
      ["Meta", binding.meta],
    ] as const
  )
    .filter(([, on]) => on)
    .map(([name]) => name);

/** The key's name in `aria-keyshortcuts` and labels. */
const keyName = (key: string): string =>
  key === " " ? "Space" : key === "+" ? "Plus" : /^[a-z]$/.test(key) ? key.toUpperCase() : key;

/**
 * Creates a {@link ShortcutRegistry} for a platform.
 *
 * @example
 * ```ts
 * const shortcuts = createShortcutRegistry({
 *   platform: platformOf(navigator),
 *   tools: registry.tools,
 * });
 * root.addEventListener("keydown", (event) => {
 *   const id = shortcuts.match(event);
 *   if (id) {
 *     event.preventDefault();
 *     runTool(id);
 *   }
 * });
 * ```
 *
 * @param options - The platform, and tools to register.
 * @public
 */
export function createShortcutRegistry(options: ShortcutRegistryOptions): ShortcutRegistry {
  const { platform } = options;
  if (platform !== "apple" && platform !== "other") {
    throw new TypeError(
      `The platform must be "apple" or "other", not ${JSON.stringify(platform)}.`,
    );
  }
  const bindings: Binding[] = [];
  const byId = new Map<string, Binding[]>();

  const chordsOf = (id: string, spec: ShortcutSpec): ShortcutChord[] => {
    if (typeof spec === "string") {
      const family = (familyShortcuts as Record<string, (typeof familyShortcuts)[FamilyAction]>)[
        spec
      ];
      if (!family) {
        throw new TypeError(`"${id}" names an unknown family action, "${spec}".`);
      }
      return [...family.all, ...(platform === "other" ? (family.other ?? []) : [])];
    }
    if (!Array.isArray(spec)) {
      throw new TypeError(`"${id}" must give its shortcuts as chords or a family action name.`);
    }
    return spec.map((chord) => (typeof chord === "string" ? { keys: chord } : chord));
  };

  const registry: ShortcutRegistry = {
    register(id, spec) {
      if (byId.has(id)) {
        throw new TypeError(`"${id}" already has shortcuts.`);
      }
      const added = chordsOf(id, spec).map((chord) => ({
        ...parseChord(chord.keys, platform),
        id,
        inEditable: chord.inEditable === true,
        repeat: chord.repeat === true,
      }));
      for (const [index, binding] of added.entries()) {
        const taken = [...bindings, ...added.slice(0, index)].find(
          (other) => signature(other) === signature(binding),
        );
        if (taken) {
          throw new TypeError(
            `The shortcut "${binding.source}" of "${id}" is already "${taken.source}" of "${taken.id}".`,
          );
        }
      }
      bindings.push(...added);
      byId.set(id, added);
    },

    match(event) {
      if (!event || event.defaultPrevented || event.isComposing) {
        return undefined;
      }
      const kind = targetKind(event.target);
      const key = event.key;
      for (const binding of bindings) {
        const modifiersMatch =
          binding.control === Boolean(event.ctrlKey) &&
          binding.alt === Boolean(event.altKey) &&
          binding.meta === Boolean(event.metaKey) &&
          // Shift may be what produced a symbol, such as "+" on a US layout.
          (binding.symbol || binding.shift === Boolean(event.shiftKey));
        if (!modifiersMatch) {
          continue;
        }
        const letter = /^[a-z]$/.test(binding.key);
        const keyMatches = letter
          ? key.toLowerCase() === binding.key ||
            // Alt on macOS turns letters into symbols; the physical key decides.
            (Boolean(event.altKey) && event.code === `Key${binding.key.toUpperCase()}`)
          : key === binding.key;
        if (!keyMatches) {
          continue;
        }
        if (event.repeat && !binding.repeat) {
          continue;
        }
        if (kind === "editable" && !binding.inEditable) {
          continue;
        }
        const unmodified = !binding.control && !binding.alt && !binding.meta;
        if (kind === "control" && unmodified && CONTROL_KEYS.has(binding.key)) {
          continue;
        }
        return binding.id;
      }
      return undefined;
    },

    ariaKeyShortcuts(id) {
      const own = byId.get(id);
      if (!own || own.length === 0) {
        return undefined;
      }
      return own
        .map((binding) => [...modifiersOf(binding), keyName(binding.key)].join("+"))
        .join(" ");
    },

    describe(id) {
      return (byId.get(id) ?? []).map((binding) =>
        Object.freeze([
          ...modifiersOf(binding).map((modifier) =>
            Object.freeze({
              kind: "modifier" as const,
              value: modifier,
              message:
                `keys.${platform === "apple" ? "apple." : ""}${modifier.toLowerCase()}` as const,
            }),
          ),
          Object.freeze({
            kind: "key" as const,
            value:
              binding.key === " "
                ? "Space"
                : keyName(binding.key) === "Plus"
                  ? "+"
                  : keyName(binding.key),
            ...(KEY_MESSAGES[binding.key] ? { message: KEY_MESSAGES[binding.key] } : {}),
          }),
        ]),
      );
    },
  };

  for (const tool of options.tools ?? []) {
    if (tool.shortcuts !== undefined) {
      registry.register(tool.id, tool.shortcuts);
    }
  }
  return registry;
}
