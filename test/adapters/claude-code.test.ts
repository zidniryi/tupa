import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
process.env.AGENTRESUME_CLAUDE_PROJECTS_DIR = join(here, "..", "fixtures", "claude-code");

const { claudeCodeAdapter } = await import("../../src/adapters/claude-code.js");

test("detect() finds the fixtures dir", async () => {
  assert.equal(await claudeCodeAdapter.detect(), true);
});

test("listSessions() reads title, updatedAt and id from the fixture", async () => {
  const sessions = await claudeCodeAdapter.listSessions("/tmp/fixture-project");
  assert.equal(sessions.length, 1);
  const session = sessions[0]!;
  assert.equal(session.id, "sample-session");
  assert.equal(session.tool, "claude-code");
  assert.equal(session.title, "Add /health endpoint");
  assert.equal(session.gitBranch, "main");
  assert.equal(session.updatedAt.toISOString(), "2026-01-01T00:00:15.000Z");
});

test("listSessions() on an unknown directory returns no sessions", async () => {
  const sessions = await claudeCodeAdapter.listSessions("/tmp/does-not-exist");
  assert.deepEqual(sessions, []);
});

test("readSession() normalizes messages, skips bad lines, and collects changed files", async () => {
  const transcript = await claudeCodeAdapter.readSession("sample-session");
  assert.ok(transcript);
  assert.equal(transcript!.messages.length, 4);
  assert.deepEqual(transcript!.changedFiles.sort(), [
    "/tmp/fixture-project/src/health.ts",
    "/tmp/fixture-project/src/router.ts",
  ]);
  assert.equal(transcript!.messages[0]!.role, "user");
  assert.match(transcript!.messages[0]!.text, /health check endpoint/);
});

test("readSession() returns undefined for an unknown id", async () => {
  const transcript = await claudeCodeAdapter.readSession("does-not-exist");
  assert.equal(transcript, undefined);
});

test("resumeCommand() and launchWithContext() return shell commands", () => {
  assert.equal(claudeCodeAdapter.resumeCommand("abc123", "/tmp"), "claude --resume abc123");
  assert.match(
    claudeCodeAdapter.launchWithContext("/tmp/HANDOFF.md", "/tmp"),
    /Read \/tmp\/HANDOFF\.md and continue/,
  );
});
