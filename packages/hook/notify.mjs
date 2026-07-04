#!/usr/bin/env node
// cc-ping hook entrypoint. Registered on Stop / SubagentStop / Notification.
// Hard rules: always exit 0, never throw, and emit nothing for stop_hook_active.
import { readFileSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const EVENT_TYPE = {
  Stop: 'done',
  SubagentStop: 'done',
  Notification: 'waiting',
  StopFailure: 'error',
};

// Claude Code Notification carries notification_type. Permission/elicitation prompts
// need attention, so they use the overlay's error mood; idle/auth notifications wait.
const ERROR_NOTIFICATION_TYPES = new Set(['permission_prompt', 'elicitation_dialog']);

const DEFAULT_CONFIG = {
  minDurationMs: 10000,
  bell: true,
  overlay: true,
  overlayPort: 47321,
  sounds: { done: 'ting', waiting: 'soft', error: 'buzz' },
  quietProjects: [],
};

try {
  const input = readStdin();

  if (input.stop_hook_active === true) {
    process.exit(0);
  }

  const cwd = typeof input.cwd === 'string' && input.cwd ? input.cwd : process.cwd();
  const project = path.basename(cwd) || '';
  const eventName = typeof input.hook_event_name === 'string' ? input.hook_event_name : 'Stop';
  const type = eventType(input, eventName);
  const config = loadConfig();
  // Only 'done' (Stop/SubagentStop) is subject to the min-duration threshold. 'waiting' and
  // 'error' come from Notifications ("Claude needs you now") and must always alert.
  const durationMs = type === 'done' ? estimateDurationMs(input.transcript_path) : null;

  if (config.quietProjects.includes(project)) {
    process.exit(0);
  }

  if (type === 'done' && durationMs != null && durationMs < config.minDurationMs) {
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

  process.exitCode = 0;
} catch {
  process.exit(0);
}

function readStdin() {
  try {
    const raw = readFileSync(0, 'utf8');
    if (!raw || !raw.trim()) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function eventType(input, eventName) {
  if (eventName === 'Notification') {
    return ERROR_NOTIFICATION_TYPES.has(input.notification_type) ? 'error' : 'waiting';
  }
  return EVENT_TYPE[eventName] || 'done';
}

function loadConfig() {
  try {
    const parsed = JSON.parse(readFileSync(path.join(os.homedir(), '.cc-ping', 'config.json'), 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return cloneDefaultConfig();

    const cfg = cloneDefaultConfig();
    if (Number.isFinite(parsed.minDurationMs)) cfg.minDurationMs = Math.max(0, parsed.minDurationMs);
    if (typeof parsed.bell === 'boolean') cfg.bell = parsed.bell;
    if (typeof parsed.overlay === 'boolean') cfg.overlay = parsed.overlay;
    if (Number.isFinite(parsed.overlayPort) && parsed.overlayPort > 0 && parsed.overlayPort <= 65535) {
      cfg.overlayPort = parsed.overlayPort;
    }
    if (Array.isArray(parsed.quietProjects)) {
      cfg.quietProjects = parsed.quietProjects.filter((item) => typeof item === 'string');
    }
    return cfg;
  } catch {
    return cloneDefaultConfig();
  }
}

function cloneDefaultConfig() {
  return {
    ...DEFAULT_CONFIG,
    sounds: { ...DEFAULT_CONFIG.sounds },
    quietProjects: [...DEFAULT_CONFIG.quietProjects],
  };
}

function estimateDurationMs(transcriptPath) {
  try {
    if (!transcriptPath || typeof transcriptPath !== 'string') return null;

    let latestUserTs = null;
    let lastTs = null;
    for (const line of readFileSync(transcriptPath, 'utf8').split(/\r?\n/)) {
      if (!line.trim()) continue;

      let item;
      try {
        item = JSON.parse(line);
      } catch {
        continue;
      }

      const ts = readTimestamp(item);
      if (ts == null) continue;
      lastTs = ts;
      if (item?.type === 'user' || item?.role === 'user' || item?.message?.role === 'user') {
        latestUserTs = ts;
      }
    }

    if (latestUserTs == null || lastTs == null) return null;
    return Math.max(0, lastTs - latestUserTs);
  } catch {
    return null;
  }
}

function readTimestamp(item) {
  const value = item?.timestamp ?? item?.ts ?? item?.message?.timestamp;
  if (Number.isFinite(value)) return value < 1_000_000_000_000 ? value * 1000 : value;
  if (typeof value === 'string') {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function postEvent(body, port) {
  try {
    const json = JSON.stringify(body);
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: '/event',
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(json),
        },
        timeout: 50,
      },
      (res) => {
        res.resume();
      }
    );
    req.on('timeout', () => req.destroy());
    req.on('error', () => {});
    req.end(json);
  } catch {}
}
