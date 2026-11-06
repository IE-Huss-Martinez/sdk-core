/**
 * One worker method in a {@link WorkerContract}: the types of its input, its
 * output and, optionally, its progress updates. All of them must be
 * structured-cloneable data, with no functions.
 *
 * @public
 */
export interface WorkerMethod {
  /** What the page sends. */
  readonly input: unknown;
  /** What the worker returns. */
  readonly output: unknown;
  /** What the worker reports while working. Omit it for methods without progress. */
  readonly progress?: unknown;
}

/**
 * Describes a worker's methods, shared by the page and the worker so both
 * sides are type-checked against the same contract (ADR 0011).
 *
 * @example
 * ```ts
 * interface PdfWorker {
 *   render: { input: { bytes: ArrayBuffer; page: number }; output: ImageBitmap; progress: number };
 *   close: { input: undefined; output: undefined };
 * }
 * ```
 *
 * @typeParam Contract - The interface being checked. Each property describes one method.
 * @public
 */
export type WorkerContract<Contract> = { readonly [Method in keyof Contract]: WorkerMethod };

/**
 * The method names of a contract.
 *
 * @public
 */
export type WorkerMethodName<Contract> = keyof Contract & string;

/**
 * The progress type of a method, or `never` when it reports none.
 *
 * @public
 */
export type WorkerProgress<Method> = Method extends { readonly progress: infer Progress }
  ? Progress
  : never;

/**
 * What a handler receives besides its input.
 *
 * @typeParam Progress - The method's progress type.
 * @public
 */
export interface WorkerCallContext<Progress> {
  /**
   * Aborted when the page cancels the call. Handlers should stop promptly. A
   * call that doesn't settle within the client's `cancelTimeout` gets the
   * whole worker terminated.
   */
  readonly signal: AbortSignal;
  /**
   * Sends a progress update to the page. It's copied, never transferred.
   * Updates after the call has settled are dropped.
   */
  progress(value: Progress): void;
}

/**
 * The implementation of every method in a contract.
 *
 * Results are transferred to the page, not copied (ADR 0018). A handler must
 * return buffers it no longer needs, never ones it keeps, such as a cache.
 * Views into a larger buffer, such as WebAssembly memory, are copied safely.
 *
 * @typeParam Contract - The worker contract.
 * @public
 */
export type WorkerHandlers<Contract extends WorkerContract<Contract>> = {
  readonly [Method in WorkerMethodName<Contract>]: (
    input: Contract[Method]["input"],
    context: WorkerCallContext<WorkerProgress<Contract[Method]>>,
  ) => Contract[Method]["output"] | Promise<Contract[Method]["output"]>;
};
