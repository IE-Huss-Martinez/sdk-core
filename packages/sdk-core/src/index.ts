/**
 * Headless runtime shared by the `@hussmartinez` SDK family.
 *
 * @packageDocumentation
 */

export type { WindowReader, WindowReaderOptions } from "./bytes/window-reader.js";
export { createWindowReader } from "./bytes/window-reader.js";
export type { ErrorHelpers, ErrorHelpersOptions } from "./errors/helpers.js";
export { createErrorHelpers } from "./errors/helpers.js";
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
export type { History, HistoryStep } from "./session/history.js";
export { createHistory } from "./session/history.js";
export type { Applied, Reducer } from "./session/reducer.js";
export { applyCommands } from "./session/reducer.js";
export type { Store } from "./session/store.js";
export { createStore } from "./session/store.js";
export type { Modifier, Platform } from "./shortcuts/chord.js";
export type { FamilyAction, ShortcutChord } from "./shortcuts/family.js";
export { familyShortcuts } from "./shortcuts/family.js";
export type { NavigatorLike } from "./shortcuts/platform.js";
export { platformOf } from "./shortcuts/platform.js";
export type {
  KeyboardEventLike,
  ShortcutPart,
  ShortcutRegistry,
  ShortcutRegistryOptions,
  ShortcutSpec,
} from "./shortcuts/registry.js";
export { createShortcutRegistry } from "./shortcuts/registry.js";
export type { SequenceLocation } from "./timeline/sequence.js";
export { locate, sequenceOffsets, snap } from "./timeline/sequence.js";
export type { ToolRegistry, ToolRegistryOptions } from "./tools/registry.js";
export { createToolRegistry } from "./tools/registry.js";
export type { Tool, ToolDefinition } from "./tools/tool.js";
export { defineTool } from "./tools/tool.js";
export { resolveAssetsBase } from "./worker/assets-url.js";
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
