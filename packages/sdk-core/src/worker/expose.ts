import { SdkError } from "../errors/sdk-error.js";
import { serializeError } from "../errors/serialize.js";
import {
  type CallMessage,
  type CrashMessage,
  type ErrorMessage,
  envelope,
  PROTOCOL_VERSION,
  type ProgressMessage,
  type ReadyMessage,
  type ResultMessage,
  readMessage,
  type WorkerMessage,
} from "./protocol.js";
import { postWithFallback, prepareMessage } from "./transfer.js";
import type { WorkerContract, WorkerHandlers } from "./types.js";

/**
 * The parts of a dedicated worker's global scope that {@link exposeWorker}
 * uses. `self` in a dedicated worker satisfies it.
 *
 * @public
 */
export interface WorkerScope {
  /** Posts a message to the page. */
  postMessage(message: unknown, transfer: Transferable[]): void;
  /** Listens for messages and global errors. */
  addEventListener(type: string, listener: (event: Event) => void): void;
}

/**
 * Options for {@link exposeWorker}.
 *
 * @public
 */
export interface ExposeWorkerOptions {
  /**
   * Include stack traces in errors sent to the page. Defaults to `false`;
   * enable it only in development builds.
   */
  readonly includeStack?: boolean;
  /** The worker's global scope. Defaults to `globalThis`. */
  readonly scope?: WorkerScope;
}

/**
 * Serves a worker contract's methods to the page, to be used with
 * {@link createWorkerClient} (ADR 0011, ADR 0018).
 *
 * Call it first thing in the worker module, before any heavy
 * initialisation. It announces the worker immediately, and the client's
 * `startTimeout` measures the time until then, not compilation. Load
 * WebAssembly lazily, inside a handler or on first use.
 *
 * - Errors thrown or rejected by a handler are sent to the page with
 *   `serializeError`, so `SdkError` codes survive.
 * - Only methods that are own properties of `handlers` can be called. Any
 *   other name, including `constructor`, fails with `WORKER_METHOD_NOT_FOUND`.
 * - A result that can't be cloned fails the call with an error, instead of
 *   leaving it pending.
 * - Errors that escape every handler, such as an uncaught error in a timer
 *   or an unhandled rejection, are reported to the page as a crash. The page
 *   then replaces the worker.
 *
 * @example
 * ```ts
 * // pdf.worker.ts
 * exposeWorker<PdfWorker>({
 *   async render({ bytes, page }, { signal, progress }) {
 *     const engine = await loadEngine(); // WebAssembly loads here, not at start
 *     return engine.render(bytes, page, { signal, onProgress: progress });
 *   },
 * });
 * ```
 *
 * @typeParam Contract - The worker contract.
 * @param handlers - One function per method of the contract.
 * @param options - Stack traces, and the scope for tests.
 * @public
 */
export function exposeWorker<Contract extends WorkerContract<Contract>>(
  handlers: WorkerHandlers<Contract>,
  options: ExposeWorkerOptions = {},
): void {
  const scope = options.scope ?? (globalThis as unknown as WorkerScope);
  const includeStack = options.includeStack ?? false;
  const running = new Map<number, AbortController>();

  const send = (message: WorkerMessage, transferables: Transferable[] = []): void => {
    scope.postMessage(message, transferables);
  };

  const sendError = (id: number, error: unknown): void => {
    send(
      envelope<ErrorMessage>({ type: "error", id, error: serializeError(error, { includeStack }) }),
    );
  };

  const sendResult = (id: number, output: unknown): void => {
    const prepared = prepareMessage(output, true);
    try {
      postWithFallback(
        (message, transfer) => scope.postMessage(message, transfer),
        envelope<ResultMessage>({ type: "result", id, output: prepared.value }),
        prepared.transferables,
      );
    } catch (error) {
      sendError(id, error);
    }
  };

  const run = (message: CallMessage): void => {
    const { id, method } = message;
    const handler = Object.hasOwn(handlers, method)
      ? (handlers as Record<string, unknown>)[method]
      : undefined;
    if (typeof handler !== "function") {
      sendError(
        id,
        new SdkError("WORKER_METHOD_NOT_FOUND", `The worker has no method "${method}".`, {
          details: { method },
        }),
      );
      return;
    }

    const controller = new AbortController();
    running.set(id, controller);
    const context = {
      signal: controller.signal,
      progress: (value: unknown) => {
        if (running.get(id) === controller) {
          send(envelope<ProgressMessage>({ type: "progress", id, value }));
        }
      },
    };

    Promise.resolve()
      .then(() => handler.call(handlers, message.input, context))
      .then(
        (output: unknown) => {
          running.delete(id);
          sendResult(id, output);
        },
        (error: unknown) => {
          running.delete(id);
          sendError(id, error);
        },
      );
  };

  const crash = (error: unknown): void => {
    send(envelope<CrashMessage>({ type: "crash", error: serializeError(error, { includeStack }) }));
  };

  scope.addEventListener("message", (event) => {
    const message = readMessage((event as MessageEvent).data);
    if (message === undefined || message.version !== PROTOCOL_VERSION) {
      return;
    }
    if (message.type === "call") {
      run(message);
    } else if (message.type === "cancel") {
      running.get(message.id)?.abort();
    }
  });
  scope.addEventListener("error", (event) => {
    const errorEvent = event as ErrorEvent;
    crash(errorEvent.error ?? new Error(errorEvent.message));
  });
  scope.addEventListener("unhandledrejection", (event) => {
    crash((event as PromiseRejectionEvent).reason);
  });

  send(envelope<ReadyMessage>({ type: "ready" }));
}
