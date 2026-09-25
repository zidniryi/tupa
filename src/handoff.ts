import { writeFileSync } from "node:fs";
import type { NormalizedTranscript, SessionSummary } from "./types.js";
import { redactSecrets, truncate } from "./util.js";

export interface HandoffContext {
  session: SessionSummary;
  transcript: NormalizedTranscript;
  branch?: string;
  commit?: string;
}

export function buildHandoffMarkdown(ctx: HandoffContext): string {
  const { session, transcript } = ctx;
  const created = new Date().toISOString();
  const branch = ctx.branch ?? transcript.gitBranch ?? session.gitBranch ?? "unknown";
  const commit = ctx.commit ?? "unknown";

  const goal = transcript.messages.find((m) => m.role === "user")?.text ?? session.title;

  const done =
    transcript.messages
      .filter((m) => m.role === "assistant" && m.text)
      .slice(-5)
      .map((m) => `- ${truncate(m.text, 200)}`)
      .join("\n") || "- (no assistant messages recorded)";

  const changedFiles = transcript.changedFiles.length
    ? transcript.changedFiles.map((f) => `- ${f}`).join("\n")
    : "- (none recorded)";

  return `# Handoff
Created: ${created} from ${session.tool} (session ${session.id})
Repo/branch: ${session.cwd || transcript.cwd} @ ${branch} (${commit})

## Goal
${redactSecrets(truncate(goal, 300))}

## Done
${redactSecrets(done)}

## In progress
- (fill in before switching tools)

## Key decisions
- (fill in before switching tools)

## Next steps
- (fill in before switching tools)

## Changed files
${redactSecrets(changedFiles)}

## Verification commands (test/build)
- (add your test/build commands here)
`;
}

export function writeHandoff(path: string, markdown: string): void {
  writeFileSync(path, markdown, "utf8");
}
