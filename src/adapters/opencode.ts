import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Adapter, CondensedToolCall, NormalizedMessage, NormalizedTranscript, SessionSummary } from "../types.js";
import { truncate } from "../util.js";

/**
 * opencode's own data dir isn't formally documented across platforms, so this tries
 * every plausible location and uses the first one that actually exists. XDG_DATA_HOME
 * is honored everywhere (some Windows/Linux setups export it deliberately).
 */
function candidateDataDirs(): string[] {
  const home = homedir();
  const dirs: string[] = [];
  if (process.env.XDG_DATA_HOME) dirs.push(join(process.env.XDG_DATA_HOME, "opencode"));

  if (process.platform === "win32") {
    if (process.env.LOCALAPPDATA) dirs.push(join(process.env.LOCALAPPDATA, "opencode"));
    if (process.env.APPDATA) dirs.push(join(process.env.APPDATA, "opencode"));
  } else if (process.platform === "darwin") {
    dirs.push(join(home, ".local", "share", "opencode"));
    dirs.push(join(home, "Library", "Application Support", "opencode"));
  } else {
    dirs.push(join(home, ".local", "share", "opencode"));
  }

  return dirs;
}

function resolveDataDir(): string | undefined {
  const override = process.env.TUPA_OPENCODE_DIR;
  if (override) return existsSync(override) ? override : undefined;
  return candidateDataDirs().find((dir) => existsSync(join(dir, "opencode.db")));
}

// node:sqlite is experimental and only exists on Node >= 22.5 — load it lazily and
// tolerate its absence entirely rather than crashing the whole CLI on older Node.
interface SqliteRow {
  [key: string]: unknown;
}
interface SqliteDatabase {
  prepare(sql: string): { all(...params: unknown[]): SqliteRow[]; get(...params: unknown[]): SqliteRow | undefined };
  close(): void;
}
async function openDb(path: string): Promise<SqliteDatabase | undefined> {
  try {
    // Built as a non-literal specifier so bundlers (esbuild/tsup) don't rewrite
    // "node:sqlite" to the bare, non-existent "sqlite" module at build time.
    const specifier = ["node", "sqlite"].join(":");
    const mod = (await import(specifier)) as { DatabaseSync: new (p: string, opts: object) => SqliteDatabase };
    return new mod.DatabaseSync(path, { readOnly: true });
  } catch {
    return undefined; // node:sqlite unavailable (Node < 22.5) or the db file is locked/corrupt
  }
}

interface SessionRow {
  id: string;
  directory: string;
  title: string | null;
  time_updated: number | null;
  time_created: number | null;
}

function titleFor(row: SessionRow): string {
  const t = row.title?.trim();
  return t ? truncate(t, 60) : "(untitled session)";
}

function extractToolCall(data: Record<string, unknown>): CondensedToolCall | undefined {
  if (data.type !== "tool" || typeof data.tool !== "string") return undefined;
  const state = data.state as { input?: Record<string, unknown> } | undefined;
  const filePath = typeof state?.input?.filePath === "string" ? state.input.filePath : undefined;
  return { name: data.tool, summary: filePath ? `${data.tool}(${filePath})` : `${data.tool}(...)`, filePath };
}

export const opencodeAdapter: Adapter = {
  id: "opencode",
  name: "opencode",

  async detect() {
    return resolveDataDir() !== undefined;
  },

  async listSessions(cwd: string): Promise<SessionSummary[]> {
    const dir = resolveDataDir();
    if (!dir) return [];
    const db = await openDb(join(dir, "opencode.db"));
    if (!db) return [];

    try {
      const rows = db
        .prepare("SELECT id, directory, title, time_created, time_updated FROM session WHERE directory = ? ORDER BY time_updated DESC")
        .all(cwd) as unknown as SessionRow[];

      return rows.map((row) => ({
        id: row.id,
        tool: "opencode",
        cwd,
        title: titleFor(row),
        updatedAt: new Date(row.time_updated ?? row.time_created ?? 0),
        sourcePath: join(dir, "opencode.db"),
      }));
    } catch {
      return []; // tolerant: schema changes between opencode versions
    } finally {
      db.close();
    }
  },

  async readSession(id: string): Promise<NormalizedTranscript | undefined> {
    const dir = resolveDataDir();
    if (!dir) return undefined;
    const db = await openDb(join(dir, "opencode.db"));
    if (!db) return undefined;

    try {
      const session = db.prepare("SELECT id, directory, title, time_created, time_updated FROM session WHERE id = ?").get(id) as
        | SessionRow
        | undefined;
      if (!session) return undefined;

      const messageRows = db
        .prepare("SELECT id, data FROM message WHERE session_id = ? ORDER BY time_created ASC")
        .all(id) as unknown as { id: string; data: string }[];
      const partRows = db
        .prepare("SELECT message_id, data FROM part WHERE session_id = ? ORDER BY time_created ASC")
        .all(id) as unknown as { message_id: string; data: string }[];

      const partsByMessage = new Map<string, Record<string, unknown>[]>();
      for (const row of partRows) {
        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(row.data);
        } catch {
          continue;
        }
        const list = partsByMessage.get(row.message_id) ?? [];
        list.push(parsed);
        partsByMessage.set(row.message_id, list);
      }

      const messages: NormalizedMessage[] = [];
      const changedFiles = new Set<string>();

      for (const row of messageRows) {
        let meta: Record<string, unknown>;
        try {
          meta = JSON.parse(row.data);
        } catch {
          continue;
        }
        const role = meta.role === "assistant" ? "assistant" : "user";
        const parts = partsByMessage.get(row.id) ?? [];
        const textParts = parts.filter((p) => p.type === "text" && typeof p.text === "string").map((p) => p.text as string);
        const toolCalls = parts.map(extractToolCall).filter((c): c is CondensedToolCall => Boolean(c));
        for (const call of toolCalls) if (call.filePath) changedFiles.add(call.filePath);

        if (textParts.length === 0 && toolCalls.length === 0) continue;
        messages.push({ role, text: textParts.join("\n").trim(), toolCalls });
      }

      return { id, tool: "opencode", cwd: session.directory, messages, changedFiles: [...changedFiles] };
    } catch {
      return undefined;
    } finally {
      db.close();
    }
  },

  resumeCommand(id: string): string {
    return `opencode -s ${id}`;
  },

  launchWithContext(handoffPath: string): string {
    return `opencode "Read ${handoffPath} and continue from 'Next steps'."`;
  },
};
