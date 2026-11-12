// Not allowed: the core never imports ui, not even its root entry's types
// (ADR 0017, ADR 0036).
import type { IconName } from "@hussmartinez/ui";

export const defaultIcon: IconName | undefined = undefined;
