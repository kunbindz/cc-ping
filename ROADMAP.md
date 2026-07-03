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

### Round 3 — current (in order)
1. **`cc-ping doctor` (diagnostic CLI).** Print a health check: is the hook installed in
   `~/.claude/settings.json`? is the overlay reachable (`GET http://127.0.0.1:<port>/health` per
   CONTRACT §2)? Claude Code version (reuse `version-check.mjs`)? is `~/.cc-ping/config.json` valid?
   Human-readable ✓/✗ lines; exit 0 always. This is the #1 support tool.
2. **`cc-ping test` (fire a test event).** POST a sample `{type:"done",project:"cc-ping test",ts}`
   to the overlay (CONTRACT §2) so a user can confirm the crab + sound work **without** waiting for
   a real task. Print whether the overlay answered. Add `--type done|waiting|error`.
3. **Finish P0-2 (npm).** Make `npm publish --dry-run` clean: drop `test/` from the published
   `files` (don't ship tests), verify the tarball contents, confirm `npx cc-ping install|uninstall`
   works from the packed tarball. Still don't publish — user adds `NPM_TOKEN`.
4. **README latency honesty (P2).** Reframe the "<50 ms" claim to the measured reality
   (~90–150 ms, node-startup-bound); put the bench numbers in the hook README.

Coordinate: `doctor`/`test` hit the overlay's HTTP endpoints — follow CONTRACT §2 exactly (loopback
port from config, `/health` + `/event` shapes). Keep all acceptance tests green.
