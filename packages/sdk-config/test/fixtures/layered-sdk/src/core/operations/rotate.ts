import type { Page } from "../model/page.js";
// Violates layer-operations.
import type { Engine } from "../ports/engine.js";

export type Rotate = (page: Page, engine: Engine) => Page;
