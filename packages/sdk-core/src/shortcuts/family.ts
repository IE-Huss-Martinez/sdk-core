/**
 * A key chord with its options, for {@link ToolDefinition.shortcuts}.
 *
 * @public
 */
export interface ShortcutChord {
  /** Such as `Mod+Shift+Z`, `Delete`, `Space` or `+`. `Mod` is `Meta` on Apple platforms and `Control` elsewhere. */
  readonly keys: string;
  /** Whether it also fires in text fields, which otherwise keep their own keys. */
  readonly inEditable?: boolean;
  /** Whether it fires again while the key is held down. */
  readonly repeat?: boolean;
}

/**
 * An action whose keys are the same in every SDK (ADR 0030). A tool takes
 * them with `shortcuts: "<action>"`.
 *
 * @public
 */
export type FamilyAction =
  | "undo"
  | "redo"
  | "delete"
  | "select-all"
  | "zoom-in"
  | "zoom-out"
  | "zoom-reset"
  | "cancel"
  | "play-pause";

/**
 * The family's shortcuts (ADR 0030): the chords for every platform, and those
 * added on platforms other than Apple's. The editor's zoom never uses
 * `Mod+=`, `Mod+-` or `Mod+0`, which are the browser's page zoom.
 *
 * @public
 */
export const familyShortcuts: {
  readonly [Action in FamilyAction]: {
    readonly all: readonly ShortcutChord[];
    readonly other?: readonly ShortcutChord[];
  };
} = {
  undo: { all: [{ keys: "Mod+Z", repeat: true }] },
  redo: {
    all: [{ keys: "Mod+Shift+Z", repeat: true }],
    other: [{ keys: "Control+Y", repeat: true }],
  },
  delete: { all: [{ keys: "Delete" }, { keys: "Backspace" }] },
  "select-all": { all: [{ keys: "Mod+A" }] },
  "zoom-in": {
    all: [
      { keys: "+", repeat: true },
      { keys: "=", repeat: true },
    ],
  },
  "zoom-out": { all: [{ keys: "-", repeat: true }] },
  "zoom-reset": { all: [{ keys: "0" }] },
  cancel: { all: [{ keys: "Escape" }] },
  "play-pause": { all: [{ keys: "Space" }] },
};
