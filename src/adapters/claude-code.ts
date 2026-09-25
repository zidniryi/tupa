import { createReadStream, existsSync, readdirSync, statSync } from "node:fs";
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

// Overridable for tests; production always uses the real Claude Code projects dir.
const PROJECTS_DIR = process.env.TUPA_CLAUDE_PROJECTS_DIR || join(homedir(), ".claude", "projects");

/** Mirrors Claude Code's own project-dir slugging: path separators and dots become dashes. */
function slugForCwd(cwd: string): string {
  return cwd.replace(/[\\/.]/g, "-");
}

interface RawEntry {
  type?: string;
  aiTitle?: string;
  cwd?: string;
  gitBranch?: string;
  timestamp?: string;
  message?: { role?: string; content?: unknown };
}

function extractText(content: unknown): { text: string; toolCalls: CondensedToolCall[] } {
  const parts: string[] = [];
  const toolCalls: CondensedToolCall[] = [];
  if (typeof content === "string") return { text: content, toolCalls };
  if (Array.isArray(content)) {
    for (const block of content) {
      if (!block || typeof block !== "object") continue;
      const b = block as Record<string, unknown>;
      if (b.type === "text" && typeof b.text === "string") {
        parts.push(b.text);
      } else if (b.type === "tool_use" && typeof b.name === "string") {
        const input = (b.input ?? {}) as Record<string, unknown>;
        const filePath = typeof input.file_path === "string" ? input.file_path : undefined;
        toolCalls.push({ name: b.name, summary: filePath ? `${b.name}(${filePath})` : `${b.name}(...)`, filePath });
      }
    }
  }
  return { text: parts.join("\n").trim(), toolCalls };
}

function fallbackTitle(text: string | undefined): string {
  if (!text) return "(untitled session)";
  return truncate(text, 60) || "(untitled session)";
}

interface ScanResult {
  title?: string;
  cwd?: string;
  gitBranch?: string;
  lastTimestamp?: Date;
  firstUserText?: string;
}

/** Streams a session file line by line so large logs never get buffered whole into memory. */
async function scanFile(filePath: string): Promise<ScanResult> {
  const result: ScanResult = {};
  const rl = createInterface({ input: createReadStream(filePath, { encoding: "utf8" }), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    let entry: RawEntry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue; // tolerant: session formats change, skip whatever we can't parse
    }
    if (entry.type === "ai-title" && typeof entry.aiTitle === "string") result.title = entry.aiTitle;
    if (typeof entry.cwd === "string") result.cwd = entry.cwd;
    if (typeof entry.gitBranch === "string") result.gitBranch = entry.gitBranch;
    if (typeof entry.timestamp === "string") {
      const t = new Date(entry.timestamp);
      if (!Number.isNaN(t.getTime())) result.lastTimestamp = t;
    }
    if (!result.firstUserText && entry.type === "user" && entry.message?.role === "user") {
      const { text } = extractText(entry.message.content);
      if (text) result.firstUserText = text;
    }
  }
  return result;
}

function findSessionFile(id: string): string | undefined {
  if (!existsSync(PROJECTS_DIR)) return undefined;
  for (const projectDir of readdirSync(PROJECTS_DIR)) {
    const candidate = join(PROJECTS_DIR, projectDir, `${id}.jsonl`);
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

export const claudeCodeAdapter: Adapter = {
  id: "claude-code",
  name: "Claude Code",

  async detect() {
    return existsSync(PROJECTS_DIR);
  },

  async listSessions(cwd: string): Promise<SessionSummary[]> {
    const dir = join(PROJECTS_DIR, slugForCwd(cwd));
    if (!existsSync(dir)) return [];

    const files = readdirSync(dir).filter((f) => f.endsWith(".jsonl"));
    const summaries: SessionSummary[] = [];
    for (const file of files) {
      const filePath = join(dir, file);
      const id = file.replace(/\.jsonl$/, "");
      let stat;
      try {
        stat = statSync(filePath);
      } catch {
        continue;
      }
      const scanned = await scanFile(filePath).catch(() => ({}) as ScanResult);
      summaries.push({
        id,
        tool: "claude-code",
        cwd: scanned.cwd ?? cwd,
        title: scanned.title ?? fallbackTitle(scanned.firstUserText),
        updatedAt: scanned.lastTimestamp ?? stat.mtime,
        sourcePath: filePath,
        gitBranch: scanned.gitBranch,
      });
    }
    summaries.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    return summaries;
  },

  async readSession(id: string): Promise<NormalizedTranscript | undefined> {
    const filePath = findSessionFile(id);
    if (!filePath) return undefined;

    const messages: NormalizedMessage[] = [];
    const changedFiles = new Set<string>();
    let cwd = "";
    let gitBranch: string | undefined;

    const rl = createInterface({ input: createReadStream(filePath, { encoding: "utf8" }), crlfDelay: Infinity });
    for await (const line of rl) {
      if (!line.trim()) continue;
      let entry: RawEntry;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }
      if (typeof entry.cwd === "string") cwd = entry.cwd;
      if (typeof entry.gitBranch === "string") gitBranch = entry.gitBranch;

      if ((entry.type === "user" || entry.type === "assistant") && entry.message?.content !== undefined) {
        const role = entry.message.role === "assistant" ? "assistant" : "user";
        const { text, toolCalls } = extractText(entry.message.content);
        if (!text && toolCalls.length === 0) continue;
        for (const call of toolCalls) if (call.filePath) changedFiles.add(call.filePath);
        const timestamp = typeof entry.timestamp === "string" ? new Date(entry.timestamp) : undefined;
        messages.push({ role, text, toolCalls, timestamp });
      }
    }

    return { id, tool: "claude-code", cwd, gitBranch, messages, changedFiles: [...changedFiles] };
  },

  resumeCommand(id: string): string {
    return `claude --resume ${id}`;
  },

  launchWithContext(handoffPath: string): string {
    return `claude "Read ${handoffPath} and continue from 'Next steps'."`;
  },
};
