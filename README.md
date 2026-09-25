# tupa

[![npm version](https://img.shields.io/npm/v/%40zidniryi%2Ftupa.svg)](https://www.npmjs.com/package/@zidniryi/tupa)
[![GitHub release](https://img.shields.io/github/v/release/zidniryi/tupa)](https://github.com/zidniryi/tupa/releases)
[![license](https://img.shields.io/npm/l/%40zidniryi%2Ftupa.svg)](https://github.com/zidniryi/tupa/blob/main/LICENSE)

*Stash it. Resume it. Any AI agent.*

Stash and resume AI agent sessions across Claude Code, Codex, opencode, and more —
without copy-pasting context by hand.

## Preview

```
$ tupa
  ▄█▄    ▄█▄   tupa
▐████████████▌ v1.4.0
▐█ ◉ ████ ◉ █▌ /Users/mac/Project
▐███▄█▀▀█▄███▌
 ▀██▄◖██◗▄██▀

Stash it. Resume it. Any AI agent.

Commands
  list           List recent sessions for the current directory
  save           Write HANDOFF.md for the most recent session
  resume [id]    Resume a session — add --to <tool> to switch tools
  support        Show which AI coding agent CLIs are supported

Run `tupa <command> --help` for details, or `tupa list` to get started.
```

```
$ tupa support
Supported now
  ✔ Claude Code        detected on this machine
  ✔ Antigravity CLI    detected on this machine
  ✔ opencode           detected on this machine
  ✔ Codex CLI          detected on this machine
  ✔ Cursor CLI         detected on this machine
  ✔ Kilo CLI           detected on this machine

Planned, not yet supported
  ○ Gemini CLI
  ○ GitHub Copilot CLI
  ○ Kimi Code CLI
  ○ Qwen Code
  ○ Goose
  ○ Aider
  ○ Factory Droid
  ○ Sourcegraph Amp
  ○ Kiro CLI
  ○ Crush
  ○ Pi
  ○ Mistral Vibe

Adapters are read-only and added one at a time.
```

## Install

```bash
npm i -g @zidniryi/tupa
```

## Usage

```bash
tupa list              # recent sessions for the current directory
tupa list --json       # machine-readable, no banner/spinner
tupa save              # write HANDOFF.md for the most recent session
tupa resume            # resume the most recent session in its own tool
tupa resume <id>       # resume a specific session
tupa resume --to codex # write HANDOFF.md and switch tools
tupa support           # show which AI coding agent CLIs are supported
```

## Status

Early scaffold. Claude Code, Antigravity CLI (`agy`), opencode, Codex CLI, Cursor
CLI, and Kilo CLI adapters are implemented; more tools are added one at a time.
Read-only access to other tools' session storage, no network calls, no telemetry.
The opencode and Kilo adapters (schema-compatible forks, sharing one
implementation) use `node:sqlite`, which needs Node >= 22.5 — on older Node they
just report as "not detected" instead of failing.

## Development

```bash
npm i
npm run build      # tsup src/cli.ts --format esm --clean
npm run typecheck
npm test
npm link           # test locally as `tupa`
```
