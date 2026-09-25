#!/usr/bin/env node
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { Command } from "commander";
import { adapters } from "./adapters/index.js";
import { buildHandoffMarkdown, writeHandoff } from "./handoff.js";
import { PLANNED_TOOLS } from "./supported-tools.js";
import type { Adapter, SessionSummary } from "./types.js";
import { badge, banner, configureUi, fail, ok, printSessions, printSupport, welcome, withSpinner } from "./ui.js";

const VERSION = "0.1.0";

async function detectAdapters(): Promise<Adapter[]> {
  const flags = await Promise.all(adapters.map((a) => a.detect()));
  return adapters.filter((_, i) => flags[i]);
}

async function collectSessions(cwd: string): Promise<SessionSummary[]> {
  const active = await detectAdapters();
  const lists = await Promise.all(active.map((a) => a.listSessions(cwd)));
  return lists.flat().sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}

function adapterFor(tool: string): Adapter | undefined {
  return adapters.find((a) => a.id === tool);
}

function runInteractive(command: string, cwd: string): void {
  const child = spawn(command, { cwd, shell: true, stdio: "inherit" });
  child.on("exit", (code) => {
    process.exitCode = code ?? 0;
  });
  child.on("error", (err) => {
    fail(`Failed to launch: ${err.message}`);
    process.exitCode = 1;
  });
}

const program = new Command();
program
  .name("tupa")
  .description("Stash and resume AI agent sessions across Claude Code, Codex, opencode, and more.")
  .version(VERSION)
  .option("--no-color", "disable colored/animated output")
  .option("--quiet", "skip the startup banner");

program.hook("preAction", (thisCommand) => {
  const opts = thisCommand.opts();
  const colorExplicit = thisCommand.getOptionValueSource("color") === "cli";
  configureUi({ color: colorExplicit ? Boolean(opts.color) : undefined, quiet: Boolean(opts.quiet) });
});

program
  .command("list")
  .description("List recent sessions for the current directory")
  .option("--json", "print machine-readable JSON only, no banner or spinner")
  .action(async (opts: { json?: boolean }) => {
    const cwd = process.cwd();
    if (!opts.json) await banner(VERSION, cwd);

    const names = adapters.map((a) => a.name).join(", ");
    const sessions = opts.json
      ? await collectSessions(cwd)
      : await withSpinner(`Scanning ${names}`, () => collectSessions(cwd));

    if (!opts.json) {
      const toolCount = new Set(sessions.map((s) => s.tool)).size;
      ok(`Found ${sessions.length} session${sessions.length === 1 ? "" : "s"} across ${toolCount} tool${toolCount === 1 ? "" : "s"}`);
    }
    printSessions(sessions, Boolean(opts.json));
  });

program
  .command("save")
  .description("Write HANDOFF.md summarizing the most recent session in this directory")
  .option("--session <id>", "session id to save (defaults to the most recent)")
  .option("--out <path>", "output path for the handoff file", "HANDOFF.md")
  .action(async (opts: { session?: string; out: string }) => {
    const cwd = process.cwd();
    await banner(VERSION, cwd);

    const sessions = await withSpinner("Scanning for the most recent session", () => collectSessions(cwd));
    const target = opts.session ? sessions.find((s) => s.id === opts.session) : sessions[0];
    if (!target) {
      fail(opts.session ? `No session found with id ${opts.session}` : "No sessions found in this directory.");
      process.exitCode = 1;
      return;
    }

    const adapter = adapterFor(target.tool);
    if (!adapter) {
      fail(`No adapter registered for tool "${target.tool}"`);
      process.exitCode = 1;
      return;
    }

    await withSpinner(`Writing ${opts.out}`, async () => {
      const transcript = await adapter.readSession(target.id);
      if (!transcript) throw new Error(`Could not read session ${target.id}`);
      writeHandoff(resolve(cwd, opts.out), buildHandoffMarkdown({ session: target, transcript }));
    });
    ok(`Saved handoff for "${target.title}" (${badge(target.tool)}) to ${opts.out}`);
  });

program
  .command("resume")
  .argument("[id]", "session id to resume (defaults to the most recent)")
  .option("--to <tool>", "resume in a different tool using HANDOFF.md context")
  .description("Resume a saved session, in the same tool or a different one")
  .action(async (id: string | undefined, opts: { to?: string }) => {
    const cwd = process.cwd();
    await banner(VERSION, cwd);

    const sessions = await withSpinner("Scanning for sessions", () => collectSessions(cwd));
    const target = id ? sessions.find((s) => s.id === id) : sessions[0];
    if (!target) {
      fail(id ? `No session found with id ${id}` : "No sessions found in this directory.");
      process.exitCode = 1;
      return;
    }

    if (opts.to && opts.to !== target.tool) {
      const destAdapter = adapterFor(opts.to);
      const sourceAdapter = adapterFor(target.tool);
      if (!destAdapter) {
        fail(`Unknown or unsupported tool "${opts.to}"`);
        process.exitCode = 1;
        return;
      }
      if (!sourceAdapter) {
        fail(`No adapter registered for tool "${target.tool}"`);
        process.exitCode = 1;
        return;
      }

      const handoffPath = resolve(cwd, "HANDOFF.md");
      await withSpinner("Writing HANDOFF.md", async () => {
        const transcript = await sourceAdapter.readSession(target.id);
        if (!transcript) throw new Error(`Could not read session ${target.id}`);
        writeHandoff(handoffPath, buildHandoffMarkdown({ session: target, transcript }));
      });
      ok(`Switching to ${destAdapter.name} with handoff context`);
      runInteractive(destAdapter.launchWithContext(handoffPath, cwd), cwd);
      return;
    }

    const adapter = adapterFor(target.tool);
    if (!adapter) {
      fail(`No adapter registered for tool "${target.tool}"`);
      process.exitCode = 1;
      return;
    }
    ok(`Resuming "${target.title}" in ${adapter.name}`);
    runInteractive(adapter.resumeCommand(target.id, cwd), cwd);
  });

program
  .command("support")
  .alias("about")
  .description("Show which AI coding agent CLIs are supported")
  .action(async () => {
    await banner(VERSION, process.cwd());
    console.log("");
    const detected = await Promise.all(adapters.map((a) => a.detect()));
    const implemented = adapters.map((a, i) => ({ id: a.id, name: a.name, detected: detected[i] ?? false }));
    printSupport(implemented, PLANNED_TOOLS);
  });

// Bare `tupa` with no args/flags: show the animated welcome screen instead of
// commander's default (plain) help.
if (process.argv.length === 2) {
  await welcome(VERSION);
} else {
  await program.parseAsync(process.argv);
}
