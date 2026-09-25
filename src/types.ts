export interface SessionSummary {
  id: string;
  tool: string;
  cwd: string;
  title: string;
  updatedAt: Date;
  sourcePath: string;
  gitBranch?: string;
}

export type MessageRole = "user" | "assistant" | "system";

export interface CondensedToolCall {
  name: string;
  summary: string;
  filePath?: string;
}

export interface NormalizedMessage {
  role: MessageRole;
  text: string;
  timestamp?: Date;
  toolCalls: CondensedToolCall[];
}

export interface NormalizedTranscript {
  id: string;
  tool: string;
  cwd: string;
  gitBranch?: string;
  messages: NormalizedMessage[];
  changedFiles: string[];
}

export interface Adapter {
  /** Short machine id, e.g. "claude-code" */
  id: string;
  /** Human-readable name, e.g. "Claude Code" */
  name: string;
  /** Whether this tool is installed and has session data on this machine. */
  detect(): Promise<boolean>;
  /** Recent sessions for a directory, newest first. */
  listSessions(cwd: string): Promise<SessionSummary[]>;
  /** Normalized transcript for a single session id. */
  readSession(id: string): Promise<NormalizedTranscript | undefined>;
  /** The native shell command to resume this session in the same tool. */
  resumeCommand(id: string, cwd: string): string;
  /** The shell command to open this tool with handoff context, for switching tools. */
  launchWithContext(handoffPath: string, cwd: string): string;
}
