// Allowed (ADR 0017): core/errors may import sdk-core and core/model.
import type { SdkErrorOptions } from "@hussmartinez/sdk-core";
import type { Page } from "../model/page.js";
// Violates layer-errors.
import type { SessionEvent } from "../session/events.js";

export interface PageError {
  readonly page: Page;
  readonly event?: SessionEvent;
  readonly options?: SdkErrorOptions;
}
