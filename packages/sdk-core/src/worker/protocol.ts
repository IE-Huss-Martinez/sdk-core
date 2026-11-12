import type { SerializedError } from "../errors/serialize.js";

/** Marks messages that belong to this protocol (ADR 0018). */
export const PROTOCOL = "hm-rpc";

/**
 * The protocol version. Any change to the messages below that an older peer
 * can't handle increments it, and a page and worker with different versions
 * refuse to talk.
 */
export const PROTOCOL_VERSION = 1;

interface Envelope {
  readonly protocol: typeof PROTOCOL;
  readonly version: number;
}

/** Worker to page: posted as soon as `exposeWorker` runs. */
export interface ReadyMessage extends Envelope {
  readonly type: "ready";
  /**
   * The version of the package the worker was built from, when
   * `exposeWorker` was given one. Optional, so it needs no new protocol
   * version: older clients ignore it.
   */
  readonly packageVersion?: string;
}

/** Page to worker: run a method. */
export interface CallMessage extends Envelope {
  readonly type: "call";
  readonly id: number;
  readonly method: string;
  readonly input: unknown;
}

/** Page to worker: abort a call's signal. */
export interface CancelMessage extends Envelope {
  readonly type: "cancel";
  readonly id: number;
}

/** Worker to page: progress of a call. */
export interface ProgressMessage extends Envelope {
  readonly type: "progress";
  readonly id: number;
  readonly value: unknown;
}

/** Worker to page: a call succeeded. */
export interface ResultMessage extends Envelope {
  readonly type: "result";
  readonly id: number;
  readonly output: unknown;
}

/** Worker to page: a call failed. */
export interface ErrorMessage extends Envelope {
  readonly type: "error";
  readonly id: number;
  readonly error: SerializedError;
}

/** Worker to page: an error escaped every handler; the worker is unusable. */
export interface CrashMessage extends Envelope {
  readonly type: "crash";
  readonly error: SerializedError;
}

export type PageMessage = CallMessage | CancelMessage;
export type WorkerMessage =
  | ReadyMessage
  | ProgressMessage
  | ResultMessage
  | ErrorMessage
  | CrashMessage;

/**
 * Adds the envelope to a message body.
 *
 * @param body - The message without `protocol` and `version`.
 */
export function envelope<M extends PageMessage | WorkerMessage>(
  body: Omit<M, "protocol" | "version">,
): M {
  return { protocol: PROTOCOL, version: PROTOCOL_VERSION, ...body } as M;
}

/**
 * Reads a message from the other side, or returns `undefined` for anything
 * that isn't this protocol's, such as an SDK's own messages on the same
 * worker. The `version` is checked by the caller, because a mismatch must be
 * reported rather than ignored.
 *
 * @param data - `MessageEvent.data`.
 */
export function readMessage(data: unknown): (PageMessage | WorkerMessage) | undefined {
  if (typeof data !== "object" || data === null) {
    return undefined;
  }
  const message = data as Partial<Record<string, unknown>>;
  if (message["protocol"] !== PROTOCOL || typeof message["version"] !== "number") {
    return undefined;
  }
  const hasId = Number.isSafeInteger(message["id"]);
  switch (message["type"]) {
    case "ready":
      return message as unknown as ReadyMessage;
    case "call":
      return hasId && typeof message["method"] === "string"
        ? (message as unknown as CallMessage)
        : undefined;
    case "cancel":
    case "progress":
    case "result":
      return hasId
        ? (message as unknown as CancelMessage | ProgressMessage | ResultMessage)
        : undefined;
    case "error":
      return hasId ? (message as unknown as ErrorMessage) : undefined;
    case "crash":
      return message as unknown as CrashMessage;
    default:
      return undefined;
  }
}
