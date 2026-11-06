// Violates layer-model.
import type { SessionEvent } from "../session/events.js";

export interface Page {
  readonly lastEvent?: SessionEvent;
}
