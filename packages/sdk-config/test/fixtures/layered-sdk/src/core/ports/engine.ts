import type { Page } from "../model/page.js";

export interface Engine {
  render(page: Page): void;
}
