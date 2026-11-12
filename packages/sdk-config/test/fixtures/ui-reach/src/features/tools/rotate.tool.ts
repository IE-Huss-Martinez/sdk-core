// Allowed (ADR 0036, amended): a feature may import ui's root entry, types
// and values, even where the . entry reaches it. It's server-safe and has no
// React.
import type { IconName } from "@hussmartinez/ui";
import { uiMessages } from "@hussmartinez/ui";

export const rotateTool = { icon: "rotate-left" satisfies IconName, messages: uiMessages };
