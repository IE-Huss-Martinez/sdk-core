/**
 * Headless runtime shared by the `@hussmartinez` SDK family.
 *
 * @packageDocumentation
 */

export type {
  ErrorDetails,
  ErrorDetailValue,
  SdkCoreErrorCode,
  SdkErrorClass,
  SdkErrorOptions,
} from "./errors/sdk-error.js";
export { isSdkError, SdkError } from "./errors/sdk-error.js";
export type {
  DeserializeErrorOptions,
  SerializedError,
  SerializeErrorOptions,
} from "./errors/serialize.js";
export { deserializeError, serializeError } from "./errors/serialize.js";
export type {
  WorkerCallOptions,
  WorkerClient,
  WorkerClientOptions,
  WorkerLike,
} from "./worker/client.js";
export { createWorkerClient } from "./worker/client.js";
export type { ExposeWorkerOptions, WorkerScope } from "./worker/expose.js";
export { exposeWorker } from "./worker/expose.js";
export type {
  WorkerCallContext,
  WorkerContract,
  WorkerHandlers,
  WorkerMethod,
  WorkerMethodName,
  WorkerProgress,
} from "./worker/types.js";
