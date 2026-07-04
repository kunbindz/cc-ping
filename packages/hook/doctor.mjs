#!/usr/bin/env node
import { readConfigStatus } from './lib/config.mjs';
import { detectClaudeCodeVersion } from './lib/version-check.mjs';
import { HOOK_EVENTS, readSettings, settingsPath } from './lib/settings.mjs';

const json = process.argv.includes('--json');

try {
  const config = readConfigStatus();
  const hook = checkHookInstalled();
  const overlay = await checkOverlay(config.config.overlayPort);
  const version = detectClaudeCodeVersion();
  const checks = {
    hook,
    overlay,
    claudeCode: {
      ok: version.status === 'ok',
      status: version.status,
      version: version.version ?? null,
      detail: formatVersion(version),
    },
    config: {
      ok: config.ok,
      exists: config.exists,
      path: config.path,
      detail: formatConfig(config),
      issues: config.issues,
    },
  };

  if (json) {
    process.stdout.write(`${JSON.stringify({ ok: Object.values(checks).every((check) => check.ok), checks }, null, 2)}\n`);
  } else {
    line(checks.hook.ok, `Claude Code hooks ${checks.hook.ok ? 'installed' : 'not installed'}`, checks.hook.detail);
    line(checks.overlay.ok, `Overlay health http://127.0.0.1:${config.config.overlayPort}/health`, checks.overlay.detail);
    line(checks.claudeCode.ok, 'Claude Code version', checks.claudeCode.detail);
    line(checks.config.ok, `Config ${checks.config.path}`, checks.config.detail);
  }
} catch (err) {
  if (json) {
    process.stdout.write(`${JSON.stringify({ ok: false, error: err?.message ?? String(err) }, null, 2)}\n`);
  } else {
    line(false, 'cc-ping doctor failed', err?.message ?? String(err));
  }
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
    path: file,
    missing,
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
    return {
      ok,
      port,
      status: res.status,
      version: body?.version ?? null,
      detail: ok ? `ok${body?.version ? `, version ${body.version}` : ''}` : `HTTP ${res.status}`,
    };
  } catch (err) {
    return {
      ok: false,
      port,
      status: null,
      version: null,
      detail: err?.name === 'AbortError' ? 'timeout' : 'not reachable',
    };
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
  process.stdout.write(`${ok ? '\u2713' : '\u2717'} ${label}${detail ? ` - ${detail}` : ''}\n`);
}
