/** Tools known from the CLI agent reference that don't have an adapter yet. */
export interface PlannedTool {
  id: string;
  name: string;
}

export const PLANNED_TOOLS: PlannedTool[] = [
  { id: "codex", name: "Codex CLI" },
  { id: "gemini", name: "Gemini CLI" },
  { id: "copilot", name: "GitHub Copilot CLI" },
  { id: "cursor-agent", name: "Cursor CLI" },
  { id: "kimi", name: "Kimi Code CLI" },
  { id: "qwen", name: "Qwen Code" },
  { id: "goose", name: "Goose" },
  { id: "aider", name: "Aider" },
  { id: "droid", name: "Factory Droid" },
  { id: "amp", name: "Sourcegraph Amp" },
  { id: "kiro-cli", name: "Kiro CLI" },
  { id: "crush", name: "Crush" },
  { id: "pi", name: "Pi" },
  { id: "vibe", name: "Mistral Vibe" },
];
