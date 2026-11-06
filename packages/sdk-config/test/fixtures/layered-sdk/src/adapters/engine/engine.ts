import type { Engine } from "../../core/ports/engine.js";
// Violates layer-adapters.
import type { SessionEvent } from "../../core/session/events.js";

export const engine: Engine & { lastEvent?: SessionEvent } = { render() {} };
