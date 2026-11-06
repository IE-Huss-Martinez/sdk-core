// Allowed (ADR 0017): every layer may import core/errors.
import type { PageError } from "../errors/errors.js";
import type { Page } from "../model/page.js";

export interface Engine {
  render(page: Page): void;
  readonly lastError?: PageError;
}
