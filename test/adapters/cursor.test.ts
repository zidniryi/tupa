import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
process.env.TUPA_CURSOR_DIR = join(here, "..", "fixtures", "cursor");

const { cursorAdapter } = await import("../../src/adapters/cursor.js");

test("detect() finds the fixtures dir", async () => {
  assert.equal(await cursorAdapter.detect(), true);
});

test("listSessions() reads title, cwd and updatedAt from meta.json", async () => {
  const sessions = await cursorAdapter.listSessions("/tmp/fixture-project");
  assert.equal(sessions.length, 1);
  const session = sessions[0]!;
  assert.equal(session.id, "sample-session");
  assert.equal(session.tool, "cursor-agent");
  assert.equal(session.title, "Add /health endpoint");
  assert.equal(session.updatedAt.getTime(), 2000);
});

test("listSessions() on an unmatched directory returns no sessions", async () => {
  const sessions = await cursorAdapter.listSessions("/tmp/does-not-exist");
  assert.deepEqual(sessions, []);
});

test("readSession() extracts <user_query>, skips bad lines, and collects changed files", async () => {
  const transcript = await cursorAdapter.readSession("sample-session");
  assert.ok(transcript);
  assert.equal(transcript!.cwd, "/tmp/fixture-project");
  assert.equal(transcript!.messages.length, 3);
  assert.equal(transcript!.messages[0]!.role, "user");
  assert.equal(transcript!.messages[0]!.text, "Add a health check endpoint to the API");
  assert.deepEqual(transcript!.changedFiles, ["/tmp/fixture-project/src/health.ts"]);
});

test("readSession() returns undefined for an unknown id", async () => {
  const transcript = await cursorAdapter.readSession("does-not-exist");
  assert.equal(transcript, undefined);
});

test("resumeCommand() and launchWithContext() return shell commands", () => {
  assert.equal(cursorAdapter.resumeCommand("abc123", "/tmp"), "agent --resume=abc123");
  assert.match(cursorAdapter.launchWithContext("/tmp/HANDOFF.md", "/tmp"), /Read \/tmp\/HANDOFF\.md and continue/);
});
