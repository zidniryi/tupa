import type { Adapter } from "../types.js";
import { agyAdapter } from "./agy.js";
import { claudeCodeAdapter } from "./claude-code.js";

// Adapters are added one at a time. Claude Code shipped first, Antigravity CLI (agy) second.
export const adapters: Adapter[] = [claudeCodeAdapter, agyAdapter];
