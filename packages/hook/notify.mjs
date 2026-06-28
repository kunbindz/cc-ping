#!/usr/bin/env node
// notify.mjs — cc-ping hook entrypoint. Registered on Stop / SubagentStop / Notification.
//
// Two independent signal paths (CONTRACT §3):
//   Path A  bell:  stdout JSON { "terminalSequence": "" }, SYNC, no async.
//   Path B  POST:  fire-and-forget to the overlay, detached, ≤300ms, errors swallowed.
//
// HARD RULES: always exit 0, never throw. stop_hook_active===true → exit 0, emit nothing.
//
// STATUS:
//   Phase 1 (bell + project derivation): SEEDED & VERIFIED. Working below.
//   Phase 2 (config/threshold/duration) and Phase 5 (POST): TODO for Codex — see CODEX_BRIEF.md.
import path from 'node:path';
import { readStdin } from './lib/read-stdin.mjs';
// Phase 2/5 — uncomment as you implement:
// import { loadConfig } from './lib/config.mjs';
// import { estimateDurationMs } from './lib/duration.mjs';
// import { postEvent } from './lib/post-event.mjs';

const EVENT_TYPE = {
  Stop: 'done',
  SubagentStop: 'done',
  Notification: 'waiting',
};

try {
  const input = readStdin();

  // Guard: already inside a Stop hook → let Claude stop, say nothing.
  if (input.stop_hook_active === true) {
    process.exit(0);
  }

  const cwd = input.cwd || process.cwd();
  const project = path.basename(cwd) || '';
  const eventName = input.hook_event_name || 'Stop';
  const type = EVENT_TYPE[eventName] || 'done';

  // ── Phase 2 TODO (Codex): load config, apply quietProjects + minDurationMs threshold.
  //    Notification events bypass the threshold. If silenced, exit 0 here without bell/POST.
  //    const config = loadConfig();
  //    if (config.quietProjects.includes(project)) process.exit(0);
  //    if (type !== 'waiting') { const d = estimateDurationMs(input.transcript_path);
  //        if (d != null && d < config.minDurationMs) process.exit(0); }

  // ── Path A: terminal bell (synchronous). Phase 2 TODO: respect config.bell.
  process.stdout.write(JSON.stringify({ terminalSequence: '' }));

  // ── Path B TODO (Codex, Phase 5): fire-and-forget POST. Must not block exit.
  //    Respect config.overlay. Body per CONTRACT §2.
  //    postEvent({ type, project, cwd, sessionId: input.session_id ?? null,
  //                agentType: input.agent_type ?? null, durationMs: null, ts: Date.now() });

  process.exit(0);
} catch {
  // Catch-all: never let a hook failure interrupt Claude.
  process.exit(0);
}
