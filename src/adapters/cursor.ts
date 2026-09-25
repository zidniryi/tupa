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

const CURSOR_DIR = process.env.TUPA_CURSOR_DIR || join(homedir(), ".cursor");
const CHATS_DIR = join(CURSOR_DIR, "chats");
const PROJECTS_DIR = join(CURSOR_DIR, "projects");

interface ChatMeta {
  title?: string;
  cwd?: string;
  createdAtMs?: number;
  updatedAtMs?: number;
}

function safeReaddir(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

function readMeta(path: string): ChatMeta | undefined {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return undefined;
  }
}

/** Every chat session lives at chats/<workspaceHash>/<sessionId>/meta.json. */
function findMetaPath(id: string): string | undefined {
  for (const hash of safeReaddir(CHATS_DIR)) {
    const candidate = join(CHATS_DIR, hash, id, "meta.json");
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

/** Transcripts live at projects/<projectSlug>/agent-transcripts/<sessionId>/<sessionId>.jsonl. */
function findTranscriptPath(id: string): string | undefined {
  for (const slug of safeReaddir(PROJECTS_DIR)) {
    const candidate = join(PROJECTS_DIR, slug, "agent-transcripts", id, `${id}.jsonl`);
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

function titleFor(meta: ChatMeta | undefined, firstUserText: string | undefined): string {
  const t = meta?.title?.trim();
  if (t) return truncate(t, 60);
  return firstUserText ? truncate(firstUserText, 60) : "(untitled session)";
}

const FILE_PATH_KEYS = ["path", "file_path", "target_file", "filePath"];

function extractToolCall(block: Record<string, unknown>): CondensedToolCall | undefined {
  if (block.type !== "tool_use" || typeof block.name !== "string") return undefined;
  const input = (block.input ?? {}) as Record<string, unknown>;
  const filePath = FILE_PATH_KEYS.map((k) => input[k]).find((v): v is string => typeof v === "string");
  return { name: block.name, summary: filePath ? `${block.name}(${filePath})` : `${block.name}(...)`, filePath };
}

function extractText(content: unknown): { text: string; toolCalls: CondensedToolCall[] } {
  const parts: string[] = [];
  const toolCalls: CondensedToolCall[] = [];
  if (!Array.isArray(content)) return { text: "", toolCalls };
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    const b = block as Record<string, unknown>;
    if (b.type === "text" && typeof b.text === "string") {
      // Cursor wraps real user input in <user_query>...</user_query> alongside a <timestamp> tag.
      const match = b.text.match(/<user_query>\s*([\s\S]*?)\s*<\/user_query>/);
      parts.push(match ? match[1]! : b.text);
    } else {
      const call = extractToolCall(b);
      if (call) toolCalls.push(call);
    }
  }
  return { text: parts.join("\n").trim(), toolCalls };
}

export const cursorAdapter: Adapter = {
  id: "cursor-agent",
  name: "Cursor CLI",

  async detect() {
    return existsSync(CHATS_DIR);
  },

  async listSessions(cwd: string): Promise<SessionSummary[]> {
    if (!existsSync(CHATS_DIR)) return [];
    const summaries: SessionSummary[] = [];

    for (const hash of safeReaddir(CHATS_DIR)) {
      const hashDir = join(CHATS_DIR, hash);
      for (const id of safeReaddir(hashDir)) {
        const metaPath = join(hashDir, id, "meta.json");
        const meta = readMeta(metaPath);
        if (!meta || meta.cwd !== cwd) continue;

        summaries.push({
          id,
          tool: "cursor-agent",
          cwd,
          title: titleFor(meta, undefined),
          updatedAt: new Date(meta.updatedAtMs ?? meta.createdAtMs ?? 0),
          sourcePath: metaPath,
        });
      }
    }
    summaries.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    return summaries;
  },

  async readSession(id: string): Promise<NormalizedTranscript | undefined> {
    const transcriptPath = findTranscriptPath(id);
    if (!transcriptPath) return undefined;

    const metaPath = findMetaPath(id);
    const meta = metaPath ? readMeta(metaPath) : undefined;

    const messages: NormalizedMessage[] = [];
    const changedFiles = new Set<string>();

    const rl = createInterface({ input: createReadStream(transcriptPath, { encoding: "utf8" }), crlfDelay: Infinity });
    for await (const line of rl) {
      if (!line.trim()) continue;
      let entry: { role?: string; message?: { content?: unknown } };
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }
      if (!entry.message?.content) continue;
      const role = entry.role === "assistant" ? "assistant" : "user";
      const { text, toolCalls } = extractText(entry.message.content);
      if (!text && toolCalls.length === 0) continue;
      for (const call of toolCalls) if (call.filePath) changedFiles.add(call.filePath);
      messages.push({ role, text, toolCalls });
    }
    rl.close();

    return { id, tool: "cursor-agent", cwd: meta?.cwd ?? "", messages, changedFiles: [...changedFiles] };
  },

  resumeCommand(id: string): string {
    return `agent --resume=${id}`;
  },

  launchWithContext(handoffPath: string): string {
    return `agent "Read ${handoffPath} and continue from 'Next steps'."`;
  },
};
