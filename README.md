# agentresume

Save and resume AI coding agent sessions across tools — Claude Code, Codex, opencode,
Antigravity/Gemini, Copilot CLI, and more — without copy-pasting context by hand.

## Install

```bash
npm i -g agentresume
```

## Usage

```bash
agentresume list              # recent sessions for the current directory
agentresume list --json       # machine-readable, no banner/spinner
agentresume save              # write HANDOFF.md for the most recent session
agentresume resume            # resume the most recent session in its own tool
agentresume resume <id>       # resume a specific session
agentresume resume --to codex # write HANDOFF.md and switch tools
```

## Status

Early scaffold. Only the Claude Code adapter is implemented so far; more tools are
added one at a time (see `CLAUDE.md`). Read-only access to other tools' session
storage, no network calls, no telemetry.

## Development

```bash
npm i
npm run build      # tsup src/cli.ts --format esm --clean
npm run typecheck
npm test
npm link           # test locally as `agentresume`
```
