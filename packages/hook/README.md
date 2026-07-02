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

On the Windows dev machine used for v0.1.0, `npm run bench` measured about `+20ms` median net overhead over Node startup for the overlay-down path.
