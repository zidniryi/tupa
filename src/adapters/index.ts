import type { Adapter } from "../types.js";
import { claudeCodeAdapter } from "./claude-code.js";

// Add one adapter at a time (see CLAUDE.md "Ground rules"). Claude Code ships first.
export const adapters: Adapter[] = [claudeCodeAdapter];
