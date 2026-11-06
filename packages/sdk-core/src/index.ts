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
