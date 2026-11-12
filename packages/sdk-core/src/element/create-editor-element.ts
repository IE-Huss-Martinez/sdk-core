import { SdkError } from "../errors/sdk-error.js";

/**
 * An attribute that sets a prop, with an optional parser for its value.
 *
 * @typeParam Props - The editor's props.
 * @public
 */
export interface EditorElementAttribute<Props> {
  /** The prop the attribute sets, which also gets a property of this name. */
  readonly property: keyof Props & string;
  /**
   * Turns the attribute's value into the prop's value, such as a
   * space-separated list into an array. Without it, the prop is the string.
   */
  readonly parse?: (value: string) => unknown;
}

/**
 * What {@link EditorElementDefinition.mount} receives besides the props.
 *
 * @typeParam Events - The names of the element's events.
 * @public
 */
export interface EditorElementContext<Events extends string> {
  /**
   * Fires `hm-<kind>-editor-<name>` on the element. It bubbles, is composed
   * and isn't cancelable. Its `detail` must never contain file names or
   * contents (ADR 0012).
   *
   * @throws `TypeError` if `name` isn't one of the definition's events.
   */
  dispatch(name: Events, detail?: unknown): void;
}

/**
 * The editor that {@link EditorElementDefinition.mount} rendered.
 *
 * @typeParam Props - The editor's props.
 * @typeParam Methods - The element's methods.
 * @public
 */
export interface MountedEditor<Props, Methods> {
  /** Renders the editor again with every prop's current value. */
  update(props: Partial<Props>): void;
  /** Removes the editor and releases its session and workers. */
  unmount(): void;
  /** The methods the element forwards, such as a React ref's handle. */
  readonly handle: Methods;
}

/**
 * Options for {@link createEditorElement}.
 *
 * @typeParam Props - The editor's props.
 * @typeParam Methods - The element's methods.
 * @typeParam Events - The names of the element's events.
 * @public
 */
export interface EditorElementDefinition<Props, Methods, Events extends string> {
  /**
   * The SDK's kind, such as `pdf`, in lowercase letters, digits and hyphens.
   * It names the default tag, `hm-<kind>-editor`, and the events,
   * `hm-<kind>-editor-<event>`.
   */
  readonly kind: string;
  /**
   * Observed attributes, for plain strings, keyed by attribute name. Each
   * sets the prop it names, and a removed attribute sets it to `undefined`.
   */
  readonly attributes?: Readonly<
    Record<string, (keyof Props & string) | EditorElementAttribute<Props>>
  >;
  /** Props that only have a property, such as files, objects and functions. */
  readonly properties?: readonly (keyof Props & string)[];
  /** Methods forwarded to {@link MountedEditor.handle}. */
  readonly methods?: readonly (keyof Methods & string)[];
  /** The names of the events `dispatch` may fire. */
  readonly events?: readonly Events[];
  /**
   * Renders the editor into the element, which is in the light DOM, and
   * replaces anything inside it. Called synchronously when the element is
   * connected.
   */
  mount(
    host: HTMLElement,
    props: Partial<Props>,
    context: EditorElementContext<Events>,
  ): MountedEditor<Props, Methods>;
}

/**
 * The class {@link EditorElementDefine} registers.
 *
 * @typeParam Props - The editor's props.
 * @typeParam Methods - The element's methods.
 * @public
 */
export type EditorElementClass<Props, Methods> = new () => HTMLElement & Partial<Props> & Methods;

/**
 * Registers an editor element under a tag name, `hm-<kind>-editor` by
 * default, and returns its class. Calling it again with the same name returns
 * the same class.
 *
 * @throws `TypeError` if another class already has the name;
 *   `SdkError` `UNSUPPORTED_ENVIRONMENT` where custom elements don't exist,
 *   as on a server; and the browser's `SyntaxError` for an invalid name.
 * @public
 */
export type EditorElementDefine<Props, Methods> = (
  tagName?: string,
) => EditorElementClass<Props, Methods>;

const NAME = /^[a-z][a-z0-9-]*$/;

/** Throws unless the definition's names are valid and distinct. */
function checkDefinition(definition: EditorElementDefinition<unknown, unknown, string>): void {
  if (!NAME.test(definition.kind)) {
    throw new TypeError(
      `The kind must be lowercase letters, digits and hyphens, such as "pdf", not ${JSON.stringify(definition.kind)}.`,
    );
  }
  const attributeNames = Object.keys(definition.attributes ?? {});
  for (const name of [...attributeNames, ...(definition.events ?? [])]) {
    if (!NAME.test(name)) {
      throw new TypeError(
        `Attribute and event names must be lowercase letters, digits and hyphens, not ${JSON.stringify(name)}.`,
      );
    }
  }
  const members = [
    ...Object.values(definition.attributes ?? {}).map((attribute) =>
      typeof attribute === "string" ? attribute : attribute.property,
    ),
    ...(definition.properties ?? []),
    ...(definition.methods ?? []),
  ];
  const repeated = members.find((name, index) => members.indexOf(name) !== index);
  if (repeated !== undefined) {
    throw new TypeError(`"${repeated}" is defined more than once.`);
  }
}

/**
 * Creates a custom element for an SDK's editor (ADR 0040). It renders into
 * the light DOM through the SDK's own `mount`, so `sdk-core` imports no
 * framework.
 *
 * Nothing happens until the returned `define` is called, so importing the
 * SDK's element entry and calling this are safe on a server.
 *
 * - Properties set before the element was upgraded are applied.
 * - Changes to attributes and properties cause one `update` per microtask.
 * - The editor mounts when the element is connected, and unmounts a
 *   microtask after it's disconnected, unless it was reconnected in the
 *   meantime, so moving the element keeps the editor.
 * - Methods throw an `InvalidStateError` `DOMException` while the element
 *   isn't connected.
 *
 * @example
 * ```ts
 * export const definePdfEditorElement = createEditorElement<PdfEditorProps, PdfEditorMethods>({
 *   kind: "pdf",
 *   attributes: { theme: "theme", locale: "locale" },
 *   properties: ["file", "filePolicy"],
 *   methods: ["undo", "redo"],
 *   events: ["change", "error"],
 *   mount: (host, props, { dispatch }) => mountPdfEditor(host, props, dispatch),
 * });
 * ```
 *
 * @param definition - The element's attributes, properties, methods, events
 *   and mount function.
 * @throws `TypeError` if a name is invalid or repeated.
 * @public
 */
export function createEditorElement<
  Props extends object,
  Methods extends object = Record<never, never>,
  Events extends string = string,
>(
  definition: EditorElementDefinition<Props, Methods, Events>,
): EditorElementDefine<Props, Methods> {
  checkDefinition(definition as EditorElementDefinition<unknown, unknown, string>);
  const { kind, mount } = definition;
  const attributes = new Map(
    Object.entries(definition.attributes ?? {}).map(([name, attribute]) => [
      name,
      typeof attribute === "string" ? { property: attribute } : attribute,
    ]),
  );
  const propertyNames = [
    ...[...attributes.values()].map((attribute) => attribute.property as string),
    ...(definition.properties ?? []),
  ];
  const methodNames = [...(definition.methods ?? [])] as string[];
  const events = new Set<string>(definition.events ?? []);
  const classes = new Map<string, EditorElementClass<Props, Methods>>();

  const build = (): CustomElementConstructor => {
    for (const name of [...propertyNames, ...methodNames]) {
      if (name in HTMLElement.prototype) {
        throw new TypeError(`"${name}" would replace HTMLElement's own "${name}".`);
      }
    }

    class EditorElement extends HTMLElement {
      static readonly observedAttributes = [...attributes.keys()];
      readonly #props: Record<string, unknown> = {};
      #editor: MountedEditor<Props, Methods> | undefined;
      #updateScheduled = false;
      #unmountScheduled = false;

      constructor() {
        super();
        // A property set before the definition loaded is an own property
        // that hides the setter below, so it's applied through the setter.
        for (const name of propertyNames) {
          if (Object.hasOwn(this, name)) {
            const value = (this as unknown as Record<string, unknown>)[name];
            delete (this as unknown as Record<string, unknown>)[name];
            this.#set(name, value);
          }
        }
      }

      connectedCallback(): void {
        this.#unmountScheduled = false;
        if (this.#editor) {
          return;
        }
        this.#editor = mount(this, { ...this.#props } as Partial<Props>, {
          dispatch: (name, detail) => {
            if (!events.has(name)) {
              throw new TypeError(`"${name}" isn't one of the ${kind} editor's events.`);
            }
            this.dispatchEvent(
              new CustomEvent(`hm-${kind}-editor-${name}`, {
                detail,
                bubbles: true,
                composed: true,
              }),
            );
          },
        });
      }

      disconnectedCallback(): void {
        this.#unmountScheduled = true;
        queueMicrotask(() => {
          if (!this.#unmountScheduled) {
            return;
          }
          this.#unmountScheduled = false;
          const editor = this.#editor;
          this.#editor = undefined;
          editor?.unmount();
        });
      }

      attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
        const attribute = attributes.get(name);
        if (attribute) {
          const parsed =
            value === null ? undefined : attribute.parse ? attribute.parse(value) : value;
          this.#set(attribute.property, parsed);
        }
      }

      static {
        // Inside the class body, so the accessors can reach private members
        // without adding public ones that an SDK's props could collide with.
        for (const name of propertyNames) {
          Object.defineProperty(EditorElement.prototype, name, {
            configurable: true,
            enumerable: true,
            get(this: EditorElement) {
              return this.#props[name];
            },
            set(this: EditorElement, value: unknown) {
              this.#set(name, value);
            },
          });
        }
        for (const name of methodNames) {
          Object.defineProperty(EditorElement.prototype, name, {
            configurable: true,
            writable: true,
            value(this: EditorElement, ...args: unknown[]) {
              return this.#call(name, args);
            },
          });
        }
      }

      #set(name: string, value: unknown): void {
        this.#props[name] = value;
        if (!this.#editor || this.#updateScheduled) {
          return;
        }
        this.#updateScheduled = true;
        queueMicrotask(() => {
          this.#updateScheduled = false;
          this.#editor?.update({ ...this.#props } as Partial<Props>);
        });
      }

      #call(name: string, args: unknown[]): unknown {
        if (!this.isConnected || !this.#editor) {
          throw new DOMException(
            `${name}() needs the ${kind} editor element to be connected to a document.`,
            "InvalidStateError",
          );
        }
        const method = (this.#editor.handle as Record<string, unknown>)[name];
        if (typeof method !== "function") {
          throw new TypeError(`The ${kind} editor's handle has no "${name}" method.`);
        }
        return method.apply(this.#editor.handle, args);
      }
    }

    return EditorElement;
  };

  return (tagName = `hm-${kind}-editor`) => {
    const existing = classes.get(tagName);
    if (existing) {
      return existing;
    }
    if (typeof customElements === "undefined" || typeof HTMLElement === "undefined") {
      throw new SdkError("UNSUPPORTED_ENVIRONMENT", "Custom elements aren't available here.", {
        details: { feature: "customElements" },
      });
    }
    if (customElements.get(tagName)) {
      throw new TypeError(`"${tagName}" is already registered by another class.`);
    }
    const element = build();
    customElements.define(tagName, element);
    const registered = element as unknown as EditorElementClass<Props, Methods>;
    classes.set(tagName, registered);
    return registered;
  };
}
