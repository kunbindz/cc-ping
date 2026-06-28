# cc-ping

> Desktop notification + mascot pop-out for **Claude Code**. When a task finishes — or Claude
> is waiting for your input — cc-ping rings a terminal bell and a little **Chef Crab** mascot
> runs out from the corner of your desktop to tell you to come back to work.

## Demo

_Demo GIF coming with the first release._

## What it does

Claude Code auto-mode can run for minutes. You tab away, and when it finishes there's no
signal — so you waste time checking back. cc-ping gives you two independent signals:

1. **Terminal bell** — always works (tmux/screen/Windows), race-free. This alone is a useful
   install with zero extra apps.
2. **Mascot + sound** — an optional lightweight background app that plays a sound and animates
   the Chef Crab running out from the corner, showing which project just finished. If it isn't
   running, you still get the bell.

It distinguishes three situations:
- **done** — a task/turn finished (cheerful "ting", crab waves a claw).
- **waiting** — Claude is waiting for your input/approval (soft tone, gentle wave).
- **error** — needs attention (low buzz, crab trembles).

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

### 1. The hook (required — gives you the bell)
```bash
npx cc-ping install
```
This merges hook entries for `Stop`, `SubagentStop`, and `Notification` into
`~/.claude/settings.json` (non-destructive and idempotent — it won't touch your other hooks).

### 2. The overlay (optional — gives you sound + mascot)
Download the build for your OS from the [latest release](../../releases/latest):
- **Windows:** `.msi`
- **macOS:** `.dmg`
- **Linux:** `.AppImage`

Launch it once; it lives in your system tray (right-click for **Quiet** / **Quit**). It starts
hidden and only appears when the crab runs out.

## Configure

Optional. Create `~/.cc-ping/config.json` (all keys optional — defaults shown):
```json
{
  "minDurationMs": 10000,
  "bell": true,
  "overlay": true,
  "overlayPort": 47321,
  "sounds": { "done": "ting", "waiting": "soft", "error": "buzz" },
  "quietProjects": []
}
```
- `minDurationMs` — only notify for tasks longer than this (avoids spam on quick turns).
  "waiting" notifications always fire.
- `quietProjects` — project folder names to stay fully silent for.
- `sounds` — set any value to `"none"` to mute that type.

## Uninstall
```bash
npx cc-ping uninstall    # removes only cc-ping's hook entries; leaves your other hooks intact
```
Then quit the overlay from its tray icon and delete the app.

## Requirements
- **Claude Code ≥ v2.1.141** for the terminal bell (`terminalSequence`). On older versions the
  bell only works through the overlay.
- **Node ≥ 18** (ships with Claude Code environments) for the hook.

## Develop
This is a pnpm workspace with two packages: `packages/hook` (Node) and `packages/overlay`
(Tauri). See [CLAUDE.md](CLAUDE.md) for the map and [packages/overlay/README.md](packages/overlay/README.md)
for running the app locally.
```bash
corepack enable && corepack prepare pnpm@9.12.0 --activate
pnpm install
pnpm test:hook        # hook acceptance suite
pnpm overlay:dev      # run the overlay
```

## License
MIT — see [LICENSE](LICENSE). The **Chef Crab** mascot is original art, not affiliated with Anthropic.
