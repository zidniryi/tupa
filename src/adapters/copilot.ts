import { createReadStream, existsSync } from "node:fs";
import { createInterface } from "node:readline";
import { homedir } from "node:os";
import { join } from "node:path";
import type {
  Adapter,
  CondensedToolCall,
  NormalizedMessage,
  NormalizedTranscript,
  SessionSummary,
} from "../types.js";
import { truncate } from "../util.js";
import { openDb } from "./lib/sqlite.js";

const COPILOT_DIR = process.env.TUPA_COPILOT_DIR || join(homedir(), ".copilot");
const SESSION_STORE_DB = join(COPILOT_DIR, "session-store.db");
const SESSION_STATE_DIR = join(COPILOT_DIR, "session-state");

interface SessionRow {
  id: string;
  cwd: string | null;
  summary: string | null;
  updated_at: string | null;
  created_at: string | null;
}

function titleFor(summary: string | null): string {
  const t = summary?.trim();
  return t ? truncate(t, 60) : "(untitled session)";
}

const FILE_PATH_KEYS = ["path", "file_path", "filePath", "target_file"];

function extractToolCalls(toolRequests: unknown): CondensedToolCall[] {
  if (!Array.isArray(toolRequests)) return [];
  const calls: CondensedToolCall[] = [];
  for (const raw of toolRequests) {
    if (!raw || typeof raw !== "object") continue;
    const tr = raw as Record<string, unknown>;
    if (typeof tr.name !== "string") continue;
    const args = (tr.arguments ?? {}) as Record<string, unknown>;
    const filePath = FILE_PATH_KEYS.map((k) => args[k]).find((v): v is string => typeof v === "string");
    calls.push({ name: tr.name, summary: filePath ? `${tr.name}(${filePath})` : `${tr.name}(...)`, filePath });
  }
  return calls;
}

interface SessionEvent {
  type?: string;
  data?: {
    content?: unknown;
    toolRequests?: unknown;
    context?: { cwd?: unknown };
  };
}

export const copilotAdapter: Adapter = {
  id: "copilot",
  name: "GitHub Copilot CLI",

  async detect() {
    return existsSync(SESSION_STORE_DB);
  },

  async listSessions(cwd: string): Promise<SessionSummary[]> {
    const db = await openDb(SESSION_STORE_DB);
    if (!db) return [];

    try {
      const rows = db
        .prepare("SELECT id, cwd, summary, created_at, updated_at FROM sessions WHERE cwd = ? ORDER BY updated_at DESC")
        .all(cwd) as unknown as SessionRow[];

      return rows.map((row) => ({
        id: row.id,
        tool: "copilot",
        cwd,
        title: titleFor(row.summary),
        updatedAt: new Date(row.updated_at ?? row.created_at ?? 0),
        sourcePath: join(SESSION_STATE_DIR, row.id, "events.jsonl"),
      }));
    } catch {
      return []; // tolerant: schema changes between versions
    } finally {
      db.close();
    }
  },

  async readSession(id: string): Promise<NormalizedTranscript | undefined> {
    const transcriptPath = join(SESSION_STATE_DIR, id, "events.jsonl");
    if (!existsSync(transcriptPath)) return undefined;

    const messages: NormalizedMessage[] = [];
    const changedFiles = new Set<string>();
    let cwd = "";

    const rl = createInterface({ input: createReadStream(transcriptPath, { encoding: "utf8" }), crlfDelay: Infinity });
    for await (const line of rl) {
      if (!line.trim()) continue;
      let entry: SessionEvent;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }
      if (typeof entry.data?.context?.cwd === "string") cwd = entry.data.context.cwd;

      if (entry.type === "user.message") {
        const text = typeof entry.data?.content === "string" ? entry.data.content.trim() : "";
        if (text) messages.push({ role: "user", text, toolCalls: [] });
      } else if (entry.type === "assistant.message") {
        const text = typeof entry.data?.content === "string" ? entry.data.content.trim() : "";
        const toolCalls = extractToolCalls(entry.data?.toolRequests);
        if (!text && toolCalls.length === 0) continue;
        for (const call of toolCalls) if (call.filePath) changedFiles.add(call.filePath);
        messages.push({ role: "assistant", text, toolCalls });
      }
    }
    rl.close();

    return { id, tool: "copilot", cwd, messages, changedFiles: [...changedFiles] };
  },

  resumeCommand(id: string): string {
    return `copilot --resume=${id}`;
  },

  launchWithContext(handoffPath: string): string {
    return `copilot "Read ${handoffPath} and continue from 'Next steps'."`;
  },
};
