/**
 * The plural categories of `Intl.PluralRules`.
 *
 * @public
 */
export type PluralCategory = "zero" | "one" | "two" | "few" | "many" | "other";

/**
 * A message whose form depends on a number, as plain JSON: `$plural` names
 * the parameter that selects the form, and each plural category has its own
 * text. `other` is required. Translations may add forms that English
 * doesn't use, such as `few` and `many`.
 *
 * The `$` prefix keeps the selector apart from the category names, which are
 * fixed by `Intl.PluralRules`.
 *
 * @example
 * ```json
 * { "$plural": "count", "one": "{count} page", "other": "{count} pages" }
 * ```
 *
 * @public
 */
export type PluralMessage = {
  readonly $plural: string;
  readonly other: string;
} & { readonly [Category in Exclude<PluralCategory, "other">]?: string };

/**
 * One message: plain text with `{name}` or `{name, format}` placeholders, or
 * a {@link PluralMessage}. Formats are `number`, `fileSize`, `date` and
 * `time`. Braces are reserved for placeholders.
 *
 * @public
 */
export type MessageValue = string | PluralMessage;

/**
 * A message catalogue: message keys and their English text.
 *
 * @public
 */
export type MessageCatalogue = { readonly [key: string]: MessageValue };

/**
 * The placeholder formats and the values they accept.
 *
 * @public
 */
export interface MessageFormats {
  /** `{name}`: strings are inserted as they are, numbers are formatted. */
  readonly default: string | number;
  /** `{name, number}`: a number formatted for the locale. */
  readonly number: number;
  /** `{name, fileSize}`: a byte count in decimal units, such as "1.3 MB". */
  readonly fileSize: number;
  /**
   * `{name, duration}`: a duration in milliseconds, in hours, minutes and
   * seconds, such as "3 hr, 5 min".
   */
  readonly duration: number;
  /**
   * `{name, megapixels}`: a pixel count in millions, with up to one fraction
   * digit, such as "24.2" for 24 159 744. The message gives the unit, such as
   * `{actual, megapixels} megapixels`, so translators can word it.
   */
  readonly megapixels: number;
  /** `{name, date}`: a date, as a `Date` or a timestamp in milliseconds. */
  readonly date: Date | number;
  /** `{name, time}`: a time of day, as a `Date` or a timestamp in milliseconds. */
  readonly time: Date | number;
}

type Trim<S extends string> = S extends ` ${infer Rest}`
  ? Trim<Rest>
  : S extends `${infer Rest} `
    ? Trim<Rest>
    : S;

/** `[name, format]` for each placeholder in a template. */
type Placeholders<Template extends string> = string extends Template
  ? never
  : Template extends `${string}{${infer Body}}${infer Rest}`
    ? PlaceholderOf<Body> | Placeholders<Rest>
    : never;

type PlaceholderOf<Body extends string> = Body extends `${infer Name},${infer Format}`
  ? [Trim<Name>, Trim<Format>]
  : [Trim<Body>, "default"];

type ValueOf<Format> = Format extends keyof MessageFormats ? MessageFormats[Format] : never;

// Merge, TemplateParams, PluralForms and ParamNames are deliberately not
// exported. MessageParams and MessageOverrides cover what hosts need, and
// these helpers' shapes shouldn't be frozen under semver. They can't be
// @internal either: the public types reference them, so trimming them from
// the published declarations would break those types (sdk-core#66).

/** Merges a union of objects into one object type. */
type Merge<Union> = (Union extends unknown ? (value: Union) => void : never) extends (
  value: infer Intersection,
) => void
  ? { [Key in keyof Intersection]: Intersection[Key] }
  : never;

type TemplateParams<Template extends string> = Merge<
  Placeholders<Template> extends infer Placeholder
    ? Placeholder extends [infer Name extends string, infer Format]
      ? { readonly [Key in Name]: ValueOf<Format> }
      : never
    : never
>;

type PluralForms<Message extends PluralMessage> = Extract<
  Message[Exclude<keyof Message, "$plural">],
  string
>;

/**
 * The parameters a message takes, derived from its placeholders. A plural
 * message also takes its selector, as a number.
 *
 * @public
 */
export type MessageParams<Message extends MessageValue> = Message extends string
  ? TemplateParams<Message>
  : Message extends PluralMessage
    ? Merge<TemplateParams<PluralForms<Message>> | { readonly [Key in Message["$plural"]]: number }>
    : never;

// Not exported, like Merge above (sdk-core#66).
/** The placeholder names a message uses. */
type ParamNames<Message> = Message extends string
  ? Placeholders<Message>[0]
  : Message extends PluralMessage
    ? // A plural typed only as PluralMessage, not a literal, names no
      // particular selector: its placeholders are checked at runtime, as a
      // plain string's are.
        | Placeholders<PluralForms<Message>>[0]
        | (string extends Message["$plural"] ? never : Message["$plural"])
    : never;

/**
 * Host overrides for a catalogue: any subset of its keys, as strings or
 * plural objects, such as a translator's JSON file.
 *
 * @public
 */
export type MessageOverrides<Catalogue extends MessageCatalogue> = {
  readonly [Key in keyof Catalogue]?: MessageValue;
};

/**
 * Checks overrides written as literals: an unknown key, or a placeholder the
 * catalogue's message doesn't have, is a type error. Overrides typed as plain
 * `string`, such as loaded JSON, are checked at runtime instead.
 *
 * @public
 */
export type CheckedOverrides<
  Catalogue extends MessageCatalogue,
  Overrides,
> = string extends keyof Overrides
  ? Overrides
  : {
      readonly [Key in keyof Overrides]: Key extends keyof Catalogue
        ? Exclude<ParamNames<Overrides[Key]>, ParamNames<Catalogue[Key]>> extends never
          ? Overrides[Key]
          : `Unknown placeholder: ${Extract<Exclude<ParamNames<Overrides[Key]>, ParamNames<Catalogue[Key]>>, string>}`
        : never;
    };

/**
 * The arguments of {@link Messages.t} for a message: the parameters, or
 * nothing for a message without placeholders.
 *
 * @public
 */
export type MessageArgs<Message extends MessageValue> = keyof MessageParams<Message> extends never
  ? []
  : [params: MessageParams<Message>];
