import type { Adapter } from "../types.js";
import { agyAdapter } from "./agy.js";
import { claudeCodeAdapter } from "./claude-code.js";
import { opencodeAdapter } from "./opencode.js";

// Adapters are added one at a time: Claude Code, then Antigravity CLI (agy), then opencode.
export const adapters: Adapter[] = [claudeCodeAdapter, agyAdapter, opencodeAdapter];
