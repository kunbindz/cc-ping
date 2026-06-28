# Brief for Codex — own `packages/hook/`

> Paste this to Codex (or read it if you ARE Codex). You own **only** `packages/hook/`.
> Do not touch `packages/overlay/`. Read [CONTRACT.md](CONTRACT.md) before writing code —
> every field name / port / exit-code rule there is mandatory. [CLAUDE.md](CLAUDE.md) is the
> repo map; [MASTER_PLAN.md](MASTER_PLAN.md) has the per-phase acceptance criteria.

## Your mission
Build the Claude Code hook handler: a **zero-dependency Node `.mjs`** package, published to
npm as `cc-ping`, installable via `npx cc-ping install`. It fires on `Stop` / `SubagentStop`
/ `Notification`, rings the terminal bell synchronously, and fire-and-forget POSTs an event to
the overlay.

## Non-negotiable rules (from CONTRACT §3)
1. **Always `exit 0`.** Never throw, never non-zero. A crashing hook must never interrupt Claude.
2. `stop_hook_active === true` → `exit 0` immediately, emit nothing.
3. Unparseable/empty stdin → behave as `{}`, never throw.
4. **Zero runtime dependencies.** Use only Node built-ins (`node:fs`, `node:path`, `node:http`,
   `node:os`, global `fetch`). No npm deps.
5. Bell path is **synchronous** (`{"terminalSequence":""}`, no `async`). POST path is
   detached/fire-and-forget with **≤300ms** timeout, errors swallowed.

## What's already done for you
- `lib/read-stdin.mjs` and the Phase-1 core of `notify.mjs` are **seeded and verified working**
  on Windows + Node 24 (spike passed all 4 acceptance echoes). Build on them; don't rewrite.
- `package.json`, file stubs, and a `test/` folder are scaffolded.

## Your phases (build sequentially, commit each)
### Phase 1 — finish the MVP
- Confirm `notify.mjs` + `read-stdin.mjs` pass CONTRACT §3 (they do). 
- Write **`install.mjs`**: read `~/.claude/settings.json` (create if absent), **merge** (not
  overwrite) hook blocks for `Stop`, `SubagentStop`, `Notification` pointing at the absolute
  path of `notify.mjs`. Must be **idempotent** (running twice doesn't duplicate). Preserve any
  existing user hooks.
- Write **`cli.mjs`** dispatcher so `cc-ping install` / `cc-ping uninstall` work; wire `bin` in
  package.json.
- Write **`test/run.mjs`**: run the CONTRACT §3 acceptance echoes and assert outputs/exit codes.
- **Acceptance:** see MASTER_PLAN Phase 1.

### Phase 2 — config + threshold + duration
- `lib/config.mjs`: read `~/.cc-ping/config.json`, fall back to defaults **per-key** (CONTRACT §4).
- `lib/duration.mjs`: estimate `durationMs` by parsing `transcript_path` (JSONL): timestamp of
  the most recent `user` message → last message. Unreadable → `null`. Skip malformed lines.
- Update `notify.mjs`: silent if `durationMs != null && durationMs < minDurationMs`; silent if
  `project ∈ quietProjects`; `Notification` always notifies (ignores threshold).
- **Acceptance:** MASTER_PLAN Phase 2.

### Phase 5 (hook side) — wire the POST
- `lib/post-event.mjs`: POST `/event` to `127.0.0.1:<overlayPort>` with the body from CONTRACT
  §2, ≤300ms timeout, swallow all errors, no retry, do not block turn end.
- `notify.mjs`: after deciding to notify, emit the bell (Path A) AND call post-event (Path B).
  Map `hook_event_name`→`type` per CONTRACT §3. Respect `config.bell` / `config.overlay`.
- **Acceptance:** MASTER_PLAN Phase 5 (overlay up → bell + POST; overlay down → bell only, fast).

### Phase 6 (hook side)
- `uninstall.mjs`: remove **only** cc-ping's hook entries from `~/.claude/settings.json`, leave
  other user hooks intact. npm publish metadata in `package.json`.

## How to test without the overlay
The overlay is built separately. To test Path B in isolation, run any local listener on 47321
(e.g. a 5-line `node:http` server returning 204) — or just confirm the POST fails silently when
nothing is listening (that's a required behavior anyway).

## Definition of done for your part
All MASTER_PLAN acceptance criteria for Phases 1, 2, 5 (hook side), 6 (hook side) pass via
`pnpm test:hook` and a manual `npx cc-ping install` on a clean `~/.claude/settings.json`.
