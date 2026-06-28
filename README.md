# cc-ping

> Desktop notification + mascot pop-out for **Claude Code**. When a task finishes (or Claude is
> waiting for your input), cc-ping rings a terminal bell and a hand-drawn mascot runs out from
> the corner of your desktop to tell you to come back to work.

🚧 **Work in progress.** This README is a stub and will be filled in at Phase 6 (demo GIF,
per-OS install, uninstall). For now:

- **What & why / architecture:** [CLAUDE.md](CLAUDE.md)
- **Build spec & phases:** [MASTER_PLAN.md](MASTER_PLAN.md)
- **Interface between the hook and the overlay:** [CONTRACT.md](CONTRACT.md)

## Components
- **`packages/hook/`** (`cc-ping` on npm) — a zero-dependency Node hook for Claude Code. Rings
  the terminal bell and pings the overlay. Install with `npx cc-ping install`.
- **`packages/overlay/`** — a lightweight Tauri background app that plays a sound and animates
  the mascot. Optional: without it you still get the terminal bell.

## Requirements
- Claude Code **≥ v2.1.141** (for the `terminalSequence` bell). Older versions: bell only works
  via the overlay.

## License
MIT — see [LICENSE](LICENSE). The mascot is original art, not affiliated with Anthropic.
