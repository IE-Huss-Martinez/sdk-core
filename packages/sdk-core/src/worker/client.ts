import {
  type ErrorDetails,
  isSdkError,
  type SdkCoreErrorCode,
  SdkError,
} from "../errors/sdk-error.js";
import { type DeserializeErrorOptions, deserializeError } from "../errors/serialize.js";
import {
  type CallMessage,
  type CancelMessage,
  envelope,
  PROTOCOL_VERSION,
  readMessage,
} from "./protocol.js";
import { postWithFallback, prepareMessage } from "./transfer.js";
import type { WorkerContract, WorkerMethodName, WorkerProgress } from "./types.js";

/**
 * The parts of a `Worker` that {@link createWorkerClient} uses.
 *
 * @public
 */
export interface WorkerLike {
  /** Sends a message to the worker. */
  postMessage(message: unknown, transfer: Transferable[]): void;
  /** Stops the worker immediately. */
  terminate(): void;
  /** Listens for `message`, `messageerror` and `error` events. */
  addEventListener(type: string, listener: (event: Event) => void): void;
  /** Removes a listener added with `addEventListener`. */
  removeEventListener(type: string, listener: (event: Event) => void): void;
}

/**
 * Options for {@link createWorkerClient}.
 *
 * @public
 */
export interface WorkerClientOptions {
  /**
   * Creates the worker. It's called lazily, on the first call or on
   * {@link WorkerClient.start}, and again after the worker has been
   * terminated. Whether the worker script is inlined or self-hosted is up to
   * this function (ADR 0011).
   */
  readonly createWorker: () => WorkerLike;
  /** SdkError subclasses to rebuild from worker errors, keyed by name. */
  readonly errorClasses?: DeserializeErrorOptions["errorClasses"];
  /**
   * Milliseconds to wait for the worker to announce itself before failing
   * with `WORKER_START_FAILED`. Defaults to 10 000. This measures startup,
   * so {@link exposeWorker} must run before any heavy initialisation.
   */
  readonly startTimeout?: number;
  /**
   * Milliseconds a cancelled call may keep running in the worker before the
   * worker is terminated and replaced. Defaults to 1 000.
   */
  readonly cancelTimeout?: number;
  /**
   * Milliseconds without calls after which the worker is terminated. It's
   * recreated on the next call. Defaults to 30 000; `0` keeps it forever.
   */
  readonly idleTimeout?: number;
  /**
   * Called once for each failure of the worker itself: `WORKER_CRASHED`,
   * `WORKER_START_FAILED` or `WORKER_PROTOCOL_MISMATCH`. It receives the same
   * error that pending calls reject with, and it's called even when no call
   * is pending, which is otherwise the only way to learn about such a
   * failure. SDKs should forward it to their host's `onEvent` or error
   * reporting. It isn't called for expected shutdowns: the idle timeout,
   * `destroy()`, or a worker terminated because a cancelled call didn't stop.
   * Errors it throws are reported asynchronously and don't affect the client.
   */
  readonly onCrash?: (error: SdkError<SdkCoreErrorCode>) => void;
  /**
   * The version of the package the page was built from. When it's set, the
   * worker must announce the same one, through `exposeWorker`'s
   * `packageVersion`, or it's refused with `WORKER_START_FAILED` and `details`
   * of `{ asset, expected, actual }`. `actual` is `null` for a worker that
   * announces none. This catches a self-hosted worker left over from another
   * version of the SDK, which speaks the same protocol but runs other code
   * (ADR 0038).
   */
  readonly packageVersion?: string;
  /**
   * Where the worker comes from, such as its self-hosted URL, for the
   * `asset` detail of a version mismatch. Defaults to `null`.
   */
  readonly workerAsset?: string;
}

/**
 * Options for one {@link WorkerClient.call}.
 *
 * @typeParam Progress - The method's progress type.
 * @public
 */
export interface WorkerCallOptions<Progress> {
  /**
   * Cancels the call. The returned promise rejects at once. When the signal's
   * reason is an `SdkError`, such as the file policy's
   * `PROCESSING_TIME_EXCEEDED`, the call rejects with that error unchanged.
   * Otherwise it rejects with an `SdkError` whose code is `ABORTED`, or
   * `TIMEOUT` when the reason is a `TimeoutError` (from
   * `AbortSignal.timeout()`), with the reason as its `cause`. It's not an
   * `AbortError`, so `error.name === "AbortError"` checks don't match.
   */
  readonly signal?: AbortSignal;
  /** Receives the worker's progress updates. */
  readonly onProgress?: (value: Progress) => void;
  /**
   * Transfer the input's buffers instead of copying them. Transferring a view
   * that covers its whole buffer detaches that whole buffer, so the caller
   * can't use it afterwards. Views into part of a buffer are always copied.
   * Defaults to `false`.
   */
  readonly transfer?: boolean;
}

/**
 * A typed client for a worker that serves a contract with
 * {@link exposeWorker}.
 *
 * @typeParam Contract - The worker contract.
 * @public
 */
export interface WorkerClient<Contract extends WorkerContract<Contract>> {
  /**
   * Calls a worker method. Starts the worker if needed.
   *
   * @param method - The method name.
   * @param input - The method's input.
   * @param options - Cancellation, progress and transfer.
   * @returns The method's output, transferred from the worker. Rejects with
   *   the worker's error, rebuilt with `deserializeError`, or with one of
   *   sdk-core's codes: `ABORTED`, `TIMEOUT`, `WORKER_START_FAILED`,
   *   `WORKER_PROTOCOL_MISMATCH`, `WORKER_CRASHED`, `WORKER_TERMINATED`,
   *   `WORKER_METHOD_NOT_FOUND` or `WORKER_DATA_NOT_CLONEABLE`.
   */
  call<Method extends WorkerMethodName<Contract>>(
    method: Method,
    input: Contract[Method]["input"],
    options?: WorkerCallOptions<WorkerProgress<Contract[Method]>>,
  ): Promise<Contract[Method]["output"]>;
  /**
   * Starts the worker ahead of the first call. Resolves once the worker has
   * announced itself, and rejects with `WORKER_START_FAILED` or
   * `WORKER_PROTOCOL_MISMATCH`.
   */
  start(): Promise<void>;
  /**
   * Terminates the worker. Calls in flight reject with `WORKER_TERMINATED`,
   * and so does every later call.
   */
  destroy(): void;
}

const DEFAULT_START_TIMEOUT = 10_000;
const DEFAULT_CANCEL_TIMEOUT = 1_000;
const DEFAULT_IDLE_TIMEOUT = 30_000;

/** Failures of the worker itself, reported through `onCrash`. */
const CRASH_CODES: ReadonlySet<SdkCoreErrorCode> = new Set([
  "WORKER_CRASHED",
  "WORKER_START_FAILED",
  "WORKER_PROTOCOL_MISMATCH",
]);

interface PendingCall {
  readonly resolve: (output: unknown) => void;
  readonly reject: (error: unknown) => void;
  readonly onProgress: ((value: unknown) => void) | undefined;
  readonly cleanup: () => void;
}

/** One worker instance and everything that belongs to it. */
interface Connection {
  readonly worker: WorkerLike;
  readonly ready: Promise<void>;
  readonly pending: Map<number, PendingCall>;
  /** Cancelled calls the worker hasn't settled yet, with their deadline timers. */
  readonly cancelling: Map<number, ReturnType<typeof setTimeout>>;
  closed: boolean;
  close: (code: SdkCoreErrorCode, message: string, cause?: unknown, details?: ErrorDetails) => void;
}

/**
 * Creates a typed, versioned client for a worker that serves a contract with
 * {@link exposeWorker} (ADR 0011, ADR 0018).
 *
 * The worker starts lazily, is terminated after `idleTimeout` without calls,
 * and is recreated on demand. Inputs are copied unless a call passes
 * `transfer: true`; results are transferred. Creating a client touches no
 * browser API, so it's safe during server rendering.
 *
 * @example
 * ```ts
 * const client = createWorkerClient<PdfWorker>({
 *   createWorker: () => new Worker(new URL("./pdf.worker.js", import.meta.url), { type: "module" }),
 *   errorClasses: { PdfError },
 * });
 *
 * const bitmap = await client.call("render", { bytes, page: 1 }, { signal, onProgress });
 * ```
 *
 * @typeParam Contract - The worker contract.
 * @param options - The worker factory, error classes and timeouts.
 * @public
 */
export function createWorkerClient<Contract extends WorkerContract<Contract>>(
  options: WorkerClientOptions,
): WorkerClient<Contract> {
  const startTimeout = timeoutOption("startTimeout", options.startTimeout, DEFAULT_START_TIMEOUT);
  const cancelTimeout = timeoutOption(
    "cancelTimeout",
    options.cancelTimeout,
    DEFAULT_CANCEL_TIMEOUT,
  );
  const idleTimeout = timeoutOption("idleTimeout", options.idleTimeout, DEFAULT_IDLE_TIMEOUT);
  const errorClasses = options.errorClasses ?? {};
  const { onCrash } = options;
  const notifyCrash = (error: SdkError<SdkCoreErrorCode>): void => {
    if (onCrash && CRASH_CODES.has(error.code)) {
      reportSafely(onCrash, error);
    }
  };

  let connection: Connection | undefined;
  let destroyed = false;
  let nextId = 1;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;

  const clearIdle = (): void => {
    if (idleTimer !== undefined) {
      clearTimeout(idleTimer);
      idleTimer = undefined;
    }
  };

  const scheduleIdle = (current: Connection): void => {
    clearIdle();
    if (
      idleTimeout === 0 ||
      current.closed ||
      current.pending.size > 0 ||
      current.cancelling.size > 0
    ) {
      return;
    }
    idleTimer = setTimeout(() => {
      idleTimer = undefined;
      current.close("WORKER_TERMINATED", "The worker was idle and has been stopped.");
    }, idleTimeout);
  };

  const connect = (): Connection => {
    if (connection && !connection.closed) {
      return connection;
    }

    let worker: WorkerLike;
    try {
      worker = options.createWorker();
    } catch (cause) {
      const error = new SdkError<SdkCoreErrorCode>(
        "WORKER_START_FAILED",
        "The worker couldn't be created.",
        {
          cause,
        },
      );
      notifyCrash(error);
      throw error;
    }

    let markReady!: () => void;
    let failReady!: (error: unknown) => void;
    const ready = new Promise<void>((resolve, reject) => {
      markReady = resolve;
      failReady = reject;
    });
    ready.catch(() => undefined);

    let isReady = false;
    /** Whether the announced package version is the expected one; closes the connection if not. */
    const versionMatches = (announced: unknown): boolean => {
      const expected = options.packageVersion;
      if (expected === undefined || announced === expected) {
        return true;
      }
      const actual = typeof announced === "string" ? announced : null;
      current.close(
        "WORKER_START_FAILED",
        `The worker was built from version ${actual ?? "(none)"} of the package, but the page expects ${expected}. A self-hosted worker must be copied again after every upgrade.`,
        undefined,
        { asset: options.workerAsset ?? null, expected, actual },
      );
      return false;
    };
    const startTimer = setTimeout(() => {
      current.close("WORKER_START_FAILED", `The worker didn't start within ${startTimeout} ms.`);
    }, startTimeout);

    const onMessage = (event: Event): void => {
      const message = readMessage((event as MessageEvent).data);
      if (message === undefined) {
        return;
      }
      if (message.version !== PROTOCOL_VERSION) {
        current.close(
          "WORKER_PROTOCOL_MISMATCH",
          `The worker speaks protocol version ${message.version}, but the page expects ${PROTOCOL_VERSION}.`,
        );
        return;
      }
      switch (message.type) {
        case "ready":
          if (!isReady && !versionMatches(message.packageVersion)) {
            return;
          }
          if (!isReady) {
            isReady = true;
            clearTimeout(startTimer);
            markReady();
            scheduleIdle(current);
          }
          return;
        case "crash":
          current.close(
            "WORKER_CRASHED",
            "An error escaped the worker's handlers.",
            deserializeError(message.error, { errorClasses }),
          );
          return;
        case "progress":
          current.pending.get(message.id)?.onProgress?.(message.value);
          return;
        case "result":
        case "error":
          settleFromWorker(current, message.id, message.type === "result", message);
          return;
        default:
          return;
      }
    };

    const onError = (event: Event): void => {
      event.preventDefault();
      const errorEvent = event as Partial<ErrorEvent>;
      const cause =
        errorEvent.error ?? (errorEvent.message ? new Error(errorEvent.message) : undefined);
      if (isReady) {
        current.close("WORKER_CRASHED", "The worker raised an uncaught error.", cause);
      } else {
        current.close("WORKER_START_FAILED", "The worker failed to load.", cause);
      }
    };

    const onMessageError = (): void => {
      current.close("WORKER_CRASHED", "A message from the worker couldn't be read.");
    };

    const current: Connection = {
      worker,
      ready,
      pending: new Map(),
      cancelling: new Map(),
      closed: false,
      close(code, message, cause, details) {
        if (current.closed) {
          return;
        }
        current.closed = true;
        clearTimeout(startTimer);
        worker.removeEventListener("message", onMessage);
        worker.removeEventListener("error", onError);
        worker.removeEventListener("messageerror", onMessageError);
        worker.terminate();
        for (const timer of current.cancelling.values()) {
          clearTimeout(timer);
        }
        current.cancelling.clear();
        const error = new SdkError(code, message, {
          ...(cause === undefined ? {} : { cause }),
          ...(details === undefined ? {} : { details }),
        });
        failReady(error);
        notifyCrash(error);
        for (const call of [...current.pending.values()]) {
          call.cleanup();
          call.reject(error);
        }
        current.pending.clear();
        if (connection === current) {
          connection = undefined;
          clearIdle();
        }
      },
    };

    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError);
    worker.addEventListener("messageerror", onMessageError);
    connection = current;
    return current;
  };

  const settleFromWorker = (
    current: Connection,
    id: number,
    succeeded: boolean,
    message: { readonly output?: unknown; readonly error?: unknown },
  ): void => {
    const timer = current.cancelling.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      current.cancelling.delete(id);
    }
    const call = current.pending.get(id);
    if (call) {
      current.pending.delete(id);
      call.cleanup();
      if (succeeded) {
        call.resolve(message.output);
      } else {
        call.reject(deserializeError(message.error, { errorClasses }));
      }
    }
    scheduleIdle(current);
  };

  const call = (
    method: string,
    input: unknown,
    callOptions: WorkerCallOptions<unknown> = {},
  ): Promise<unknown> => {
    const { signal, onProgress, transfer = false } = callOptions;
    if (destroyed) {
      return Promise.reject(new SdkError("WORKER_TERMINATED", "The worker client was destroyed."));
    }
    if (signal?.aborted) {
      return Promise.reject(abortError(signal.reason));
    }

    clearIdle();
    let current: Connection;
    try {
      current = connect();
    } catch (error) {
      return Promise.reject(error);
    }
    const id = nextId++;

    return new Promise<unknown>((resolve, reject) => {
      let sent = false;
      const onAbort = (): void => {
        if (!current.pending.delete(id)) {
          return;
        }
        cleanup();
        reject(abortError(signal?.reason));
        if (!sent || current.closed) {
          scheduleIdle(current);
          return;
        }
        current.worker.postMessage(envelope<CancelMessage>({ type: "cancel", id }), []);
        current.cancelling.set(
          id,
          setTimeout(() => {
            current.cancelling.delete(id);
            current.close(
              "WORKER_TERMINATED",
              `A cancelled call didn't stop within ${cancelTimeout} ms, so the worker was terminated.`,
            );
          }, cancelTimeout),
        );
      };
      const cleanup = (): void => {
        signal?.removeEventListener("abort", onAbort);
      };

      current.pending.set(id, {
        resolve,
        reject,
        onProgress: onProgress ? (value) => reportSafely(onProgress, value) : undefined,
        cleanup,
      });
      signal?.addEventListener("abort", onAbort, { once: true });

      current.ready.then(
        () => {
          if (!current.pending.has(id) || current.closed) {
            return;
          }
          const prepared = prepareMessage(input, transfer);
          try {
            postWithFallback(
              (message, transferList) => current.worker.postMessage(message, transferList),
              envelope<CallMessage>({ type: "call", id, method, input: prepared.value }),
              prepared.transferables,
            );
            sent = true;
          } catch (cause) {
            current.pending.delete(id);
            cleanup();
            reject(
              new SdkError(
                "WORKER_DATA_NOT_CLONEABLE",
                `The input for "${method}" can't be sent to the worker.`,
                { cause, details: { method } },
              ),
            );
            scheduleIdle(current);
          }
        },
        () => {
          // `close` has already rejected every pending call.
        },
      );
    });
  };

  return {
    call: call as WorkerClient<Contract>["call"],
    start() {
      if (destroyed) {
        return Promise.reject(
          new SdkError("WORKER_TERMINATED", "The worker client was destroyed."),
        );
      }
      try {
        return connect().ready;
      } catch (error) {
        return Promise.reject(error);
      }
    },
    destroy() {
      destroyed = true;
      clearIdle();
      connection?.close("WORKER_TERMINATED", "The worker client was destroyed.");
    },
  };
}

/**
 * @param reason - The signal's abort reason.
 * @returns The reason itself when it's an `SdkError` (ADR 0020), `TIMEOUT`
 *   for a `TimeoutError`, and `ABORTED` otherwise.
 */
function abortError(reason: unknown): SdkError {
  if (isSdkError(reason)) {
    return reason;
  }
  const isTimeout =
    typeof reason === "object" &&
    reason !== null &&
    (reason as { name?: unknown }).name === "TimeoutError";
  return isTimeout
    ? new SdkError("TIMEOUT", "The call timed out.", { cause: reason })
    : new SdkError("ABORTED", "The call was aborted.", { cause: reason });
}

/**
 * Calls a listener, such as `onProgress` or `onCrash`, without letting its
 * errors break the client. They're rethrown asynchronously, so they still
 * get reported.
 */
function reportSafely<Value>(listener: (value: Value) => void, value: Value): void {
  try {
    listener(value);
  } catch (error) {
    queueMicrotask(() => {
      throw error;
    });
  }
}

function timeoutOption(name: string, value: number | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(
      `${name} must be a non-negative number of milliseconds, received ${value}.`,
    );
  }
  return value;
}
