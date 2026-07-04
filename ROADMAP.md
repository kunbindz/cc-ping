# cc-ping — Optimization Roadmap (post v0.1.0)

> v0.1.0 shipped: hook (bell + event) + Tauri overlay (Chef Crab mascot + sound), MSI built,
> repo live. This is the plan to make it **installable by strangers in 30 seconds and solid on
> every OS**, then polish for reach.
>
> Owners: **[Claude]** = `packages/overlay/` · **[Codex]** = `packages/hook/` · **[user]** =
> manual step / secrets / verification. The hook↔overlay seam is still frozen in
> [CONTRACT.md](CONTRACT.md) — don't diverge without updating both sides.

Legend: 🔴 P0 (do first — adoption) · 🟠 P1 (works for everyone) · 🟡 P2 (polish) · ⚪ P3 (v2).

---

## 🔴 P0 — Remove install friction (biggest lever)

### P0-1 · One-download setup — the overlay installs the hook itself  ✅ DONE
**Problem:** today it's 2 steps (install app **and** wire the hook via `node install.mjs`), plus
the overlay must be kept running. Strangers drop off.
**Target:** download the installer → open → done.
**Shipped:** overlay bundles `notify.mjs`; tray "Enabled in Claude Code" writes settings.json from
Rust (`hookcfg.rs`) + "Start at login" (autostart). Hook installer is reusable (`--notify`/env) and
`notify.mjs` is standalone. (Note: overlay writes settings in Rust rather than shelling `node` — no
PATH dependency at click time.)
- **[Claude / overlay]** Bundle the hook (`notify.mjs` + `lib/`) as an app resource. Tray menu:
  **"Enable in Claude Code"** (registers the hook) / **"Disable"**, showing current state; plus
  **"Start at login"** (via `tauri-plugin-autostart`). "Enable" runs the bundled installer so the
  settings-merge logic is never duplicated.
- **[Codex / hook]** Make `install.mjs` / `uninstall.mjs` the **single source of truth**, callable
  with an explicit target `notify.mjs` path (not hard-coded to `packages/hook`), so the copy
  bundled inside the app can register itself. Keep it idempotent + non-destructive; keep tests
  green. Ensure `notify.mjs` + `lib/` run standalone from any directory.
**Acceptance:** clean machine → install → open → click Enable → run a Claude task → ting + crab.
No terminal, no npm.

### P0-2 · Publish the hook to npm so `npx cc-ping install` works  [Codex + user]
- **[Codex]** finalize package metadata, `npx cc-ping install/uninstall` UX, npm README.
- **[user]** add repo secret `NPM_TOKEN` (the CI `publish-hook` job needs it).

### P0-3 · Publish the GitHub Release (prebuilt binaries)  [Claude/CI + user]
CI already builds `.msi/.dmg/.AppImage` on tag. **[user]** publish the draft release; **[Claude]**
make sure `release.yml` attaches all three and the README download links point at `releases/latest`.

---

## 🟠 P1 — Works for everyone, not just this Windows box

### P1-4 · Verify + fix macOS & Linux  [Claude + user]
CI builds them but nobody has run them. Verify transparent + always-on-top window, `rodio` audio
device, tray, and Rust-driven show/auto-hide on both. Linux transparency/compositor is the risk.

### P1-5 · Audit webview reliance / remove dead code  [Claude]
The window-visibility bug came from a webview JS API that silently no-op'd. Window is Rust-driven
now ✅ — sweep the frontend for any remaining `window.__TAURI__` dependency, delete dead `appWindow`
paths, and document what the frontend is (and isn't) allowed to depend on.

### P1-6 · Robustness  [Claude + Codex]
- **[Claude]** handle port-in-use gracefully; tray shows a **"connected to Claude Code"** status;
  behave sanely if the overlay isn't running.
- **[Codex]** detect Claude Code < v2.1.141 and note the bell-needs-overlay fallback.

---

## 🟡 P2 — Polish & delight  [mostly Claude]
- **Config from the tray** (toggle sound / threshold / quiet projects) — no hand-edited JSON.
- **Sound**: volume control, a nicer set of clips.
- **Mascot**: idle micro-animations; re-enable **click-to-dismiss** (needs per-region hit-testing,
  since the window is click-through); smart **queue** when several projects finish at once.
- **Perf**: measure idle RAM/CPU + startup; **[Codex]** benchmark the hook's added turn latency
  (target < 50 ms) — then put the numbers in the README as a selling point.

## ⚪ P3 — v2 (later)
TTS reading the task name · browser extension for claude.ai web · multiple mascot skins ·
"pings per day" stats dashboard · Slack/Discord webhook.

## Tech debt (fold in as you go)
- **[Claude]** tests for the overlay (`config.rs`, server parsing) — only the hook is tested today.
- **[Codex]** guard the CI `publish-hook` job so it doesn't fail red without `NPM_TOKEN`; keep the
  16 hook acceptance tests green as the package changes.

---

## Codex — assignments

You own `packages/hook/`. Read [CONTRACT.md](CONTRACT.md) first. Don't touch `packages/overlay/`.

### Round 2 — ✅ DONE
Reusable installer (`--notify`/env), standalone `notify.mjs`, `version-check.mjs`, CI publish-hook
guard, npm-ready `package.json`, README, bench, 21/21 tests. Reviewed + merged.

### Round 3 — ✅ DONE
`cc-ping doctor` + `cc-ping test` CLIs, `lib/config.mjs` validation, npm tarball cleaned
(`--dry-run` green, no `test/`), README latency reframed. Reviewed + merged.

### Round 4 — ✅ DONE
`ci.yml` (hook tests on push/PR; Claude added an overlay `cargo test` job), `error` mood
(`notification_type` ∈ {permission_prompt, elicitation_dialog} → error — verified real against
Claude Code docs), `cc-ping config get/set/validate`, `doctor --json`. Reviewed + merged.
Claude fix during review: min-duration threshold applies to `done` only, so `waiting`/`error`
(attention) are never silenced. 31/31 hook tests + 8 overlay tests green.

### Round 5 — optional, low urgency (diminishing returns — only if Codex has budget)
1. **`prepublishOnly`** script running the tests so a broken hook can't be published.
2. **Refine notification mapping**: `agent_completed` → `done`, keep `agent_needs_input` →
   `waiting`; decide `elicitation_complete/response` (likely silent). Add tests.
3. **Hardening tests**: malformed/huge transcripts, posix vs windows path quoting in install.

The **real** remaining gap is P1-4 **verification on actual macOS/Linux** (needs machines — the
overlay window/transparency/audio, and the installed-MSI hook path) and **P0-3 publish**. Those
aren't Codex-doable. Keep all tests green; don't touch `packages/overlay/`.
