import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
process.env.TUPA_CODEX_DIR = join(here, "..", "fixtures", "codex");

const { codexAdapter } = await import("../../src/adapters/codex.js");

test("detect() finds the fixtures dir", async () => {
  assert.equal(await codexAdapter.detect(), true);
});

test("listSessions() reads the title from session_index.jsonl and cwd from the rollout file", async () => {
  const sessions = await codexAdapter.listSessions("/tmp/fixture-project");
  assert.equal(sessions.length, 1);
  const session = sessions[0]!;
  assert.equal(session.id, "sample-session");
  assert.equal(session.tool, "codex");
  assert.equal(session.title, "Add /health endpoint");
});

test("listSessions() on an unmatched directory returns no sessions", async () => {
  const sessions = await codexAdapter.listSessions("/tmp/does-not-exist");
  assert.deepEqual(sessions, []);
});

test("readSession() drops injected <tag> boilerplate and skips bad lines", async () => {
  const transcript = await codexAdapter.readSession("sample-session");
  assert.ok(transcript);
  assert.equal(transcript!.cwd, "/tmp/fixture-project");
  assert.equal(transcript!.messages.length, 3);
  assert.equal(transcript!.messages[0]!.role, "user");
  assert.equal(transcript!.messages[0]!.text, "Add a health check endpoint to the API");
  assert.equal(transcript!.messages[1]!.text, "I'll add a GET /health route.");
});

test("readSession() returns undefined for an unknown id", async () => {
  const transcript = await codexAdapter.readSession("does-not-exist");
  assert.equal(transcript, undefined);
});

test("resumeCommand() and launchWithContext() return shell commands", () => {
  assert.equal(codexAdapter.resumeCommand("abc123", "/tmp"), "codex resume abc123");
  assert.match(codexAdapter.launchWithContext("/tmp/HANDOFF.md", "/tmp"), /Read \/tmp\/HANDOFF\.md and continue/);
});
