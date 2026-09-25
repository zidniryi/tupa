import type { Adapter } from "../types.js";
import { agyAdapter } from "./agy.js";
import { claudeCodeAdapter } from "./claude-code.js";
import { codexAdapter } from "./codex.js";
import { opencodeAdapter } from "./opencode.js";

// Adapters are added one at a time: Claude Code, Antigravity CLI (agy), opencode, Codex CLI.
export const adapters: Adapter[] = [claudeCodeAdapter, agyAdapter, opencodeAdapter, codexAdapter];
