// Allowed (ADR 0017): every core layer may import sdk-core.
import type { SdkErrorOptions } from "@hussmartinez/sdk-core";
// Violates core-no-ui and layer-core.
import "react";
import { engine } from "../../adapters/engine/engine.js";
import type { PageError } from "../errors/errors.js";
import type { Page } from "../model/page.js";
import type { Rotate } from "../operations/rotate.js";
import type { Engine } from "../ports/engine.js";

export interface Store {
  readonly pages: Page[];
  readonly rotate?: Rotate;
  readonly engine: Engine;
  readonly errors: PageError[];
  readonly errorOptions?: SdkErrorOptions;
}

export const defaultEngine = engine;
