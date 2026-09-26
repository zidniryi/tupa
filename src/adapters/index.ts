import type { Adapter } from "../types.js";
import { agyAdapter } from "./agy.js";
import { claudeCodeAdapter } from "./claude-code.js";
import { codexAdapter } from "./codex.js";
import { copilotAdapter } from "./copilot.js";
import { cursorAdapter } from "./cursor.js";
import { kiloAdapter } from "./kilo.js";
import { kiroAdapter } from "./kiro.js";
import { opencodeAdapter } from "./opencode.js";

// Adapters are added one at a time: Claude Code, Antigravity CLI (agy), opencode,
// Codex CLI, Cursor CLI, Kilo CLI, Kiro CLI, GitHub Copilot CLI.
export const adapters: Adapter[] = [
  claudeCodeAdapter,
  agyAdapter,
  opencodeAdapter,
  codexAdapter,
  cursorAdapter,
  kiloAdapter,
  kiroAdapter,
  copilotAdapter,
];
