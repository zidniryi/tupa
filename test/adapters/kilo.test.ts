import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
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
  test("kilo adapter (skipped: node:sqlite unavailable on this Node version)", () => {});
  process.exit(0);
}

const dir = mkdtempSync(join(tmpdir(), "tupa-kilo-test-"));
process.env.TUPA_KILO_DIR = dir;
after(() => rmSync(dir, { recursive: true, force: true }));

const db = new DatabaseSync(join(dir, "kilo.db"), {});
db.exec(`
  CREATE TABLE session (id TEXT, directory TEXT, title TEXT, time_created INTEGER, time_updated INTEGER);
  CREATE TABLE message (id TEXT, session_id TEXT, time_created INTEGER, time_updated INTEGER, data TEXT);
  CREATE TABLE part (id TEXT, message_id TEXT, session_id TEXT, time_created INTEGER, time_updated INTEGER, data TEXT);

  INSERT INTO session VALUES ('ses_fixture1', '/tmp/fixture-project', 'Add a health check endpoint', 1000, 2000);

  INSERT INTO message VALUES ('msg_1', 'ses_fixture1', 1000, 1000, '{"role":"user"}');
  INSERT INTO part VALUES ('prt_1', 'msg_1', 'ses_fixture1', 1000, 1000, '{"type":"text","text":"Add a health check endpoint"}');

  INSERT INTO message VALUES ('msg_2', 'ses_fixture1', 1500, 1500, '{"role":"assistant"}');
  INSERT INTO part VALUES ('prt_2', 'msg_2', 'ses_fixture1', 1500, 1500, '{"type":"text","text":"Added it."}');
  INSERT INTO part VALUES ('prt_3', 'msg_2', 'ses_fixture1', 1600, 1600,
    '{"type":"tool","tool":"edit","state":{"status":"completed","input":{"filePath":"/tmp/fixture-project/src/health.ts"}}}');
`);
db.close();

const { kiloAdapter } = await import("../../src/adapters/kilo.js");

test("detect() finds the fixture kilo.db", async () => {
  assert.equal(await kiloAdapter.detect(), true);
});

test("listSessions() reads title and updatedAt from the session table", async () => {
  const sessions = await kiloAdapter.listSessions("/tmp/fixture-project");
  assert.equal(sessions.length, 1);
  const session = sessions[0]!;
  assert.equal(session.id, "ses_fixture1");
  assert.equal(session.tool, "kilo");
  assert.equal(session.title, "Add a health check endpoint");
});

test("readSession() joins message + part rows and collects changed files", async () => {
  const transcript = await kiloAdapter.readSession("ses_fixture1");
  assert.ok(transcript);
  assert.equal(transcript!.messages.length, 2);
  assert.deepEqual(transcript!.changedFiles, ["/tmp/fixture-project/src/health.ts"]);
});

test("resumeCommand() and launchWithContext() use the kilo binary", () => {
  assert.equal(kiloAdapter.resumeCommand("ses_fixture1", "/tmp"), "kilo -s ses_fixture1");
  assert.match(kiloAdapter.launchWithContext("/tmp/HANDOFF.md", "/tmp"), /Read \/tmp\/HANDOFF\.md and continue/);
});
