// Allowed (ADR 0017): every layer may import core/errors.
import type { PageError } from "../../core/errors/errors.js";
import type { Engine } from "../../core/ports/engine.js";
// Violates layer-adapters.
import type { SessionEvent } from "../../core/session/events.js";

export const engine: Engine & { lastEvent?: SessionEvent; errors?: PageError[] } = {
  render() {},
};
