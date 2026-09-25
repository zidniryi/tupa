# Contributing to tupa

Thanks for considering a contribution. `tupa` is small and stays that way on purpose —
one adapter per AI coding agent CLI, read-only, no network calls, no telemetry.

## Setup

```bash
git clone https://github.com/zidniryi/tupa.git
cd tupa
npm i
npm run build
npm test
npm link   # try it locally as `tupa`
```

Requires Node >= 18 (the opencode and Kilo adapters specifically need Node >= 22.5
for `node:sqlite`; on older Node they just report as "not detected" instead of
crashing — that's intentional, keep it that way if you touch them).

## Before opening a PR

```bash
npm run typecheck
npm run build
npm test
```

All three must pass. There's also a regression test
(`test/build/dist-output.test.ts`) that inspects the built `dist/cli.js` — run
`npm run build` before `npm test` if you've touched an adapter that dynamically
imports a Node built-in, so it actually checks something.

## Adding a new adapter

This is the contribution we get most often, so here's the exact checklist:

1. **Find the tool's real local session storage on a machine that actually has it
   installed and has used it.** Don't guess from documentation alone — every
   existing adapter in this repo was built by inspecting real session files/DB
   rows first, and every one of them turned up at least one surprise (wrong
   assumed field name, an injected system message that needed filtering, a
   registry-cache-style gotcha, etc.). If you don't have the tool installed, open
   an issue instead of a PR — see the adapter-request template.
2. Implement `src/adapters/<tool>.ts`, exporting an object matching the `Adapter`
   interface in `src/types.ts`:
   - `detect()` — cheap existence check (e.g. does the tool's data dir exist).
   - `listSessions(cwd)` — recent sessions for a directory: id, title, updatedAt,
     sourcePath.
   - `readSession(id)` — normalized transcript: messages (role + text +
     condensed tool calls) and `changedFiles` if the format exposes file paths
     cleanly. It's fine to leave `changedFiles` empty if the tool's format
     doesn't expose structured file paths (see `src/adapters/codex.ts` for why).
   - `resumeCommand(id, cwd)` — the tool's own native resume command. Prefer
     testing this for real over trusting older docs; command flags change.
   - `launchWithContext(handoffPath, cwd)` — command to open the tool with a
     `HANDOFF.md` as context, for switching tools.
3. **Parse tolerantly.** Skip lines/records you can't parse instead of throwing;
   wrap risky reads in try/catch; never let one malformed session break the
   whole `list`/`save` command. See any existing adapter for the pattern.
4. If another tool already has a schema-compatible fork (this has happened once
   already — Kilo CLI turned out to be schema-identical to opencode), share the
   implementation instead of duplicating it. See
   `src/adapters/lib/opencode-family.ts`.
5. Register it in `src/adapters/index.ts`, add a badge color in `src/ui.ts`
   (`TOOL_COLORS`), and remove it from `PLANNED_TOOLS` in
   `src/supported-tools.ts` if it was listed there.
6. Add tests in `test/adapters/<tool>.test.ts` against small fixtures in
   `test/fixtures/<tool>/` (or a fixture DB built on the fly, like
   `test/adapters/opencode.test.ts` does). **Never commit real session data** —
   it can contain secrets, and fixtures should be the minimum needed to exercise
   the parser.
7. Update the README's "Supported tools" table.

## Code conventions

- TypeScript strict mode, ESM, Node >= 18 unless the adapter itself needs newer
  (state that in code, tolerantly — don't just bump the whole package's
  `engines`).
- No heavy dependencies. UI libraries are limited to what's already in
  `src/ui.ts` (picocolors, ora, gradient-string). `node:sqlite` is fine for
  adapters that need SQLite; don't add `better-sqlite3` or similar.
- Adapters and `src/handoff.ts` never print directly — they return data, and
  `src/cli.ts` renders it through `src/ui.ts`.
- Before writing to `HANDOFF.md`, redact anything that looks like a secret (see
  `redactSecrets` in `src/util.ts`).
- Semver: patch for parser fixes, minor for a new adapter, major for a change to
  the `HANDOFF.md` format.

## Reporting a bug or requesting a new adapter

Open an issue — see the templates under "New issue" on GitHub. For a new-adapter
request, include the tool's binary name and, if you know it, where it stores
session data locally; that's usually the hardest part to find.
