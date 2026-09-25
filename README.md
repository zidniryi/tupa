# tupa

*Stash it. Resume it. Any AI agent.*

Stash and resume AI agent sessions across Claude Code, Codex, opencode, and more —
without copy-pasting context by hand.

## Install

```bash
npm i -g tupa
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

Early scaffold. Claude Code and Antigravity CLI (`agy`) adapters are implemented;
more tools are added one at a time. Read-only access to other tools' session
storage, no network calls, no telemetry.

## Development

```bash
npm i
npm run build      # tsup src/cli.ts --format esm --clean
npm run typecheck
npm test
npm link           # test locally as `tupa`
```
