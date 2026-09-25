# tupa

[![npm version](https://img.shields.io/npm/v/%40zidniryi%2Ftupa.svg)](https://www.npmjs.com/package/@zidniryi/tupa)
[![GitHub release](https://img.shields.io/github/v/release/zidniryi/tupa)](https://github.com/zidniryi/tupa/releases)
[![license: MIT](https://img.shields.io/badge/license-MIT-22c55e.svg)](https://github.com/zidniryi/tupa/blob/main/LICENSE)
[![AI agent CLI](https://img.shields.io/badge/%F0%9F%A4%96-AI%20agent%20CLI-8b5cf6.svg)](https://github.com/zidniryi/tupa)

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
$ tupa list
✔ Found 5 sessions across 4 tools
1. [cursor-agent] Landing Page Redesign  10m ago
   f1a2b3c4-5d6e-4f70-8a9b-1c2d3e4f5061
2. [claude-code] Fix Stripe Webhook Retry Bug  18h ago
   a7b8c9d0-1e2f-4a3b-9c8d-7e6f5a4b3c21
3. [claude-code] Add Dark Mode Toggle  6d ago
   3c4d5e6f-7a8b-4c9d-8e7f-6a5b4c3d2e1f
4. [opencode] Refactor Auth Middleware  6d ago
   b2c3d4e5-6f7a-4b8c-9d0e-1f2a3b4c5d6e
5. [codex] Set Up CI Pipeline for Monorepo  10mo ago
   019a6c3f-1234-7d60-81cd-000000000000
```

## Install

```bash
npm i -g @zidniryi/tupa
```

## Usage

```bash
tupa                    # animated welcome screen with a quick command overview
tupa list               # recent sessions for the current directory
tupa list --json        # machine-readable, no banner/spinner
tupa save               # write HANDOFF.md for the most recent session
tupa resume             # resume the most recent session in its own tool
tupa resume <id>        # resume a specific session
tupa resume --to codex  # write HANDOFF.md and switch tools
tupa support            # show which AI coding agent CLIs are supported
```

## Supported tools

Run `tupa support` to check what's detected on your machine.

| Tool | Session data read from | Status |
| --- | --- | --- |
| Claude Code | `~/.claude/projects` | ✅ Supported |
| Antigravity CLI (`agy`) | `~/.gemini/antigravity-cli` | ✅ Supported |
| opencode | `~/.local/share/opencode` | ✅ Supported |
| Codex CLI | `~/.codex/sessions` | ✅ Supported |
| Cursor CLI | `~/.cursor/chats`, `~/.cursor/projects/*/agent-transcripts` | ✅ Supported |
| Kilo CLI | `~/.local/share/kilo` | ✅ Supported |
| Gemini CLI | — | 🔜 Planned |
| GitHub Copilot CLI | — | 🔜 Planned |
| Kimi Code CLI | — | 🔜 Planned |
| Qwen Code | — | 🔜 Planned |
| Goose | — | 🔜 Planned |
| Aider | — | 🔜 Planned |
| Factory Droid | — | 🔜 Planned |
| Sourcegraph Amp | — | 🔜 Planned |
| Kiro CLI | — | 🔜 Planned |
| Crush | — | 🔜 Planned |
| Pi | — | 🔜 Planned |
| Mistral Vibe | — | 🔜 Planned |

New adapters are added one at a time and verified against real local session data
before shipping. All of them are read-only — no network calls, no telemetry. The
opencode and Kilo adapters (schema-compatible forks that share one implementation)
use `node:sqlite`, which needs Node >= 22.5; on older Node they just show as "not
detected" instead of failing.

## Development

```bash
npm i
npm run build      # tsup src/cli.ts --format esm --clean
npm run typecheck
npm test
npm link           # test locally as `tupa`
```

## Contributing

Bug reports, adapter requests, and PRs are welcome — see
[CONTRIBUTING.md](CONTRIBUTING.md) for the dev setup and the step-by-step guide
for adding a new adapter. To report a bug or ask for a new tool to be supported,
[open an issue](https://github.com/zidniryi/tupa/issues/new/choose).
