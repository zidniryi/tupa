import pc from "picocolors";
import gradient from "gradient-string";
import ora from "ora";
import type { SessionSummary } from "./types.js";
import { relativeAge, truncate } from "./util.js";

let colorEnabled =
  process.stdout.isTTY === true && process.env.NO_COLOR === undefined && process.env.TERM !== "dumb";
let quiet = false;

/** Called once from cli.ts after parsing global flags. `color` overrides auto-detection only when explicitly set. */
export function configureUi(opts: { color?: boolean; quiet?: boolean }): void {
  if (opts.color !== undefined) colorEnabled = opts.color;
  if (opts.quiet !== undefined) quiet = opts.quiet;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// A squirrel face: pointed ears on top, two eyes, and round puffed cheek pouches
// at the chin — where a squirrel stashes its acorns, a nod to "save".
const MASCOT = [
  "  ▄█▄    ▄█▄  ",
  "▐████████████▌",
  "▐█ ◉ ████ ◉ █▌",
  "▐███▄█▀▀█▄███▌",
  " ▀██▄◖██◗▄██▀ ",
];
const BODY_GLYPHS = new Set(["█", "▄", "▀", "▐", "▌"]);
const CHEEK_GLYPHS = new Set(["◖", "◗"]);

function colorizeMascotLine(line: string): string {
  if (!colorEnabled) return line;
  let out = "";
  for (const ch of line) {
    if (CHEEK_GLYPHS.has(ch)) out += pc.yellow(ch);
    else if (BODY_GLYPHS.has(ch)) out += pc.green(ch);
    else out += ch;
  }
  return out;
}

export async function banner(version: string, cwd: string): Promise<void> {
  if (quiet) return;
  const width = Math.max(...MASCOT.map((l) => l.length));
  const wordmark = colorEnabled ? gradient(["#22c55e", "#eab308"])("tupa") : "tupa";
  const dim = (s: string) => (colorEnabled ? pc.dim(s) : s);
  const suffixes = [wordmark, dim(`v${version}`), dim(cwd)];
  for (let i = 0; i < MASCOT.length; i++) {
    const line = colorizeMascotLine(MASCOT[i]!.padEnd(width));
    const suffix = suffixes[i] ?? "";
    console.log(suffix ? `${line} ${suffix}` : line);
    if (colorEnabled) await sleep(25);
  }
}

const TAGLINE = "Stash it. Resume it. Any AI agent.";
const COMMANDS: [string, string][] = [
  ["list", "List recent sessions for the current directory"],
  ["save", "Write HANDOFF.md for the most recent session"],
  ["resume [id]", "Resume a session — add --to <tool> to switch tools"],
  ["support", "Show which AI coding agent CLIs are supported"],
];

/** Shown for a bare `tupa` invocation, in place of commander's default help. */
export async function welcome(version: string): Promise<void> {
  if (quiet) {
    console.log(`tupa — ${TAGLINE}`);
    return;
  }

  if (colorEnabled) {
    const spinner = ora({ text: "waking up", spinner: "dots" }).start();
    await sleep(300);
    spinner.stop();
  }

  await banner(version, process.cwd());

  console.log("");
  console.log(colorEnabled ? pc.italic(pc.dim(TAGLINE)) : TAGLINE);
  console.log("");
  console.log(colorEnabled ? pc.bold("Commands") : "Commands");
  for (const [cmd, desc] of COMMANDS) {
    const label = colorEnabled ? pc.cyan(cmd.padEnd(14)) : cmd.padEnd(14);
    console.log(`  ${label} ${colorEnabled ? pc.dim(desc) : desc}`);
    if (colorEnabled) await sleep(40);
  }

  console.log("");
  const hint = "Run `tupa <command> --help` for details, or `tupa list` to get started.";
  console.log(colorEnabled ? pc.dim(hint) : hint);
}

const TOOL_COLORS: Record<string, (s: string) => string> = {
  "claude-code": (s) => pc.bgYellow(pc.black(s)),
  codex: (s) => pc.bgGreen(pc.black(s)),
  opencode: (s) => pc.bgCyan(pc.black(s)),
  agy: (s) => pc.bgBlue(pc.white(s)),
  copilot: (s) => pc.bgMagenta(pc.white(s)),
  "cursor-agent": (s) => pc.bgRed(pc.white(s)),
};

export function badge(tool: string): string {
  if (!colorEnabled) return `[${tool}]`;
  const colorFn = TOOL_COLORS[tool] ?? ((s: string) => pc.bgWhite(pc.black(s)));
  return colorFn(` ${tool} `);
}

export function printSessions(sessions: SessionSummary[], jsonMode = false): void {
  if (jsonMode) {
    const plain = sessions.map((s) => ({ ...s, updatedAt: s.updatedAt.toISOString() }));
    console.log(JSON.stringify(plain, null, 2));
    return;
  }
  if (sessions.length === 0) {
    console.log(colorEnabled ? pc.dim("No sessions found.") : "No sessions found.");
    return;
  }
  const dim = (s: string) => (colorEnabled ? pc.dim(s) : s);
  sessions.forEach((s, i) => {
    console.log(`${dim(`${i + 1}.`)} ${badge(s.tool)} ${truncate(s.title, 48)}  ${dim(relativeAge(s.updatedAt))}`);
    console.log(`   ${dim(s.id)}`);
  });
}

export async function withSpinner<T>(text: string, fn: () => Promise<T>): Promise<T> {
  if (!colorEnabled) {
    console.log(text);
    try {
      return await fn();
    } catch (err) {
      console.error(`✖ ${text} failed`);
      throw err;
    }
  }
  const spinner = ora(text).start();
  try {
    const result = await fn();
    spinner.succeed();
    return result;
  } catch (err) {
    spinner.fail();
    throw err;
  }
}

export interface AdapterStatusRow {
  id: string;
  name: string;
  detected: boolean;
}

export interface PlannedToolRow {
  id: string;
  name: string;
}

export function printSupport(implemented: AdapterStatusRow[], planned: PlannedToolRow[]): void {
  const dim = (s: string) => (colorEnabled ? pc.dim(s) : s);
  const green = (s: string) => (colorEnabled ? pc.green(s) : s);

  console.log(colorEnabled ? pc.bold("Supported now") : "Supported now");
  for (const tool of implemented) {
    const mark = tool.detected ? green("✔") : dim("○");
    const status = tool.detected ? "detected on this machine" : "not detected on this machine";
    console.log(`  ${mark} ${tool.name.padEnd(18)} ${dim(status)}`);
  }

  console.log("");
  console.log(colorEnabled ? pc.bold("Planned, not yet supported") : "Planned, not yet supported");
  for (const tool of planned) {
    console.log(`  ${dim("○")} ${dim(tool.name)}`);
  }

  console.log("");
  console.log(dim("Adapters are read-only and added one at a time."));
}

export function ok(message: string): void {
  console.log(colorEnabled ? `${pc.green("✔")} ${message}` : `✔ ${message}`);
}

export function warn(message: string): void {
  console.log(colorEnabled ? `${pc.yellow("!")} ${message}` : `! ${message}`);
}

export function fail(message: string): void {
  console.error(colorEnabled ? `${pc.red("✖")} ${message}` : `✖ ${message}`);
}
