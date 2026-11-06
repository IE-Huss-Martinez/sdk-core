// Violates core-no-react and layer-core.
import "react";
import { engine } from "../../adapters/engine/engine.js";
import type { Page } from "../model/page.js";
import type { Rotate } from "../operations/rotate.js";
import type { Engine } from "../ports/engine.js";

export interface Store {
  readonly pages: Page[];
  readonly rotate?: Rotate;
  readonly engine: Engine;
}

export const defaultEngine = engine;
