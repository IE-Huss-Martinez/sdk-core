// The headless entry: nothing it reaches may import React or ui's React
// entry (ADR 0036).

export { defaultIcon } from "./core/session/icons.js";
export { createSession } from "./core/session/session.js";
// Not allowed: the toolbar feature imports ui's React entry, so the entry
// reaches it.
export { toolbarItems } from "./features/toolbar/toolbar.js";
export type { ToolLabel } from "./features/tools/render.js";
export { rotateTool } from "./features/tools/rotate.tool.js";
