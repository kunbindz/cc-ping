#!/usr/bin/env node
import { readConfigStatus } from './lib/config.mjs';
import { detectClaudeCodeVersion } from './lib/version-check.mjs';
import { HOOK_EVENTS, readSettings, settingsPath } from './lib/settings.mjs';

try {
  const config = readConfigStatus();
  const hook = checkHookInstalled();
  const overlay = await checkOverlay(config.config.overlayPort);
  const version = detectClaudeCodeVersion();

  line(hook.ok, `Claude Code hooks ${hook.ok ? 'installed' : 'not installed'}`, hook.detail);
  line(overlay.ok, `Overlay health http://127.0.0.1:${config.config.overlayPort}/health`, overlay.detail);
  line(version.status === 'ok', 'Claude Code version', formatVersion(version));
  line(config.ok, config.exists ? `Config ${config.path}` : `Config ${config.path}`, formatConfig(config));
} catch (err) {
  line(false, 'cc-ping doctor failed', err?.message ?? String(err));
} finally {
  process.exitCode = 0;
}

function checkHookInstalled() {
  const file = settingsPath();
  const settings = readSettings(file);
  const hooks = settings.hooks && typeof settings.hooks === 'object' && !Array.isArray(settings.hooks)
    ? settings.hooks
    : {};
  const missing = HOOK_EVENTS.filter((eventName) => !eventHasNotifyHook(hooks[eventName]));
  return {
    ok: missing.length === 0,
    detail: missing.length === 0 ? file : `${file}; missing ${missing.join(', ')}`,
  };
}

function eventHasNotifyHook(blocks) {
  return (
    Array.isArray(blocks) &&
    blocks.some((block) =>
      Array.isArray(block?.hooks) &&
      block.hooks.some((hook) => hook?.type === 'command' && typeof hook.command === 'string' && hook.command.includes('notify.mjs'))
    )
  );
}

async function checkOverlay(port) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 700);
    const res = await fetch(`http://127.0.0.1:${port}/health`, { signal: controller.signal });
    clearTimeout(timer);
    let body = null;
    try {
      body = await res.json();
    } catch {}
    const ok = res.status === 200 && body?.ok === true;
    return { ok, detail: ok ? `ok${body?.version ? `, version ${body.version}` : ''}` : `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, detail: err?.name === 'AbortError' ? 'timeout' : 'not reachable' };
  }
}

function formatVersion(version) {
  if (version.status === 'ok') return version.version;
  if (version.status === 'old') return `${version.version}; terminal bell needs Claude Code >= 2.1.141`;
  return 'not detected';
}

function formatConfig(config) {
  if (!config.exists) return 'missing; defaults will be used';
  if (config.ok) return 'valid';
  return config.issues.join('; ');
}

function line(ok, label, detail) {
  process.stdout.write(`${ok ? '✓' : '✗'} ${label}${detail ? ` - ${detail}` : ''}\n`);
}
