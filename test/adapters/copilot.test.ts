import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// node:sqlite needs Node >= 22.5; the adapter itself tolerates its absence (detect()
// just returns false), so skip this whole fixture setup rather than fail on older Node.
let DatabaseSync: new (path: string, opts: object) => {
  exec(sql: string): void;
  close(): void;
};
try {
  ({ DatabaseSync } = await import("node:sqlite"));
} catch {
  test("copilot adapter (skipped: node:sqlite unavailable on this Node version)", () => {});
  process.exit(0);
}

const dir = mkdtempSync(join(tmpdir(), "tupa-copilot-test-"));
process.env.TUPA_COPILOT_DIR = dir;
after(() => rmSync(dir, { recursive: true, force: true }));

const db = new DatabaseSync(join(dir, "session-store.db"), {});
db.exec(`
  CREATE TABLE sessions (id TEXT, cwd TEXT, repository TEXT, host_type TEXT, branch TEXT, summary TEXT, created_at TEXT, updated_at TEXT);
  INSERT INTO sessions VALUES ('sess-fixture1', '/tmp/fixture-project', NULL, NULL, NULL, 'Add a health check endpoint', '2026-01-01T00:00:01.000Z', '2026-01-01T00:00:02.000Z');
`);
db.close();

const sessionStateDir = join(dir, "session-state", "sess-fixture1");
mkdirSync(sessionStateDir, { recursive: true });
const events = [
  { type: "session.start", data: { context: { cwd: "/tmp/fixture-project" } }, id: "e0", timestamp: "t0", parentId: null },
  { type: "user.message", data: { content: "Add a health check endpoint" }, id: "e1", timestamp: "t1", parentId: "e0" },
  { type: "garbage", notJson: undefined },
  { type: "assistant.message", data: { content: "Added it.", toolRequests: [] }, id: "e2", timestamp: "t2", parentId: "e1" },
  {
    type: "assistant.message",
    data: {
      content: "",
      toolRequests: [{ toolCallId: "call_1", name: "edit", arguments: { path: "/tmp/fixture-project/src/health.ts" } }],
    },
    id: "e3",
    timestamp: "t3",
    parentId: "e2",
  },
];
writeFileSync(sessionStateDir + "/events.jsonl", events.map((e) => JSON.stringify(e)).join("\n") + "\nnot json\n");

const { copilotAdapter } = await import("../../src/adapters/copilot.js");

test("detect() finds the fixture session-store.db", async () => {
  assert.equal(await copilotAdapter.detect(), true);
});

test("listSessions() reads title, cwd and updatedAt from the sessions table", async () => {
  const sessions = await copilotAdapter.listSessions("/tmp/fixture-project");
  assert.equal(sessions.length, 1);
  const session = sessions[0]!;
  assert.equal(session.id, "sess-fixture1");
  assert.equal(session.tool, "copilot");
  assert.equal(session.title, "Add a health check endpoint");
  assert.equal(session.updatedAt.toISOString(), "2026-01-01T00:00:02.000Z");
});

test("listSessions() on an unmatched directory returns no sessions", async () => {
  const sessions = await copilotAdapter.listSessions("/tmp/does-not-exist");
  assert.deepEqual(sessions, []);
});

test("readSession() reads user/assistant messages, skips bad lines, and collects changed files", async () => {
  const transcript = await copilotAdapter.readSession("sess-fixture1");
  assert.ok(transcript);
  assert.equal(transcript!.cwd, "/tmp/fixture-project");
  assert.equal(transcript!.messages.length, 3);
  assert.equal(transcript!.messages[0]!.role, "user");
  assert.equal(transcript!.messages[0]!.text, "Add a health check endpoint");
  assert.equal(transcript!.messages[2]!.toolCalls[0]!.name, "edit");
  assert.deepEqual(transcript!.changedFiles, ["/tmp/fixture-project/src/health.ts"]);
});

test("readSession() returns undefined for an unknown id", async () => {
  const transcript = await copilotAdapter.readSession("does-not-exist");
  assert.equal(transcript, undefined);
});

test("resumeCommand() and launchWithContext() return shell commands", () => {
  assert.equal(copilotAdapter.resumeCommand("abc123", "/tmp"), "copilot --resume=abc123");
  assert.match(copilotAdapter.launchWithContext("/tmp/HANDOFF.md", "/tmp"), /Read \/tmp\/HANDOFF\.md and continue/);
});
