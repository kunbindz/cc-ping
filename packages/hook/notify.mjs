#!/usr/bin/env node
// cc-ping hook entrypoint. Registered on Stop / SubagentStop / Notification.
// Hard rules: always exit 0, never throw, and emit nothing for stop_hook_active.
import { closeSync, fstatSync, openSync, readFileSync, readSync } from 'node:fs';
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
  summary: { mode: 'heuristic', baseUrl: null, model: null, apiKeyEnv: null },
  quietProjects: [],
};

const MAX_TRANSCRIPT_BYTES = 256 * 1024;
const MAX_TRANSCRIPT_LINES = 500;
const MAX_SUMMARY_CHARS = 120;
const LLM_TIMEOUT_MS = 120;

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
  const transcript = type === 'done' ? readTranscriptTail(input.transcript_path) : null;
  // Only 'done' (Stop/SubagentStop) is subject to the min-duration threshold. 'waiting' and
  // 'error' come from Notifications ("Claude needs you now") and must always alert.
  const durationMs = type === 'done' ? estimateDurationMs(transcript) : null;

  if (config.quietProjects.includes(project)) {
    process.exit(0);
  }

  if (type === 'done' && durationMs != null && durationMs < config.minDurationMs) {
    process.exit(0);
  }

  if (config.bell) {
    process.stdout.write(JSON.stringify({ terminalSequence: '\u0007' }));
  }

  const heuristicSummary = type === 'done' ? summarizeTranscript(transcript) : null;
  const summary = type === 'done' ? await resolveSummary(config, transcript, heuristicSummary) : null;

  if (config.overlay) {
    postEvent(
      {
        type,
        project,
        cwd,
        sessionId: input.session_id ?? null,
        agentType: input.agent_type ?? null,
        durationMs,
        summary,
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
    if (parsed.summary && typeof parsed.summary === 'object' && !Array.isArray(parsed.summary)) {
      cfg.summary = { ...cfg.summary, ...parsed.summary };
      if (!['off', 'heuristic', 'llm'].includes(cfg.summary.mode)) cfg.summary.mode = 'heuristic';
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
    summary: { ...DEFAULT_CONFIG.summary },
    quietProjects: [...DEFAULT_CONFIG.quietProjects],
  };
}

function readTranscriptTail(transcriptPath) {
  try {
    if (!transcriptPath || typeof transcriptPath !== 'string') return null;

    const fd = openSync(transcriptPath, 'r');
    try {
      const stat = fstatSync(fd);
      const length = Math.min(stat.size, MAX_TRANSCRIPT_BYTES);
      const start = Math.max(0, stat.size - length);
      const buffer = Buffer.alloc(length);
      const bytesRead = readSync(fd, buffer, 0, length, start);
      let text = buffer.subarray(0, bytesRead).toString('utf8');
      if (start > 0) {
        const firstNewline = text.indexOf('\n');
        if (firstNewline === -1) return null;
        text = text.slice(firstNewline + 1);
      }

      const records = [];
      const lines = text.split(/\r?\n/).filter((line) => line.trim()).slice(-MAX_TRANSCRIPT_LINES);
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          if (parsed && typeof parsed === 'object') records.push(parsed);
        } catch {}
      }
      return records.length > 0 ? records : null;
    } finally {
      closeSync(fd);
    }
  } catch {
    return null;
  }
}

function estimateDurationMs(records) {
  try {
    if (!Array.isArray(records)) return null;

    let latestUserTs = null;
    let lastTs = null;
    for (const item of records) {
      if (!item || typeof item !== 'object') continue;

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

function summarizeTranscript(records) {
  try {
    if (!Array.isArray(records)) return null;
    const sinceUser = afterLastUser(records);
    if (sinceUser.length === 0) return null;

    const editedFiles = new Set();
    let ranTests = false;
    let commits = 0;

    for (const item of sinceUser) {
      for (const tool of collectToolUses(item)) {
        const name = String(tool.name || '').toLowerCase();
        const input = tool.input && typeof tool.input === 'object' ? tool.input : {};
        const text = JSON.stringify(input).toLowerCase();

        if (isEditTool(name, text)) {
          const file = input.file_path || input.path || input.filename || input.target_file || input.target;
          if (typeof file === 'string' && file.trim()) editedFiles.add(file.trim());
        }

        if (name.includes('shell') || name.includes('bash') || name.includes('powershell')) {
          const command = String(input.command || input.cmd || input.script || '');
          if (/\b(test|pytest|vitest|jest|pnpm test|npm test|cargo test|go test)\b/i.test(command)) {
            ranTests = true;
          }
          const commitMatches = command.match(/\bgit\s+commit\b/gi);
          if (commitMatches) commits += commitMatches.length;
        }
      }
    }

    const parts = [];
    if (editedFiles.size > 0) parts.push(`edited ${editedFiles.size} ${editedFiles.size === 1 ? 'file' : 'files'}`);
    if (ranTests) parts.push('ran tests');
    if (commits > 0) parts.push(`${commits} ${commits === 1 ? 'commit' : 'commits'}`);

    return cleanSummary(parts.join(' \u00b7 '));
  } catch {
    return null;
  }
}

function afterLastUser(records) {
  let start = -1;
  for (let i = records.length - 1; i >= 0; i -= 1) {
    const item = records[i];
    if (item?.type === 'user' || item?.role === 'user' || item?.message?.role === 'user') {
      start = i;
      break;
    }
  }
  return start >= 0 ? records.slice(start + 1) : [];
}

function collectToolUses(item) {
  const out = [];
  const stack = [item];
  while (stack.length > 0 && out.length < 200) {
    const value = stack.pop();
    if (!value || typeof value !== 'object') continue;
    if (Array.isArray(value)) {
      for (const entry of value) stack.push(entry);
      continue;
    }
    if (value.type === 'tool_use' || value.tool_use_id || value.name) {
      if (value.name || value.input) out.push(value);
    }
    for (const key of ['content', 'message', 'toolUse', 'tool_use', 'tool_calls']) {
      if (value[key]) stack.push(value[key]);
    }
  }
  return out;
}

function isEditTool(name, text) {
  return (
    name.includes('edit') ||
    name.includes('write') ||
    name.includes('patch') ||
    text.includes('file_path') ||
    text.includes('target_file')
  );
}

async function resolveSummary(config, records, heuristic) {
  try {
    const summaryConfig = config.summary || DEFAULT_CONFIG.summary;
    if (summaryConfig.mode === 'off') return null;
    if (summaryConfig.mode !== 'llm') return heuristic;
    return (await llmSummary(summaryConfig, records, heuristic)) || heuristic;
  } catch {
    return heuristic;
  }
}

async function llmSummary(summaryConfig, records, heuristic) {
  try {
    if (!summaryConfig.baseUrl || !summaryConfig.model || !summaryConfig.apiKeyEnv) return null;
    const apiKey = process.env[summaryConfig.apiKeyEnv];
    if (!apiKey) return null;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
    const url = `${String(summaryConfig.baseUrl).replace(/\/$/, '')}/chat/completions`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: summaryConfig.model,
        temperature: 0,
        max_tokens: 40,
        messages: [
          {
            role: 'system',
            content: 'Return one concise activity summary under 120 characters. No newline.',
          },
          {
            role: 'user',
            content: JSON.stringify({ heuristic, tail: afterLastUser(records).slice(-30) }).slice(0, 12000),
          },
        ],
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    return cleanSummary(data?.choices?.[0]?.message?.content);
  } catch {
    return null;
  }
}

function cleanSummary(value) {
  if (typeof value !== 'string') return null;
  const oneLine = value.replace(/\s+/g, ' ').trim();
  if (!oneLine) return null;
  return oneLine.length <= MAX_SUMMARY_CHARS ? oneLine : `${oneLine.slice(0, MAX_SUMMARY_CHARS - 1).trim()}…`;
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
