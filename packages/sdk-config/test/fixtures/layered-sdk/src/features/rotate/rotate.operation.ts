// Violates layer-features.
import { engine } from "../../adapters/engine/engine.js";
import type { Rotate } from "../../core/operations/rotate.js";

export const rotate: Rotate = (page) => {
  engine.render(page);
  return page;
};
