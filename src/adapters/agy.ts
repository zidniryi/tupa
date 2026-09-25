import { existsSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Adapter, NormalizedTranscript, SessionSummary } from "../types.js";
import { truncate } from "../util.js";

const ANTIGRAVITY_DIR = process.env.TUPA_AGY_DIR || join(homedir(), ".gemini", "antigravity-cli");
const METADATA_PATH = join(ANTIGRAVITY_DIR, "cache", "conversation_metadata.json");
const LAST_CONVERSATIONS_PATH = join(ANTIGRAVITY_DIR, "cache", "last_conversations.json");
const CONVERSATIONS_DIR = join(ANTIGRAVITY_DIR, "conversations");

interface ConversationSummary {
  ID: string;
  Title?: string;
  Preview?: string;
  NumSteps?: number;
  UpdatedAt?: string;
  WorkspaceURIs?: string[];
}

interface ConversationEntry {
  summary: ConversationSummary;
  last_modified_time?: string;
}

interface MetadataFile {
  conversations: Record<string, ConversationEntry>;
}

function readMetadata(): MetadataFile | undefined {
  if (!existsSync(METADATA_PATH)) return undefined;
  try {
    return JSON.parse(readFileSync(METADATA_PATH, "utf8"));
  } catch {
    return undefined; // tolerant: cache format changes between agy versions
  }
}

/** cwd -> most recent conversation id in that directory. Kept separately from the
 * (capped, ~100 most recent) metadata cache, so it still finds a session that has
 * aged out of `conversation_metadata.json`. */
function readLastConversations(): Record<string, string> {
  if (!existsSync(LAST_CONVERSATIONS_PATH)) return {};
  try {
    return JSON.parse(readFileSync(LAST_CONVERSATIONS_PATH, "utf8"));
  } catch {
    return {};
  }
}

function uriToPath(uri: string): string | undefined {
  try {
    return new URL(uri).pathname;
  } catch {
    return undefined;
  }
}

function titleFor(summary: ConversationSummary): string {
  const t = summary.Title?.trim();
  if (t) return truncate(t, 60);
  const p = summary.Preview?.trim();
  return p ? truncate(p, 60) : "(untitled session)";
}

export const agyAdapter: Adapter = {
  id: "agy",
  name: "Antigravity CLI",

  async detect() {
    return existsSync(ANTIGRAVITY_DIR);
  },

  async listSessions(cwd: string): Promise<SessionSummary[]> {
    const metadata = readMetadata();
    const summaries: SessionSummary[] = [];
    const seen = new Set<string>();

    for (const [id, entry] of Object.entries(metadata?.conversations ?? {})) {
      const summary = entry.summary;
      if (!summary) continue;
      const paths = (summary.WorkspaceURIs ?? []).map(uriToPath).filter((p): p is string => Boolean(p));
      if (!paths.includes(cwd)) continue;

      const updatedAt = new Date(summary.UpdatedAt ?? entry.last_modified_time ?? 0);
      summaries.push({
        id,
        tool: "agy",
        cwd,
        title: titleFor(summary),
        updatedAt: Number.isNaN(updatedAt.getTime()) ? new Date(0) : updatedAt,
        sourcePath: join(CONVERSATIONS_DIR, `${id}.db`),
      });
      seen.add(id);
    }

    // Fall back to the most-recent-per-directory index for a session that has aged
    // out of the (capped) metadata cache but still has its own db file on disk.
    const lastId = readLastConversations()[cwd];
    if (lastId && !seen.has(lastId)) {
      const dbPath = join(CONVERSATIONS_DIR, `${lastId}.db`);
      if (existsSync(dbPath)) {
        let updatedAt = new Date(0);
        try {
          updatedAt = statSync(dbPath).mtime;
        } catch {
          // fall through with the epoch fallback above
        }
        summaries.push({
          id: lastId,
          tool: "agy",
          cwd,
          title: "(most recent session — no cached summary)",
          updatedAt,
          sourcePath: dbPath,
        });
      }
    }

    summaries.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    return summaries;
  },

  // The full transcript is stored as protobuf blobs in a per-conversation sqlite db
  // with no documented schema, so this is a best-effort summary, not a full transcript.
  async readSession(id: string): Promise<NormalizedTranscript | undefined> {
    const metadata = readMetadata();
    const entry = metadata?.conversations[id];

    if (!entry) {
      // Not in the (capped) metadata cache, but still resolvable via the per-directory
      // index and its own db file — return a minimal transcript rather than nothing.
      if (!existsSync(join(CONVERSATIONS_DIR, `${id}.db`))) return undefined;
      const lastConversations = readLastConversations();
      const cwd = Object.entries(lastConversations).find(([, convId]) => convId === id)?.[0] ?? "";
      return {
        id,
        tool: "agy",
        cwd,
        messages: [{ role: "user", text: "(most recent session — no cached summary)", toolCalls: [] }],
        changedFiles: [],
      };
    }

    const summary = entry.summary;
    const paths = (summary.WorkspaceURIs ?? []).map(uriToPath).filter((p): p is string => Boolean(p));

    return {
      id,
      tool: "agy",
      cwd: paths[0] ?? "",
      messages: [
        {
          role: "user",
          text: titleFor(summary),
          toolCalls: [],
        },
      ],
      changedFiles: [],
    };
  },

  resumeCommand(id: string): string {
    return `agy --conversation ${id}`;
  },

  launchWithContext(handoffPath: string): string {
    return `agy "Read ${handoffPath} and continue from 'Next steps'."`;
  },
};
