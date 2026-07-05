# cc-ping 🦀

> **A tiny chef crab that tells you when Claude Code is done cooking.**
>
> Claude Code runs for minutes, you tab away, and you never know when it's finished. cc-ping
> rings a terminal bell and a pixel-art crab scuttles out from the corner of your desktop the
> moment your task is done (or Claude needs you). It's **1.9 MB**, not Electron.

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="MIT" />
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue" alt="platforms" />
  <img src="https://img.shields.io/badge/overlay-1.9%20MB-brightgreen" alt="overlay size" />
  <img src="https://img.shields.io/badge/built%20with-Tauri%202-24C8DB" alt="Tauri 2" />
</p>

<p align="center">
  <!-- ⚠️ Record a 3–5s loop of the crab running out + the "ting" and drop it here as assets/demo.gif.
       This GIF is the single most important thing for sharing — add it before publishing. -->
  <img src="assets/demo.gif" alt="cc-ping demo — the chef crab runs out when Claude finishes" width="420" />
</p>

## What it does

Claude Code auto-mode can run for minutes. You tab away, and when it finishes there's no
signal — so you waste time checking back. cc-ping gives you two independent signals:

1. **Terminal bell** — always works (tmux/screen/Windows), race-free. This alone is a useful
   install with zero extra apps.
2. **Mascot + sound** — an optional lightweight background app that plays a sound and animates
   the Chef Crab running out from the corner. If it isn't running, you still get the bell.

It distinguishes three situations, and shows a one-line summary of **what Claude just did**:
- **done** — a task finished (cheerful "ting", crab waves) → e.g. *"edited 3 files · ran tests · 2 commits"*.
- **waiting** — Claude needs your input/approval (soft tone, gentle wave).
- **error** — a permission prompt / needs attention (low buzz, crab trembles).

The summary is built locally from the transcript (no cloud, no key). Optionally you can point it
at your own OpenAI-compatible endpoint for nicer phrasing — off by default, always falls back to
the local summary.

## How it works

```
Claude Code ──Stop/SubagentStop/Notification hook──▶ cc-ping (hook, Node, zero-dep)
                                                       ├─ rings the terminal bell (synchronous)
                                                       └─ POST 127.0.0.1:47321/event (fire-and-forget)
                                                                       ▼
                                                          cc-ping-overlay (Tauri, system tray)
                                                          plays a sound + animates the crab
```

Architecture and the hook↔overlay protocol are documented in
[CLAUDE.md](CLAUDE.md) and [CONTRACT.md](CONTRACT.md).

## Install

### Fastest — the app (one download, no terminal) ⭐
1. Download the build for your OS from the [latest release](../../releases/latest):
   **Windows** `.msi` · **macOS** `.dmg` (universal) · **Linux** `.AppImage`.
2. Launch it — it lives in your **system tray** (the crab icon).
3. Right-click the tray icon → **Enable in Claude Code** (it wires the hook for you), and
   optionally **Start at login**.

That's it — run a Claude Code task and the crab runs out. No terminal, no npm.

### Or via the CLI
Prefer the terminal, or only want the bell (no app)?
```bash
npx cc-ping install
```
This merges hook entries for `Stop`, `SubagentStop`, and `Notification` into
`~/.claude/settings.json` (non-destructive and idempotent — it won't touch your other hooks).
Add the app later for sound + mascot.

## Commands
```bash
npx cc-ping install | uninstall          # wire / unwire the hook
npx cc-ping doctor                       # health check: hook? overlay? Claude Code version? config?
npx cc-ping test [--type done|waiting|error]   # fire a test event at the overlay
npx cc-ping config get | set <k> <v> | validate  # view/edit ~/.cc-ping/config.json
```

## Configure

Optional. Config lives at `~/.cc-ping/config.json` — edit it by hand or via `cc-ping config`.
All keys optional; defaults shown:
```json
{
  "minDurationMs": 10000,
  "bell": true,
  "overlay": true,
  "overlayPort": 47321,
  "sounds": { "done": "ting", "waiting": "soft", "error": "buzz" },
  "summary": { "mode": "heuristic" },
  "quietProjects": []
}
```
- `minDurationMs` — only notify for tasks longer than this (avoids spam on quick turns).
  `waiting`/`error` always fire.
- `quietProjects` — project folder names to stay fully silent for.
- `sounds` — set any value to `"none"` to mute that type.
- `summary.mode` — `"heuristic"` (local, default) · `"llm"` (your own OpenAI-compatible endpoint:
  add `baseUrl`, `model`, `apiKeyEnv`; falls back to heuristic; no key is bundled) · `"off"`.

## Uninstall
- **From the app:** tray → **Disable in Claude Code**, then Quit and delete the app.
- **CLI:** `npx cc-ping uninstall` (removes only cc-ping's hook entries; leaves your other hooks intact).

## Requirements
- **Claude Code ≥ v2.1.141** for the terminal bell (`terminalSequence`). On older versions the
  bell only works through the overlay.
- **Node ≥ 18** (ships with Claude Code environments) for the hook.

## Platform support
- **Windows** — tested end-to-end.
- **macOS / Linux** — built (macOS `.dmg` is universal: Intel + Apple Silicon) and unit-tested in
  CI on every push, but the GUI runtime (mascot window, transparency, sound) hasn't been human-
  verified yet. Feedback from Mac/Linux users very welcome — please open an issue.

## Develop
This is a pnpm workspace with two packages: `packages/hook` (Node) and `packages/overlay`
(Tauri). See [CLAUDE.md](CLAUDE.md) for the map and [packages/overlay/README.md](packages/overlay/README.md)
for running the app locally.
```bash
corepack enable && corepack prepare pnpm@9.12.0 --activate
pnpm install
pnpm test:hook        # hook acceptance suite (Node)
pnpm test:overlay     # overlay unit tests (cargo test)
pnpm overlay:dev      # run the overlay
```

## License
MIT — see [LICENSE](LICENSE). The **Chef Crab** mascot is original art, not affiliated with Anthropic.
