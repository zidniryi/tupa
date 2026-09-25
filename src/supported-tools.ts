/** Tools known from the CLI agent reference that don't have an adapter yet. */
export interface PlannedTool {
  id: string;
  name: string;
}

export const PLANNED_TOOLS: PlannedTool[] = [
  { id: "gemini", name: "Gemini CLI" },
  { id: "copilot", name: "GitHub Copilot CLI" },
  { id: "kimi", name: "Kimi Code CLI" },
  { id: "qwen", name: "Qwen Code" },
  { id: "goose", name: "Goose" },
  { id: "aider", name: "Aider" },
  { id: "droid", name: "Factory Droid" },
  { id: "amp", name: "Sourcegraph Amp" },
  { id: "crush", name: "Crush" },
  { id: "pi", name: "Pi" },
  { id: "vibe", name: "Mistral Vibe" },
];
