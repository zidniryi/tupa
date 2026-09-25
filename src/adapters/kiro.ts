import { createReadStream, existsSync, readFileSync, readdirSync } from "node:fs";
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

const KIRO_DIR = process.env.TUPA_KIRO_DIR || join(homedir(), ".kiro");
const SESSIONS_DIR = join(KIRO_DIR, "sessions", "cli");

interface SessionMeta {
  session_id?: string;
  cwd?: string;
  title?: string;
  created_at?: string;
  updated_at?: string;
}

function readMeta(path: string): SessionMeta | undefined {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return undefined;
  }
}

function titleFor(meta: SessionMeta): string {
  const t = meta.title?.trim();
  return t ? truncate(t, 60) : "(untitled session)";
}

interface ContentItem {
  kind?: string;
  data?: unknown;
}

function extractMessage(content: unknown): { text: string; toolCalls: CondensedToolCall[] } {
  const parts: string[] = [];
  const toolCalls: CondensedToolCall[] = [];
  if (!Array.isArray(content)) return { text: "", toolCalls };
  for (const item of content as ContentItem[]) {
    if (!item || typeof item !== "object") continue;
    if (item.kind === "text" && typeof item.data === "string" && item.data) {
      parts.push(item.data);
    } else if (item.kind === "toolUse" && item.data && typeof item.data === "object") {
      const tool = item.data as { name?: string; input?: Record<string, unknown> };
      if (typeof tool.name !== "string") continue;
      const filePath = typeof tool.input?.path === "string" ? tool.input.path : undefined;
      toolCalls.push({ name: tool.name, summary: filePath ? `${tool.name}(${filePath})` : `${tool.name}(...)`, filePath });
    }
  }
  return { text: parts.join("\n").trim(), toolCalls };
}

export const kiroAdapter: Adapter = {
  id: "kiro-cli",
  name: "Kiro CLI",

  async detect() {
    return existsSync(SESSIONS_DIR);
  },

  async listSessions(cwd: string): Promise<SessionSummary[]> {
    if (!existsSync(SESSIONS_DIR)) return [];
    const summaries: SessionSummary[] = [];

    for (const entry of readdirSync(SESSIONS_DIR)) {
      if (!entry.endsWith(".json")) continue; // skips the sibling .jsonl/.history files and the per-session dir
      const metaPath = join(SESSIONS_DIR, entry);
      const meta = readMeta(metaPath);
      if (!meta?.session_id || meta.cwd !== cwd) continue;

      summaries.push({
        id: meta.session_id,
        tool: "kiro-cli",
        cwd,
        title: titleFor(meta),
        updatedAt: new Date(meta.updated_at ?? meta.created_at ?? 0),
        sourcePath: join(SESSIONS_DIR, `${meta.session_id}.jsonl`),
      });
    }
    summaries.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    return summaries;
  },

  async readSession(id: string): Promise<NormalizedTranscript | undefined> {
    const transcriptPath = join(SESSIONS_DIR, `${id}.jsonl`);
    if (!existsSync(transcriptPath)) return undefined;

    const meta = readMeta(join(SESSIONS_DIR, `${id}.json`));
    const messages: NormalizedMessage[] = [];
    const changedFiles = new Set<string>();

    const rl = createInterface({ input: createReadStream(transcriptPath, { encoding: "utf8" }), crlfDelay: Infinity });
    for await (const line of rl) {
      if (!line.trim()) continue;
      let entry: { kind?: string; data?: { content?: unknown } };
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }
      if (entry.kind !== "Prompt" && entry.kind !== "AssistantMessage") continue;
      const role = entry.kind === "AssistantMessage" ? "assistant" : "user";
      const { text, toolCalls } = extractMessage(entry.data?.content);
      if (!text && toolCalls.length === 0) continue;
      for (const call of toolCalls) if (call.filePath) changedFiles.add(call.filePath);
      messages.push({ role, text, toolCalls });
    }
    rl.close();

    return { id, tool: "kiro-cli", cwd: meta?.cwd ?? "", messages, changedFiles: [...changedFiles] };
  },

  resumeCommand(id: string): string {
    return `kiro-cli --resume-id ${id}`;
  },

  launchWithContext(handoffPath: string): string {
    return `kiro-cli "Read ${handoffPath} and continue from 'Next steps'."`;
  },
};
