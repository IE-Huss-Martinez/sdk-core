// The headless entry: everything it reaches must stay free of ui and React
// (ADR 0036).
export { createSession } from "./core/session/session.js";
// Not allowed: the toolbar feature imports ui, so the entry reaches it.
export { toolbarItems } from "./features/toolbar/toolbar.js";
