# cc-ping — Feature Master Plan (v0.2 → v2)

> The forward-looking **feature** roadmap. For the near-term launch/optimization checklist see
> [ROADMAP.md](ROADMAP.md); for the frozen hook↔overlay wire format see [CONTRACT.md](CONTRACT.md);
> for the architecture map see [CLAUDE.md](CLAUDE.md). Owners: **[Claude]** = `packages/overlay/`,
> **[Codex]** = `packages/hook/`, **[user]** = secrets / manual verification.

## Where we are (v0.1.x, shipped)
Hook (terminal bell + fire-and-forget event; `install`/`uninstall`/`doctor`/`test`/`config` CLIs;
3 moods incl. `error` from permission prompts; 31 tests). Overlay (Chef Crab, one-click tray
install + Start-at-login, Rust-driven window/sound, 8 tests). CI builds+tests all 3 OSes; release
builds `.msi`/`.dmg`(universal)/`.AppImage`. Windows verified; macOS/Linux CI-built, GUI feedback
pending.

## Guiding principles (don't break these)
1. **Stay tiny & zero-friction.** 1.9 MB overlay, zero-dep hook, one-download setup. Every feature
   must justify its weight; nothing that bloats or slows turn-end (hook stays < ~150 ms).
2. **Two independent signals.** The terminal bell must keep working even if the overlay is off.
3. **The seam is the CONTRACT.** New data flows hook→overlay through `/event` fields (§2). Any new
   field is added to [CONTRACT.md](CONTRACT.md) + both sides together.
4. **Provider-agnostic.** Anything involving an LLM/TTS is optional, bring-your-own, and never a
   hard dependency (no key shipped, works fully without it).
5. **Rust drives the window/sound/install; the webview only animates** (see CLAUDE.md §8).

---

## Milestone v0.2 — "Ship it" (mostly built; just release)
Turn the one-click work into a public release people can install.

| Feature | Value | Owner |
|---|---|---|
| Tag `v0.2.0` → build + draft release 3 OS | people can download | [user]/CI |
| Publish hook to npm (`npx cc-ping install`) | CLI users | [Codex]+[user: `NPM_TOKEN`] |
| Demo GIF + Show HN / socials | reach | [user] |

**Done when:** a stranger installs the `.msi` (or `npx cc-ping install`) and gets ting + crab.

---

## Milestone v0.3 — "Live-with-it polish" (make it pleasant daily)
| Feature | Value | Owner | Notes |
|---|---|---|---|
| Config in the tray (sound on/off, threshold, quiet-this-project) | no JSON editing | [Claude] | reads/writes `~/.cc-ping/config.json`; shares schema with `cc-ping config` |
| Sound: volume + mute + pick a pack | comfort | [Claude] overlay + [Codex] config keys | add `volume`/`soundPack` to CONTRACT §4 |
| Click-to-dismiss / hover-to-hold mascot | control | [Claude] | needs per-region cursor hit-testing (window is click-through) |
| Multi-session smarts (queue/stack + project count when several finish) | clarity | [Claude] | debounce already exists; add a small queue + "+N" badge |
| Bring back the project name (opt-in, tasteful) | which repo finished | [Claude] | config toggle `showProject` |

**Done when:** a user can tune sound/threshold/quiet entirely from the tray, and bursts across
projects read clearly.

---

## Milestone v1.0 — "Rich signal" (the notification actually tells you something)
The headliner. Today the bubble says "finished cooking"; make it say **what** happened.

| Feature | Value | Owner | Design |
|---|---|---|---|
| **Task summary on the bubble** | know *what* Claude did at a glance | [Codex] hook + [Claude] overlay | Hook derives a 1-line summary from the transcript **heuristically** (count tool uses: "edited 3 files, ran tests, 2 commits") — **no LLM needed**. Send as new `summary` field (CONTRACT §2). Overlay shows it under the mascot. |
| Optional LLM summary (bring-your-own, OpenAI-compatible) | nicer phrasing | [Codex] | Off by default; `~/.cc-ping/config.json` `summary: {provider,baseUrl,model,apiKeyEnv}`. Never ships a key; falls back to heuristic on any failure/timeout. |
| Stats view ("N pings today, ~time away") | delight + stickiness | [Claude] overlay + [Codex] event log | Hook appends a tiny JSONL event log; a tray "Stats" window renders it. |
| Do-Not-Disturb / focus schedule | respect the user | [Claude]+[Codex] | quiet window (e.g. 22:00–08:00) + a tray DND toggle. |
| Richer moods (`agent_completed`→done, failures→error) | accuracy | [Codex] | extend the `notification_type` mapping. |

**Done when:** finishing a task shows a mascot + a one-line "what happened", and there's a stats
window. All without any external service required.

---

## Milestone v2.0 — "Reach & ecosystem"
| Feature | Value | Owner | Notes |
|---|---|---|---|
| **TTS** speak the summary | hands-free | [Claude] | Prefer OS-native TTS (SAPI/`say`/`spd-say`) — no cloud key. Optional. |
| Mascot **skins** + community art | virality/personalization | [Claude] | skin = folder of frames + a manifest; picker in tray. |
| **Browser extension** for claude.ai web | covers the web app | new `packages/extension` | different arch (content script watches DOM) → posts to the same overlay `/event`. |
| **Generalize the hook** for other agent CLIs | bigger audience | [Codex] | the event protocol isn't Claude-specific; document how any tool can POST `/event`. |
| Slack / Discord / webhook forwarding | remote / team notify | [Codex] | reuse Claude Code's HTTP hook type; opt-in in config. |

---

## Cross-cutting (every milestone)
- **CONTRACT evolution:** new event fields (`summary`, `showProject`, …) and config keys (`volume`,
  `soundPack`, `summary`, `dnd`) are added to [CONTRACT.md](CONTRACT.md) §2/§4 with defaults, and to
  BOTH `packages/hook/lib/config.mjs` and `packages/overlay/src/config.rs`.
- **Tests:** keep hook (`test/run.mjs`) + overlay (`cargo test`) green; add a case per feature. CI
  already runs both on 3 OSes.
- **Docs:** update README (feature list + demo) and CLAUDE.md gotchas as things land.
- **Perf budget:** hook stays < ~150 ms; overlay idle RAM stays small; summary heuristic must not
  read huge transcripts fully if avoidable (tail-read).

## Owner split recap
- **[Claude] overlay:** tray UI/config, sound, mascot behavior/skins, stats window, TTS, window.
- **[Codex] hook/CLI:** transcript summary extraction, config keys/CLI, event log, richer moods,
  webhook forwarding, protocol generalization.
- **[user]:** secrets (`NPM_TOKEN`, any BYO LLM key), publishing, macOS/Linux GUI feedback.
