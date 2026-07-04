#!/usr/bin/env node
import { readConfigStatus } from './lib/config.mjs';

const VALID_TYPES = new Set(['done', 'waiting', 'error']);

try {
  const type = readType(process.argv.slice(2));
  if (!VALID_TYPES.has(type)) {
    process.stderr.write(`Invalid --type "${type}". Use done, waiting, or error.\n`);
    process.exitCode = 1;
  } else {
    const { config } = readConfigStatus();
    const result = await postTestEvent(config.overlayPort, type);
    if (result.ok) {
      process.stdout.write(`✓ Overlay accepted ${type} test event on port ${config.overlayPort}\n`);
    } else {
      process.stdout.write(`✗ Overlay did not answer on port ${config.overlayPort}: ${result.detail}\n`);
    }
  }
} catch (err) {
  process.stderr.write(`cc-ping test failed: ${err?.message ?? err}\n`);
  process.exitCode = 1;
}

function readType(argv) {
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--type') return argv[i + 1] || '';
    if (arg.startsWith('--type=')) return arg.slice('--type='.length);
  }
  return 'done';
}

async function postTestEvent(port, type) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1000);
    const res = await fetch(`http://127.0.0.1:${port}/event`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type, project: 'cc-ping test', ts: Date.now() }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    return { ok: res.status === 204, detail: `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, detail: err?.name === 'AbortError' ? 'timeout' : 'not reachable' };
  }
}
