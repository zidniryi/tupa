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

const MASCOT = [" ▄▀▀▄ ", " █▄▄█ ", " ▀  ▀ "];

export async function banner(version: string, cwd: string): Promise<void> {
  if (quiet) return;
  const wordmark = colorEnabled ? gradient("cyan", "magenta")("agentresume") : "agentresume";
  const dim = (s: string) => (colorEnabled ? pc.dim(s) : s);
  const lines = [`${MASCOT[0]} ${wordmark}`, `${MASCOT[1]} ${dim(`v${version}`)}`, `${MASCOT[2]} ${dim(cwd)}`];
  for (const line of lines) {
    console.log(line);
    if (colorEnabled) await sleep(70);
  }
}

const TAGLINE = "Save and resume AI coding agent sessions across tools.";
const COMMANDS: [string, string][] = [
  ["list", "List recent sessions for the current directory"],
  ["save", "Write HANDOFF.md for the most recent session"],
  ["resume [id]", "Resume a session — add --to <tool> to switch tools"],
];

/** Shown for a bare `agentresume` invocation, in place of commander's default help. */
export async function welcome(version: string): Promise<void> {
  if (quiet) {
    console.log(`agentresume — ${TAGLINE}`);
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
  const hint = "Run `agentresume <command> --help` for details, or `agentresume list` to get started.";
  console.log(colorEnabled ? pc.dim(hint) : hint);
}

const TOOL_COLORS: Record<string, (s: string) => string> = {
  "claude-code": (s) => pc.bgYellow(pc.black(s)),
  codex: (s) => pc.bgGreen(pc.black(s)),
  opencode: (s) => pc.bgCyan(pc.black(s)),
  agy: (s) => pc.bgBlue(pc.white(s)),
  copilot: (s) => pc.bgMagenta(pc.white(s)),
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

export function ok(message: string): void {
  console.log(colorEnabled ? `${pc.green("✔")} ${message}` : `✔ ${message}`);
}

export function warn(message: string): void {
  console.log(colorEnabled ? `${pc.yellow("!")} ${message}` : `! ${message}`);
}

export function fail(message: string): void {
  console.error(colorEnabled ? `${pc.red("✖")} ${message}` : `✖ ${message}`);
}
