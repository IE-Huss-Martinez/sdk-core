// Not allowed: published source never imports ai-core (ADR 0035).
import { createAnthropicProvider } from "@hussmartinez/ai-core";

export const provider = createAnthropicProvider;
