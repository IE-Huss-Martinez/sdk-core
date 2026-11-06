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
export { sdkCoreMessages } from "./messages/core-messages.js";
export type { CreateMessagesOptions, Messages } from "./messages/messages.js";
export { createMessages, defineMessages, plural } from "./messages/messages.js";
export type {
  CheckedOverrides,
  MessageArgs,
  MessageCatalogue,
  MessageFormats,
  MessageOverrides,
  MessageParams,
  MessageValue,
  PluralCategory,
  PluralMessage,
} from "./messages/types.js";
export type { DecodedSizeBudget, WithProcessingTimeOptions } from "./policy/checks.js";
export {
  checkFile,
  checkFiles,
  createDecodedSizeBudget,
  withProcessingTime,
} from "./policy/checks.js";
export type {
  CoreLimits,
  DefineLimitsOptions,
  FilePolicy,
  FilePolicyOverrides,
  LimitCheck,
  LimitDefinition,
  LimitDefinitions,
  LimitSetting,
  Limits,
  LimitUnit,
  ResolvedLimit,
} from "./policy/limits.js";
export { coreLimits, defineLimits } from "./policy/limits.js";
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
