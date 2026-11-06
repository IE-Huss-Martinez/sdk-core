/**
 * Prepares a value for `postMessage` (ADR 0018).
 *
 * Structured cloning a typed array copies its whole underlying buffer, and
 * transferring it moves the whole buffer. That's wrong for views into a
 * larger buffer, such as a WebAssembly heap. So, walking plain objects,
 * arrays, maps and sets:
 *
 * - a view that covers its entire, ordinary `ArrayBuffer` keeps its buffer,
 *   which is listed for transfer when `transfer` is set;
 * - any other view, a partial one or one over a `SharedArrayBuffer`, is
 *   replaced with a copy of just its bytes;
 * - other transferable objects, such as `ArrayBuffer`, `ImageBitmap` and
 *   `MessagePort`, are listed for transfer when `transfer` is set.
 *
 * Containers are copied only along paths where something was replaced, so
 * the caller's value is never mutated. Class instances aren't walked.
 *
 * A buffer that can't be detached, such as WebAssembly memory, can't be told
 * apart in advance. Posting then throws before anything is detached, and the
 * sender retries without transferring (see `postWithFallback`).
 *
 * @param value - The value to send.
 * @param transfer - Whether to collect transferable objects.
 * @returns The value to post, and the objects to transfer.
 */
export function prepareMessage(
  value: unknown,
  transfer: boolean,
): { value: unknown; transferables: Transferable[] } {
  const transferables = new Set<Transferable>();
  const seen = new Map<object, unknown>();

  const visit = (item: unknown): unknown => {
    if (typeof item !== "object" || item === null) {
      return item;
    }
    if (seen.has(item)) {
      return seen.get(item);
    }

    if (ArrayBuffer.isView(item)) {
      const prepared = isWholeOrdinaryBuffer(item) ? item : copyView(item);
      if (transfer && prepared === item) {
        transferables.add(item.buffer as ArrayBuffer);
      }
      seen.set(item, prepared);
      return prepared;
    }
    if (isTransferable(item)) {
      if (transfer) {
        transferables.add(item as Transferable);
      }
      seen.set(item, item);
      return item;
    }
    if (Array.isArray(item)) {
      return rebuild(
        item,
        () => [] as unknown[],
        (copy, source) => {
          source.forEach((entry, index) => {
            copy[index] = visit(entry);
          });
        },
      );
    }
    if (item instanceof Map) {
      return rebuild(
        item,
        () => new Map(),
        (copy, source) => {
          for (const [key, entry] of source) {
            copy.set(visit(key), visit(entry));
          }
        },
      );
    }
    if (item instanceof Set) {
      return rebuild(
        item,
        () => new Set(),
        (copy, source) => {
          for (const entry of source) {
            copy.add(visit(entry));
          }
        },
      );
    }
    if (isPlainObject(item)) {
      return rebuild(
        item,
        () => ({}) as Record<string, unknown>,
        (copy, source) => {
          for (const [key, entry] of Object.entries(source)) {
            copy[key] = visit(entry);
          }
        },
      );
    }
    seen.set(item, item);
    return item;
  };

  /**
   * Copies a container, then keeps the copy only if a child changed. The copy
   * is registered first, so cycles resolve to it.
   */
  const rebuild = <T extends object>(
    source: T,
    create: () => T,
    fill: (copy: T, source: T) => void,
  ): T => {
    const copy = create();
    seen.set(source, copy);
    fill(copy, source);
    if (sameEntries(source, copy)) {
      seen.set(source, source);
      return source;
    }
    return copy;
  };

  return { value: visit(value), transferables: [...transferables] };
}

/**
 * Posts a message, transferring what `prepareMessage` collected. If posting
 * throws, typically because a buffer can't be detached (WebAssembly memory),
 * it retries once without transferring. The transfer list is validated
 * before anything is serialized or detached, so the retry sends intact data.
 * Engines differ in the error they throw, so any error triggers the retry.
 *
 * @param post - Posts one message with a transfer list.
 * @param message - The message.
 * @param transferables - Objects to transfer.
 * @throws The error from the retry, if the message can't be cloned at all.
 */
export function postWithFallback(
  post: (message: unknown, transfer: Transferable[]) => void,
  message: unknown,
  transferables: Transferable[],
): void {
  if (transferables.length === 0) {
    post(message, []);
    return;
  }
  try {
    post(message, transferables);
  } catch {
    post(message, []);
  }
}

function isWholeOrdinaryBuffer(view: ArrayBufferView): boolean {
  return (
    view.buffer instanceof ArrayBuffer &&
    view.byteOffset === 0 &&
    view.byteLength === view.buffer.byteLength
  );
}

function copyView(view: ArrayBufferView): ArrayBufferView {
  const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength).slice();
  if (view instanceof DataView) {
    return new DataView(bytes.buffer);
  }
  const TypedArray = view.constructor as new (buffer: ArrayBuffer) => ArrayBufferView;
  return new TypedArray(bytes.buffer);
}

const TRANSFERABLE_CLASSES = [
  "ArrayBuffer",
  "MessagePort",
  "ImageBitmap",
  "OffscreenCanvas",
  "ReadableStream",
  "WritableStream",
  "TransformStream",
  "VideoFrame",
  "AudioData",
] as const;

function isTransferable(value: object): boolean {
  const scope = globalThis as Record<string, unknown>;
  return TRANSFERABLE_CLASSES.some((name) => {
    const transferableClass = scope[name];
    return typeof transferableClass === "function" && value instanceof transferableClass;
  });
}

function isPlainObject(value: object): value is Record<string, unknown> {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function sameEntries(source: object, copy: object): boolean {
  if (Array.isArray(source)) {
    const copied = copy as unknown[];
    return (
      source.length === copied.length && source.every((entry, index) => entry === copied[index])
    );
  }
  if (source instanceof Map) {
    const copied = [...(copy as Map<unknown, unknown>)];
    return [...source].every(
      ([key, entry], index) => copied[index]?.[0] === key && copied[index]?.[1] === entry,
    );
  }
  if (source instanceof Set) {
    const copied = [...(copy as Set<unknown>)];
    return [...source].every((entry, index) => copied[index] === entry);
  }
  const copied = copy as Record<string, unknown>;
  return Object.entries(source).every(([key, entry]) => copied[key] === entry);
}
