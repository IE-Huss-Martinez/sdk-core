// Not allowed: an SDK defines its own provider port instead of importing
// ai-core's types (ADR 0035).
import type { AiProvider } from "@hussmartinez/ai-core";

export type Assistant = AiProvider;
