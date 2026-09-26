import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Adapter, CondensedToolCall, NormalizedMessage, NormalizedTranscript, SessionSummary } from "../../types.js";
import { truncate } from "../../util.js";
import { openDb } from "./sqlite.js";

/**
 * Shared implementation for opencode and its schema-compatible forks (currently:
 * Kilo CLI, which stores identical session/message/part tables under a different
 * db file name and dir). Add a new fork here only after confirming its schema
 * actually matches — don't assume from the binary name alone.
 */
export interface OpencodeFamilyConfig {
  /** Adapter id / badge key, e.g. "opencode" or "kilo". */
  id: string;
  /** Human-readable name shown in `tupa support`. */
  name: string;
  /** The app's own dir name under XDG/platform data dirs, e.g. "opencode" or "kilo". */
  dirName: string;
  /** The sqlite file name inside that dir, e.g. "opencode.db" or "kilo.db". */
  dbFileName: string;
  /** Env var that overrides data-dir discovery (mainly for tests). */
  envOverrideVar: string;
  resumeCommand(id: string): string;
  launchWithContext(handoffPath: string): string;
}

/**
 * Data dir location isn't formally documented across platforms for these tools, so
 * this tries every plausible location and uses the first one that actually exists.
 * XDG_DATA_HOME is honored everywhere (some Windows/Linux setups export it deliberately).
 */
function candidateDataDirs(dirName: string): string[] {
  const home = homedir();
  const dirs: string[] = [];
  if (process.env.XDG_DATA_HOME) dirs.push(join(process.env.XDG_DATA_HOME, dirName));

  if (process.platform === "win32") {
    if (process.env.LOCALAPPDATA) dirs.push(join(process.env.LOCALAPPDATA, dirName));
    if (process.env.APPDATA) dirs.push(join(process.env.APPDATA, dirName));
    // Bun-built CLIs in this family (opencode, Kilo) hardcode a Unix-style
    // "~/.local/share" path even when running on Windows, ignoring LOCALAPPDATA/APPDATA.
    dirs.push(join(home, ".local", "share", dirName));
  } else if (process.platform === "darwin") {
    dirs.push(join(home, ".local", "share", dirName));
    dirs.push(join(home, "Library", "Application Support", dirName));
  } else {
    dirs.push(join(home, ".local", "share", dirName));
  }

  return dirs;
}

function resolveDataDir(config: OpencodeFamilyConfig): string | undefined {
  const override = process.env[config.envOverrideVar];
  if (override) return existsSync(override) ? override : undefined;
  return candidateDataDirs(config.dirName).find((dir) => existsSync(join(dir, config.dbFileName)));
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

export function createOpencodeFamilyAdapter(config: OpencodeFamilyConfig): Adapter {
  return {
    id: config.id,
    name: config.name,

    async detect() {
      return resolveDataDir(config) !== undefined;
    },

    async listSessions(cwd: string): Promise<SessionSummary[]> {
      const dir = resolveDataDir(config);
      if (!dir) return [];
      const db = await openDb(join(dir, config.dbFileName));
      if (!db) return [];

      try {
        const rows = db
          .prepare(
            "SELECT id, directory, title, time_created, time_updated FROM session WHERE directory = ? ORDER BY time_updated DESC",
          )
          .all(cwd) as unknown as SessionRow[];

        return rows.map((row) => ({
          id: row.id,
          tool: config.id,
          cwd,
          title: titleFor(row),
          updatedAt: new Date(row.time_updated ?? row.time_created ?? 0),
          sourcePath: join(dir, config.dbFileName),
        }));
      } catch {
        return []; // tolerant: schema changes between versions
      } finally {
        db.close();
      }
    },

    async readSession(id: string): Promise<NormalizedTranscript | undefined> {
      const dir = resolveDataDir(config);
      if (!dir) return undefined;
      const db = await openDb(join(dir, config.dbFileName));
      if (!db) return undefined;

      try {
        const session = db
          .prepare("SELECT id, directory, title, time_created, time_updated FROM session WHERE id = ?")
          .get(id) as SessionRow | undefined;
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

        return { id, tool: config.id, cwd: session.directory, messages, changedFiles: [...changedFiles] };
      } catch {
        return undefined;
      } finally {
        db.close();
      }
    },

    resumeCommand: config.resumeCommand,
    launchWithContext: config.launchWithContext,
  };
}
