import { createReadStream, existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createInterface } from "node:readline";
import { homedir } from "node:os";
import { join } from "node:path";
import type {
  Adapter,
  NormalizedMessage,
  NormalizedTranscript,
  SessionSummary,
} from "../types.js";
import { truncate } from "../util.js";

const CODEX_DIR = process.env.TUPA_CODEX_DIR || join(homedir(), ".codex");
const SESSIONS_DIR = join(CODEX_DIR, "sessions");
const SESSION_INDEX_PATH = join(CODEX_DIR, "session_index.jsonl");

interface RolloutLine {
  type?: string;
  payload?: Record<string, unknown>;
}

/** Recursively lists rollout-*.jsonl files under sessions/<year>/<month>/<day>/. */
function walkRolloutFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop()!;
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile() && entry.name.startsWith("rollout-") && entry.name.endsWith(".jsonl")) out.push(full);
    }
  }
  return out;
}

/** id -> most recently indexed title. Tolerant: index format may change or be absent. */
function readTitleIndex(): Map<string, string> {
  const map = new Map<string, string>();
  if (!existsSync(SESSION_INDEX_PATH)) return map;
  let raw: string;
  try {
    raw = readFileSync(SESSION_INDEX_PATH, "utf8");
  } catch {
    return map;
  }
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      if (typeof entry.id === "string" && typeof entry.thread_name === "string" && entry.thread_name) {
        map.set(entry.id, entry.thread_name);
      }
    } catch {
      continue;
    }
  }
  return map;
}

// Codex injects framework/system plumbing as plain user-role text blocks wrapped in
// a short bracketed header (environment info, model-switch notices, permissions
// instructions, ...). None of it is real user intent, so it's dropped rather than
// polluting the Goal/Done sections of a handoff. The exact header text and spacing
// varies ("<environment_context>", "<permissions instructions>", ...) and new ones
// keep showing up, so this matches the general "starts with <...>" shape rather than
// maintaining a growing denylist.
const INJECTED_TAG_PATTERN = /^<[^<>]{1,60}>/;

function isInjectedText(text: string): boolean {
  return INJECTED_TAG_PATTERN.test(text.trimStart());
}

function extractText(content: unknown): string {
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    const b = block as Record<string, unknown>;
    if ((b.type === "input_text" || b.type === "output_text") && typeof b.text === "string") {
      if (isInjectedText(b.text)) continue;
      parts.push(b.text);
    }
  }
  return parts.join("\n").trim();
}

function fallbackTitle(text: string | undefined): string {
  if (!text) return "(untitled session)";
  return truncate(text, 60) || "(untitled session)";
}

interface Peek {
  id?: string;
  cwd?: string;
  timestamp?: Date;
  firstUserText?: string;
}

/** Reads just enough of a rollout file to summarize it: the session_meta line for
 * id/cwd/timestamp, plus a short scan for a title fallback if the index has none. */
async function peekRollout(filePath: string): Promise<Peek> {
  const result: Peek = {};
  const rl = createInterface({ input: createReadStream(filePath, { encoding: "utf8" }), crlfDelay: Infinity });
  let lineCount = 0;
  for await (const line of rl) {
    lineCount += 1;
    if (!line.trim()) continue;
    let entry: RolloutLine;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (entry.type === "session_meta" && entry.payload) {
      result.id = typeof entry.payload.id === "string" ? entry.payload.id : undefined;
      result.cwd = typeof entry.payload.cwd === "string" ? entry.payload.cwd : undefined;
      const ts = typeof entry.payload.timestamp === "string" ? new Date(entry.payload.timestamp) : undefined;
      if (ts && !Number.isNaN(ts.getTime())) result.timestamp = ts;
    }
    if (
      !result.firstUserText &&
      entry.type === "response_item" &&
      entry.payload?.type === "message" &&
      entry.payload.role === "user"
    ) {
      const text = extractText(entry.payload.content);
      if (text) result.firstUserText = text;
    }
    // session_meta is always first; once we also have a title fallback candidate, stop early.
    if (result.cwd && (result.firstUserText || lineCount > 50)) break;
  }
  rl.close();
  return result;
}

export const codexAdapter: Adapter = {
  id: "codex",
  name: "Codex CLI",

  async detect() {
    return existsSync(CODEX_DIR);
  },

  async listSessions(cwd: string): Promise<SessionSummary[]> {
    const files = walkRolloutFiles(SESSIONS_DIR);
    if (files.length === 0) return [];
    const titles = readTitleIndex();

    const summaries: SessionSummary[] = [];
    for (const filePath of files) {
      const peek = await peekRollout(filePath).catch(() => ({}) as Peek);
      if (!peek.id || peek.cwd !== cwd) continue;

      let mtime = new Date(0);
      try {
        mtime = statSync(filePath).mtime;
      } catch {
        // keep epoch fallback
      }

      summaries.push({
        id: peek.id,
        tool: "codex",
        cwd,
        title: titles.get(peek.id) ?? fallbackTitle(peek.firstUserText),
        updatedAt: peek.timestamp ?? mtime,
        sourcePath: filePath,
      });
    }
    summaries.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    return summaries;
  },

  async readSession(id: string): Promise<NormalizedTranscript | undefined> {
    const filePath = walkRolloutFiles(SESSIONS_DIR).find((f) => f.includes(id));
    if (!filePath) return undefined;

    const messages: NormalizedMessage[] = [];
    let cwd = "";

    const rl = createInterface({ input: createReadStream(filePath, { encoding: "utf8" }), crlfDelay: Infinity });
    for await (const line of rl) {
      if (!line.trim()) continue;
      let entry: RolloutLine;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }
      if (entry.type === "session_meta" && typeof entry.payload?.cwd === "string") cwd = entry.payload.cwd;

      if (entry.type === "response_item" && entry.payload?.type === "message") {
        const role = entry.payload.role === "assistant" ? "assistant" : "user";
        const text = extractText(entry.payload.content);
        if (!text) continue;
        messages.push({ role, text, toolCalls: [] });
      }
    }
    rl.close();

    if (!cwd && messages.length === 0) return undefined;
    // Codex tool calls are opaque shell/JS snippets with no structured file-path field,
    // so changedFiles is intentionally left empty rather than guessed from command text.
    return { id, tool: "codex", cwd, messages, changedFiles: [] };
  },

  resumeCommand(id: string): string {
    return `codex resume ${id}`;
  },

  launchWithContext(handoffPath: string): string {
    return `codex "Read ${handoffPath} and continue from 'Next steps'."`;
  },
};
