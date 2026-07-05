# CLAUDE.md — Repo guide for AI agents (and humans)

> If you are Claude in a future session, or Codex, or any AI agent picking up this repo:
> **read this file first, then [CONTRACT.md](CONTRACT.md).** This file is the map; the
> contract is the law. [MASTER_PLAN.md](MASTER_PLAN.md) is the original spec (phases,
> acceptance criteria) — read it for the "why" behind each piece.

---

## 1. What this project is

**cc-ping** = desktop notification + mascot pop-out for **Claude Code**.

The problem: Claude Code auto-mode runs long. The user tabs away. When Claude finishes (or
needs input), there's no signal, so the user wastes time checking back. cc-ping fixes this:
when a task ends (or Claude is waiting for input), it plays a "ting" sound and a hand-drawn
mascot runs out from the corner of the desktop to say "come back to work."

Two independent signals, by design (one is a guaranteed fallback for the other):
1. **Terminal bell** — works everywhere (tmux/screen/Windows), race-free, always available.
2. **Mascot + sound** — a background overlay app; richer, but optional. If it's not running,
   you still get the bell.

---

## 2. Architecture in one diagram

```
Claude Code
   │  fires Stop / SubagentStop / Notification hook  (stdin JSON)
   ▼
packages/hook/notify.mjs   (Node, zero-dependency)
   ├─ Path A: stdout JSON { "terminalSequence": "" }, exit 0   → terminal bell (sync, always)
   └─ Path B: POST http://127.0.0.1:47321/event  (fire-and-forget, ≤300ms, swallow errors)
                       │  body: { type, project, sessionId, durationMs, ts, ... }
                       ▼
packages/overlay/   (Tauri: Rust core + TS/HTML frontend, runs in the background / system tray)
   ├─ Rust: loopback HTTP server (GET /health, POST /event) → emits Tauri event to frontend
   ├─ Rust: plays sound by type (rodio) + manages the transparent always-on-top window
   └─ Frontend: mascot animation state machine + on-screen text, then auto-hides
```

The **only** coupling between the two packages is the HTTP/JSON contract and the config
file — both pinned in [CONTRACT.md](CONTRACT.md). This is the seam that lets two agents work
in parallel without touching each other's files.

---

## 3. Directory map

```
cc-ping/
├─ CLAUDE.md            # this file — start here
├─ CONTRACT.md          # FROZEN interface between hook and overlay — the law
├─ MASTER_PLAN.md       # original spec: phases + acceptance criteria
├─ CODEX_BRIEF.md       # task brief handed to Codex (owns packages/hook/)
├─ README.md            # user-facing (stub until Phase 6)
├─ LICENSE              # MIT + mascot-is-original-art note
├─ package.json         # pnpm workspace root
├─ pnpm-workspace.yaml
│
├─ packages/
│  ├─ hook/             # ── OWNED BY CODEX ──  Node, zero-dep. Published to npm as "cc-ping".
│  │  ├─ notify.mjs           # entrypoint hook handler (Phase 1 seed is WORKING + verified)
│  │  ├─ cli.mjs              # `cc-ping <install|uninstall>` dispatcher (stub)
│  │  ├─ install.mjs          # merge hooks into ~/.claude/settings.json (stub)
│  │  ├─ uninstall.mjs        # remove only cc-ping's hook block (stub)
│  │  ├─ lib/
│  │  │  ├─ read-stdin.mjs    # read+parse stdin, never throw (Phase 1 seed, WORKING)
│  │  │  ├─ config.mjs        # read ~/.cc-ping/config.json w/ defaults (stub, Phase 2)
│  │  │  ├─ duration.mjs      # estimate turn duration from transcript JSONL (stub, Phase 2)
│  │  │  └─ post-event.mjs    # fire-and-forget POST to overlay (stub, Phase 5)
│  │  ├─ test/run.mjs         # acceptance test runner (echo-driven, stub)
│  │  └─ package.json
│  │
│  └─ overlay/          # ── OWNED BY CLAUDE ──  Tauri app, system-tray background process.
│     ├─ src-tauri/           # Rust core
│     │  ├─ src/main.rs       # bin entry → calls lib::run()
│     │  ├─ src/lib.rs        # app bootstrap: tray, single-instance, window mgmt + positioning
│     │  ├─ src/server.rs     # loopback HTTP server (tiny_http): GET /health + POST /event
│     │  ├─ src/config.rs     # reads ~/.cc-ping/config.json (port + sound map)
│     │  ├─ src/sound.rs      # plays embedded WAV via rodio (native, avoids webview autoplay)
│     │  ├─ capabilities/default.json  # Tauri 2 permissions for the mascot window
│     │  ├─ icons/            # generated app/tray icons (PNG + ICO)
│     │  ├─ Cargo.toml
│     │  └─ tauri.conf.json   # transparent/alwaysOnTop/skipTaskbar/visible:false window
│     ├─ src/                 # frontend (plain ES modules — NO build step; uses window.__TAURI__)
│     │  ├─ index.html        # <canvas> for the Chef Crab + speech bubble
│     │  ├─ main.js           # listen Tauri "cc-ping-event", coalesce bursts, show/hide window
│     │  ├─ mascot.js         # Chef Crab pixel-art canvas renderer + run/cheer/runout machine
│     │  └─ styles.css
│     ├─ assets/
│     │  └─ sounds/           # ting.wav / soft.wav / buzz.wav (generated, embedded at build)
│     │  (mascot art lives in src/mascot.js as canvas pixel-art — "Chef Crab", not Anthropic)
│     └─ package.json
│
├─ assets/
│  └─ demo.gif          # for README (Phase 6)
└─ .github/workflows/
   └─ release.yml       # build overlay for Win/macOS/Linux, publish hook to npm (Phase 6)
```

---

## 4. Ownership split (who does what)

This repo is built by **two AI agents in parallel**, split along the package seam so they
never edit the same files:

- **Codex owns `packages/hook/`** — Node, zero-dep, fully testable via `echo … | node notify.mjs`.
  Deterministic stdin→stdout→exit-code logic. See [CODEX_BRIEF.md](CODEX_BRIEF.md).
- **Claude owns `packages/overlay/`** — Tauri (Rust + TS), the self-drawn mascot, animation,
  sound, and the platform gotchas (transparent click-through window, audio autoplay).
  Claude also owns Phase 6 (README, demo, release CI) and the repo-level scaffolding.

Integration (Phase 5) is done jointly against [CONTRACT.md](CONTRACT.md): each side tests
against the contract with curl/echo stubs, then Claude wires the real end-to-end.

**Rule for both agents:** if you need to change the seam (a field name, the port, the event
mapping), STOP and update [CONTRACT.md](CONTRACT.md) + both packages together. Don't silently
diverge.

---

## 5. Phase status & sequence

Build sequentially (per MASTER_PLAN.md). Commit after each phase passes acceptance.

| Phase | What | Owner | Status |
|---|---|---|---|
| 0 | Repo scaffold + CONTRACT + CLAUDE.md + spike | Claude | ✅ done |
| 1 | Hook MVP: bell + log on Stop | Codex | ✅ done (notify.mjs + install.mjs; 16/16 acceptance tests pass) |
| 2 | Config + threshold + duration | Codex | ✅ done (config.mjs + duration.mjs; threshold/quietProjects/Notification-bypass verified) |
| 3 | Overlay skeleton + loopback server + tray | Claude | ✅ code complete (Tauri 2; `cargo check` clean. Needs a `tauri dev` run on a GUI machine to visually confirm) |
| 4 | Mascot animation + sound | Claude | ✅ code complete (Chef Crab pixel-art mascot, 3 moods, 3 generated WAVs, burst-coalescing) |
| 5 | Wire hook → overlay (close the loop) | both | 🔶 **contract-compatible on both sides** (hook POSTs the CONTRACT §2 body to :47321; overlay parses + plays + emits). Needs a live end-to-end run (overlay running + a real Claude task) + demo GIF. |
| 6 | Packaging, install, docs, release CI | both | 🔶 hook side done (Codex: `cc-ping install`/`uninstall`, idempotent). Remaining (Claude): top-level README, demo GIF, `.github/workflows/release.yml`. |

Phases 1–2 (Codex, hook) and 3–4 (Claude, overlay) ran **in parallel** after Phase 0 and are
both complete. Phase 5 is the only remaining integration step and needs a GUI machine.

---

## 6. Verified facts (don't re-litigate these)

Verified against current Claude Code docs (code.claude.com/docs/en/hooks.md &
hooks-guide.md) and a live spike on this machine (Windows 11, Node v24.13.1) on 2026-06-28:

- Hooks `Stop` (no matcher), `SubagentStop` (has `agent_type`), `Notification` all exist.
- Hook stdin JSON includes `session_id`, `transcript_path`, `cwd`, `permission_mode`,
  `hook_event_name`, `stop_hook_active`.
- **`terminalSequence`** is a real stdout field; requires Claude Code **≥ v2.1.141**.
  Allowlist: **BEL allowed**; OSC 0/1/2 (title), OSC 9 (notify) allowed; **CSI color, OSC 8
  hyperlink, OSC 52 clipboard rejected.**
- v2.1.139+: command hooks run with **no controlling terminal** (no `/dev/tty`). This is why
  the bell must go through `terminalSequence`, not a raw write to the tty.
- **`{"async": true}`** runs a hook non-blocking (also `asyncRewake`). **Decision: we do NOT
  use async on the bell output** — bell is synchronous so `terminalSequence` is reliably
  applied; the overlay POST is detached separately.
- `stop_hook_active === true` means we're already inside a Stop hook → exit 0 to avoid loops.
- Spike confirmed on this machine: `JSON.stringify` correctly serializes a literal BEL byte
  to `""`; garbage/empty stdin → `{}` → still exits 0.

---

## 7. Dev commands

```bash
# Toolchain on the dev machine: Node v24, Cargo 1.94, git. pnpm via corepack:
corepack enable
corepack prepare pnpm@9.12.0 --activate

pnpm install                 # install workspace deps

# Hook (Codex):
node packages/hook/notify.mjs        # reads stdin; test with echo (see CONTRACT §3)
echo '{"cwd":"/tmp/foo","hook_event_name":"Stop"}' | node packages/hook/notify.mjs
pnpm test:hook                       # acceptance runner (once test/run.mjs is written)

# Overlay (Claude):
pnpm overlay:dev                     # tauri dev
pnpm overlay:build                   # tauri build (.msi/.dmg/.AppImage)
curl http://127.0.0.1:47321/health
curl -X POST http://127.0.0.1:47321/event -H 'content-type: application/json' \
     -d '{"type":"done","project":"x","ts":0}'
```

---

## 8. Key decisions & gotchas (learned the hard way — read before changing)

1. **Bell sync, POST detached.** See §6. Don't combine `async:true` with the bell.
2. **Hook never throws, always exit 0.** A non-zero exit interrupts Claude's turn. Every code
   path in the hook is wrapped to swallow errors.
3. **Overlay binds 127.0.0.1 only**, accepts display data only, executes nothing from the body.
4. **Rust drives everything except the crab animation.** The webview's `window.__TAURI__.window`
   API silently no-op'd here (caused the "sound but no crab" bug), and webviews block audio
   autoplay. So: **sound = Rust (rodio), window show/hide/position = Rust (server.rs on /event +
   auto-hide, lib.rs positioning), hook install = Rust (hookcfg.rs).** The frontend's ONLY webview
   dependency is `__TAURI__.event.listen("cc-ping-event")` to animate the crab. Capabilities are
   therefore event-only — don't add window permissions back expecting the frontend to use them.
5. **Transparent always-on-top window** on Windows: use click-through
   (`set_ignore_cursor_events(true)`) so the overlay never swallows desktop clicks.
   **v1 decision:** click-through is ON for the whole window, so MASTER_PLAN Phase 4's
   "hover to keep / click to dismiss" is **disabled** — the mascot auto-hides after ~3.2s.
   Re-enabling needs per-region hit-testing (toggle ignore-cursor based on pointer position).
   Tracked for v1.1. The frontend logic is otherwise ready for it.
6. **Single-instance overlay**: enforce one instance (Tauri single-instance plugin) or two
   copies fight over the port.
7. **`Notification` over-fires** (also on permission prompts) — debounce, and it bypasses the
   duration threshold by design.
8. **Mascot is original art.** Never derive from Anthropic's "Claw'd"/trademarks — IP risk on
   a public repo. Give it its own codename in-repo.
9. **Windows paths** contain `\`. Always derive `project` via `path.basename(cwd)`, and the
   JSON `cwd` field may carry escaped backslashes — don't try to "fix" them.
10. **Duration is approximate** (parsed from transcript JSONL timestamps). `null` is allowed
    and treated as "over threshold". Don't over-engineer this for v1.

---

## 9. Where to look when…

- "How do the two halves talk?" → [CONTRACT.md](CONTRACT.md)
- "What's the next thing to build?" → §5 table here + [MASTER_PLAN.md](MASTER_PLAN.md) phase
- "What is Codex supposed to do?" → [CODEX_BRIEF.md](CODEX_BRIEF.md)
- "Is this hook field real?" → §6 here (already verified — don't re-check from memory)
- "What are we optimizing next / who owns what after v0.1.0?" → [ROADMAP.md](ROADMAP.md)
- "What features are we building toward (v0.2 → v2)?" → [FEATURE_PLAN.md](FEATURE_PLAN.md)
