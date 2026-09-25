import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
process.env.TUPA_KIRO_DIR = join(here, "..", "fixtures", "kiro");

const { kiroAdapter } = await import("../../src/adapters/kiro.js");

test("detect() finds the fixtures dir", async () => {
  assert.equal(await kiroAdapter.detect(), true);
});

test("listSessions() reads title, cwd and updatedAt from the .json sidecar", async () => {
  const sessions = await kiroAdapter.listSessions("/tmp/fixture-project");
  assert.equal(sessions.length, 1);
  const session = sessions[0]!;
  assert.equal(session.id, "sample-session");
  assert.equal(session.tool, "kiro-cli");
  assert.equal(session.title, "Add /health endpoint");
});

test("listSessions() on an unmatched directory returns no sessions", async () => {
  const sessions = await kiroAdapter.listSessions("/tmp/does-not-exist");
  assert.deepEqual(sessions, []);
});

test("readSession() reads Prompt/AssistantMessage kinds, skips bad lines, collects changed files", async () => {
  const transcript = await kiroAdapter.readSession("sample-session");
  assert.ok(transcript);
  assert.equal(transcript!.cwd, "/tmp/fixture-project");
  assert.equal(transcript!.messages.length, 3);
  assert.equal(transcript!.messages[0]!.role, "user");
  assert.equal(transcript!.messages[0]!.text, "Add a health check endpoint to the API");
  assert.deepEqual(transcript!.changedFiles, ["/tmp/fixture-project/src/health.ts"]);
});

test("readSession() returns undefined for an unknown id", async () => {
  const transcript = await kiroAdapter.readSession("does-not-exist");
  assert.equal(transcript, undefined);
});

test("resumeCommand() and launchWithContext() return shell commands", () => {
  assert.equal(kiroAdapter.resumeCommand("abc123", "/tmp"), "kiro-cli --resume-id abc123");
  assert.match(kiroAdapter.launchWithContext("/tmp/HANDOFF.md", "/tmp"), /Read \/tmp\/HANDOFF\.md and continue/);
});
