# cc-ping-overlay

The background app half of cc-ping. A lightweight **Tauri** process that lives in the system
tray, listens on a loopback HTTP port for events from the [hook](../hook/), plays a sound, and
animates the **Pip** mascot running out from the corner of your desktop.

Without this app you still get the terminal bell from the hook — the overlay is the richer,
optional layer.

## How it fits together
See [../../CONTRACT.md](../../CONTRACT.md) (the wire protocol) and [../../CLAUDE.md](../../CLAUDE.md)
(architecture). In short: the hook does `POST 127.0.0.1:47321/event`; this app plays the sound
(natively, via `rodio`) and emits a `cc-ping-event` to the mascot window's frontend.

## Layout
- `src-tauri/` — Rust core:
  - `config.rs` — reads `~/.cc-ping/config.json` (port + sound map).
  - `server.rs` — loopback-only `GET /health` + `POST /event` (tiny_http).
  - `sound.rs` — plays embedded WAV clips with `rodio` (avoids webview autoplay limits).
  - `lib.rs` — single-instance, tray (Quiet/Quit), hidden always-on-top window, positioning.
- `src/` — frontend (plain ES modules, no build step; uses `window.__TAURI__`):
  - `index.html` — inline Pip SVG + speech bubble.
  - `mascot.js` — mood/expression + show↔hide state machine.
  - `main.js` — `cc-ping-event` wiring, burst coalescing, OS window show/hide.
- `assets/sounds/` — `ting.wav` / `soft.wav` / `buzz.wav` (generated, embedded at build time).
- `assets/mascot/pip.svg` — canonical mascot art (original; not affiliated with Anthropic).

## Develop
Prereqs: Rust (stable, MSVC toolchain on Windows), the Tauri system deps for your OS
(WebView2 ships with Windows 11), and Node for the CLI runner.

```bash
corepack enable && corepack prepare pnpm@9.12.0 --activate
pnpm install
pnpm --filter cc-ping-overlay tauri dev      # or: pnpm overlay:dev
```

Smoke-test the running app without Claude Code:
```bash
curl http://127.0.0.1:47321/health
curl -X POST http://127.0.0.1:47321/event \
  -H 'content-type: application/json' \
  -d '{"type":"done","project":"demo","ts":0}'
# → ting sound + Pip runs out bottom-right, then hides.
# try "type":"waiting" (soft) and "type":"error" (buzz) too.
```

To preview just the animation in a plain browser (no Tauri), open `src/index.html` and run
`__ccPingTest({type:'done',project:'demo'})` in the devtools console.

## Build
```bash
pnpm --filter cc-ping-overlay tauri build     # → .msi / .dmg / .AppImage
```

## Known v1 limitations
- The window is **click-through** so it never blocks the desktop. As a consequence the
  "hover to keep / click to dismiss" interaction is disabled in v1 (the mascot auto-hides after
  ~3.2s). Re-enabling it needs per-region hit-testing — tracked for v1.1.
- macOS `.icns` is not generated locally (Windows-first); the release CI handles other OSes.
