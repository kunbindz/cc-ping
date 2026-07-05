# cc-ping — Interface Contract (FROZEN v1)

> This is the **single source of truth** for the seam between `packages/hook/` and
> `packages/overlay/`. Both packages are developed independently and only meet here.
> **Do not change anything in this file without updating both packages in the same change.**
> If you are an AI agent (Claude or Codex): treat every field name, type, port, and
> escape sequence below as a hard requirement. Mismatches here are the #1 source of
> integration bugs.

Status: **FROZEN 2026-06-28.** All claims below were verified against current Claude
Code docs and a live spike on Windows + Node 24 (see CLAUDE.md § "Verified facts").

---

## 1. Runtime layout (created at runtime, NOT in repo)

```
~/.cc-ping/
├─ config.json                 # user config (see §4)
└─ sessions/
   └─ <sessionId>.json         # optional per-session state for duration (Phase 2)
```

`~` = `os.homedir()` (Node) / the user's home dir (Rust: `dirs::home_dir()`).
On Windows this is `C:\Users\<name>`. Both packages MUST resolve the same path.

---

## 2. HTTP protocol: hook (client) → overlay (server)

Overlay binds **loopback only**: `127.0.0.1:<port>`. Never `0.0.0.0`. Port comes from
`config.overlayPort` (§4), default **47321**.

### `GET /health`
Overlay responds `200` with JSON:
```json
{ "ok": true, "version": "0.1.0" }
```
Used by the hook to cheaply check liveness if it wants to (optional; the hook is allowed
to skip this and POST blind — see §3 timeout rules).

### `POST /event`
Request body (`Content-Type: application/json`):
```jsonc
{
  "type": "done",            // REQUIRED. One of: "done" | "waiting" | "error"
  "project": "uppromote",    // REQUIRED. string. basename of cwd. "" if unknown.
  "cwd": "C:\\work\\uppromote", // optional string (raw cwd, may contain backslashes)
  "sessionId": "abc123",     // optional string | null
  "agentType": null,         // optional string | null (from SubagentStop)
  "durationMs": 47213,       // optional number | null (null = unknown)
  "summary": "edited 3 files, ran tests", // optional string | null (v1.0). One short line,
                             //   <= ~120 chars, no newlines. null/absent = no summary line.
  "ts": 1719560000000        // REQUIRED. number. Unix epoch millis (Date.now()).
}
```
The overlay treats every field beyond `type` as optional display data — an older overlay that
doesn't know `summary` simply ignores it, and a newer overlay renders it under the mascot when
present. This is how the seam evolves: additive optional fields, no version negotiation.
Overlay responds **`204 No Content`** with empty body. The overlay MUST NOT make the hook
wait: parse fast, hand off to the UI thread asynchronously, return 204 immediately.

**Validation rule (overlay side):** if `type` is missing/invalid → respond `204` anyway
and drop the event silently (never 4xx/5xx — the hook does not read the status meaningfully
and we never want to surface errors back into Claude's turn). `project` missing → treat as `""`.

**Security:** the overlay accepts display data ONLY. It MUST NOT execute anything derived
from the request body (no shell, no eval, no file paths opened for write based on body).

---

## 3. Hook output contract: hook → Claude Code (stdout JSON + exit code)

The hook is a command hook on `Stop`, `SubagentStop`, and `Notification`.

**Two independent signal paths. They must not depend on each other:**

### Path A — terminal bell (always-on fallback, SYNCHRONOUS)
The hook writes to **stdout** a JSON object and exits **0**:
```json
{ "terminalSequence": "" }
```
- `` is BEL. This is on the Claude Code allowlist (verified). Requires Claude Code
  **≥ v2.1.141**.
- **DO NOT set `"async": true` on the bell output.** The bell path must be synchronous so
  Claude reliably applies `terminalSequence`. (We deliberately do not rely on async output
  carrying the terminal sequence.)
- Optional enhancement (allowed by the allowlist, not required for v1): OSC 0/1/2 to set the
  terminal window title, OSC 9 for a native terminal notification. CSI color, OSC 8
  hyperlink, and OSC 52 clipboard are **rejected** by Claude Code — do not use them.

### Path B — overlay POST (fire-and-forget, DETACHED)
Independently of Path A, the hook POSTs to `/event` (§2):
- Timeout **≤ 300ms**. On any failure (overlay down, timeout, ECONNREFUSED) → **swallow
  silently**, no retry, no stderr noise.
- Must not block the turn meaningfully. Target: hook adds **< ~50ms** to turn end.
- Because Path A already returned the bell synchronously, Path B can be a truly detached
  request whose completion the hook does not await before exiting. (Implementation detail
  left to Codex: detached request with a hard timeout is acceptable; a spawned detached
  helper is also acceptable. Either way the bell must already be emitted.)

### Hard rules for the hook (never violate)
1. **Always exit 0.** Never throw, never non-zero exit. A crashing hook must not interrupt Claude.
2. **`stop_hook_active === true` → exit 0 immediately**, emit nothing (prevents stop-loops).
3. Unparseable stdin → behave as `{}`, never throw.

### Event → `type` mapping
| `hook_event_name` | `type` sent to overlay |
|---|---|
| `Stop` | `done` |
| `SubagentStop` | `done` |
| `Notification` | `waiting` |
| (future) failure signal | `error` |

`Notification` events **bypass the duration threshold** (they mean "Claude is waiting for
you" — always worth surfacing).

---

## 4. Config schema: `~/.cc-ping/config.json`

Both packages read this file. Missing file or missing keys → fall back to these defaults.
Never crash on a malformed config; fall back to defaults per-key.

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

| Key | Type | Default | Read by | Meaning |
|---|---|---|---|---|
| `minDurationMs` | number | `10000` | hook | Below this, `Stop`/`SubagentStop` stay silent. `Notification` ignores it. `durationMs===null` counts as "over threshold" (still notify). |
| `bell` | boolean | `true` | hook | If false, omit `terminalSequence`. |
| `overlay` | boolean | `true` | hook | If false, skip the POST entirely. |
| `overlayPort` | number | `47321` | both | Loopback port. |
| `sounds` | object | see above | overlay | Maps `type` → sound name. Sound files live in `assets/sounds/`. A value of `"none"`/`null`/`false` for a type means no sound for that type. |
| `quietProjects` | string[] | `[]` | hook | If `project` is in this list → hook stays fully silent (no bell, no POST). |

---

## 5. Things that are explicitly OUT of scope for v1 (do not build)
- TTS / speaking task names.
- Browser extension for claude.ai web.
- Multiple mascot skins / community art.
- Slack/Discord webhooks.
- Any non-loopback networking.
