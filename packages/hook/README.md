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
npx cc-ping doctor --json
```

Prints support checks for the installed Claude Code hooks, overlay `/health`, Claude Code version, and `~/.cc-ping/config.json`. It always exits `0`.

## Test The Overlay

```sh
npx cc-ping test
npx cc-ping test --type waiting
```

Sends one contract-compatible event to `POST /event` so you can confirm the overlay mascot and sound without waiting for a real Claude Code task. Valid types are `done`, `waiting`, and `error`.

## Config CLI

```sh
npx cc-ping config get
npx cc-ping config get overlayPort
npx cc-ping config set minDurationMs 5000
npx cc-ping config set bell false
npx cc-ping config set quietProjects app-a,app-b
npx cc-ping config set sounds.error buzz
npx cc-ping config set summary.mode off
npx cc-ping config set summary.mode llm
npx cc-ping config set summary.baseUrl http://127.0.0.1:11434/v1
npx cc-ping config set summary.model llama3.1
npx cc-ping config set summary.apiKeyEnv OPENAI_API_KEY
npx cc-ping config validate
```

The config command validates the same schema used by `doctor`, preserves existing unknown keys, and writes pretty JSON.

## Event Types

`Stop` and `SubagentStop` send `done`. Most `Notification` events send `waiting`; `notification_type` values `permission_prompt` and `elicitation_dialog` send `error` because they require attention. Claude Code failure signals such as `StopFailure`, if routed to this hook in the future, also map to `error`.

## Summaries

For `done` events, cc-ping adds an optional `summary` field to the overlay event. The default mode is a local heuristic: it tail-reads the transcript, looks only after the most recent user message, and emits one short line such as:

```text
edited 3 files · ran tests · 2 commits
```

If the transcript is unreadable or the heuristic is unsure, `summary` is `null`.

Summary config:

```json
{
  "summary": {
    "mode": "heuristic",
    "baseUrl": null,
    "model": null,
    "apiKeyEnv": null
  }
}
```

Modes:

- `off`: always send `summary: null`.
- `heuristic`: local, no network, default.
- `llm`: call an OpenAI-compatible `/chat/completions` endpoint with a short timeout; reads the API key from `apiKeyEnv`; falls back to heuristic on any failure.

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
  "summary": { "mode": "heuristic", "baseUrl": null, "model": null, "apiKeyEnv": null },
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
