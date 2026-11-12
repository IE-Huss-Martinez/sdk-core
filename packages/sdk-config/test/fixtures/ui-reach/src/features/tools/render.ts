// Not allowed: the . entry reaches this file, and React stays out of it even
// as types (ADR 0036).
import type { ReactNode } from "react";

export type ToolLabel = ReactNode;
