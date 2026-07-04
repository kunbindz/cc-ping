# cc-ping

Claude Code hook handler for cc-ping. It rings the terminal bell when Claude Code finishes a turn or waits for input, and can also fire-and-forget a local event to the cc-ping desktop overlay.

## Install

```sh
npx cc-ping install
```

This merges cc-ping command hooks into `~/.claude/settings.json` for:

- `Stop`
- `SubagentStop`
- `Notification`

The installer is idempotent and preserves your existing Claude Code hooks.

## Uninstall

```sh
npx cc-ping uninstall
```

Only cc-ping hook entries are removed.

## Doctor

```sh
npx cc-ping doctor
```

Prints support checks for the installed Claude Code hooks, overlay `/health`, Claude Code version, and `~/.cc-ping/config.json`. It always exits `0`.

## Test The Overlay

```sh
npx cc-ping test
npx cc-ping test --type waiting
```

Sends one contract-compatible event to `POST /event` so you can confirm the overlay mascot and sound without waiting for a real Claude Code task. Valid types are `done`, `waiting`, and `error`.

## Bundled Overlay Installers

The desktop overlay can reuse this installer with an explicit bundled hook path:

```sh
node install.mjs --notify "/absolute/path/to/notify.mjs"
node uninstall.mjs --notify "/absolute/path/to/notify.mjs"
```

You can also set `CC_PING_NOTIFY_PATH`.

## Config

Optional config lives at `~/.cc-ping/config.json`:

```json
{
  "minDurationMs": 10000,
  "bell": true,
  "overlay": true,
  "overlayPort": 47321,
  "quietProjects": []
}
```

Missing or malformed config falls back to defaults per key. Claude Code `Notification` events always notify, regardless of `minDurationMs`.

## Notes

The terminal bell path requires Claude Code `>= 2.1.141`. If an older version is detected during install, cc-ping prints a warning; the overlay notification path can still carry the signal.

## Performance

This hook is Node-startup-bound. On the Windows dev machine used for v0.1.0, `npm run bench` measured:

- Node startup baseline: median `90.1ms`, p95 `103.7ms`
- Bell only: median `108.9ms`, p95 `122.9ms`
- Overlay down: median `110.1ms`, p95 `129.4ms`

The net cc-ping overhead over Node startup was about `+20ms` median, but the user-visible hook process time is realistically around `90-150ms` on that machine.
