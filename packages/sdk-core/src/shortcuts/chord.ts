/**
 * A platform: Apple's, where `Mod` is `Meta`, or any other, where it's
 * `Control`.
 *
 * @public
 */
export type Platform = "apple" | "other";

/**
 * A modifier key, as written in chords and in `aria-keyshortcuts`.
 *
 * @public
 */
export type Modifier = "Control" | "Alt" | "Shift" | "Meta";

/** Named keys a chord can use, as `KeyboardEvent.key` reports them, except `Space`. */
const NAMED = new Set([
  "Space",
  "Enter",
  "Escape",
  "Tab",
  "Delete",
  "Backspace",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  ...Array.from({ length: 12 }, (_, index) => `F${index + 1}`),
]);
const MODIFIERS = new Set(["Mod", "Control", "Alt", "Shift", "Meta"]);

/** A chord resolved for one platform. */
export interface Chord {
  /** The chord as written, such as `Mod+Shift+Z`. */
  readonly source: string;
  readonly control: boolean;
  readonly alt: boolean;
  readonly shift: boolean;
  readonly meta: boolean;
  /**
   * The key, as `KeyboardEvent.key` reports it: a lowercase letter, a single
   * printable character, or a named key, with `Space` as `" "`.
   */
  readonly key: string;
  /** A printable character other than a letter, for which Shift is ignored. */
  readonly symbol: boolean;
}

/**
 * Parses a chord such as `Mod+Shift+Z`, `Delete`, `Space` or `+` for a
 * platform.
 *
 * @throws `TypeError` if it's malformed.
 */
export function parseChord(source: string, platform: Platform): Chord {
  const fail = (problem: string): never => {
    throw new TypeError(`The shortcut "${source}" ${problem}.`);
  };
  if (typeof source !== "string" || source === "") {
    fail("is empty");
  }
  // The key is the last part. "+" alone, or a chord ending in "++", uses "+".
  const parts =
    source === "+"
      ? ["+"]
      : source.endsWith("++")
        ? [...source.slice(0, -2).split("+"), "+"]
        : source.split("+");
  if (parts.some((part) => part === "")) {
    fail("has an empty part");
  }
  const key = parts.pop() as string;
  const modifiers = parts;
  for (const modifier of modifiers) {
    if (!MODIFIERS.has(modifier)) {
      fail(`has an unknown modifier, "${modifier}"`);
    }
  }
  if (new Set(modifiers).size !== modifiers.length) {
    fail("repeats a modifier");
  }
  const has = (name: string) => modifiers.includes(name);
  const mod = has("Mod");
  if (mod && has(platform === "apple" ? "Meta" : "Control")) {
    fail("names Mod and the key it stands for");
  }
  const letter = /^[a-zA-Z]$/.test(key);
  const symbol = !letter && [...key].length === 1 && key !== " ";
  if (!letter && !symbol && !NAMED.has(key)) {
    fail(`has an unknown key, "${key}"`);
  }
  if (symbol && has("Shift")) {
    fail("uses Shift with a character other than a letter; write the character itself");
  }
  return Object.freeze({
    source,
    control: has("Control") || (mod && platform === "other"),
    meta: has("Meta") || (mod && platform === "apple"),
    alt: has("Alt"),
    shift: has("Shift"),
    key: letter ? key.toLowerCase() : key === "Space" ? " " : key,
    symbol,
  });
}

/** A chord's signature, equal for chords that the same key press triggers. */
export const signature = (chord: Chord): string =>
  [chord.control, chord.alt, chord.symbol ? "*" : chord.shift, chord.meta, chord.key].join("|");
