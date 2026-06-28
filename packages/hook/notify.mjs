#!/usr/bin/env node
// cc-ping hook entrypoint. Registered on Stop / SubagentStop / Notification.
// Hard rules: always exit 0, never throw, and emit nothing for stop_hook_active.
import path from 'node:path';
import { readStdin } from './lib/read-stdin.mjs';
import { loadConfig } from './lib/config.mjs';
import { estimateDurationMs } from './lib/duration.mjs';
import { postEvent } from './lib/post-event.mjs';

const EVENT_TYPE = {
  Stop: 'done',
  SubagentStop: 'done',
  Notification: 'waiting',
};

try {
  const input = readStdin();

  if (input.stop_hook_active === true) {
    process.exit(0);
  }

  const cwd = typeof input.cwd === 'string' && input.cwd ? input.cwd : process.cwd();
  const project = path.basename(cwd) || '';
  const eventName = typeof input.hook_event_name === 'string' ? input.hook_event_name : 'Stop';
  const type = EVENT_TYPE[eventName] || 'done';
  const config = loadConfig();
  const durationMs = type === 'waiting' ? null : estimateDurationMs(input.transcript_path);

  if (config.quietProjects.includes(project)) {
    process.exit(0);
  }

  if (type !== 'waiting' && durationMs != null && durationMs < config.minDurationMs) {
    process.exit(0);
  }

  if (config.bell) {
    process.stdout.write(JSON.stringify({ terminalSequence: '\u0007' }));
  }

  if (config.overlay) {
    postEvent(
      {
        type,
        project,
        cwd,
        sessionId: input.session_id ?? null,
        agentType: input.agent_type ?? null,
        durationMs,
        ts: Date.now(),
      },
      config.overlayPort
    );
  }

  process.exit(0);
} catch {
  process.exit(0);
}
