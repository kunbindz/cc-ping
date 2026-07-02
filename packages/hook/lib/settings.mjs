import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const HOOK_EVENTS = ['Stop', 'SubagentStop', 'Notification'];

export function defaultNotifyPath(metaUrl) {
  return path.resolve(path.dirname(fileURLToPath(metaUrl)), 'notify.mjs');
}

export function settingsPath() {
  return path.join(os.homedir(), '.claude', 'settings.json');
}

export function resolveNotifyPath({ argv = process.argv.slice(2), env = process.env, defaultPath }) {
  const argPath = readNotifyArg(argv);
  const configured = argPath || env.CC_PING_NOTIFY_PATH || env.CC_PING_HOOK_NOTIFY_PATH;
  return path.resolve(configured || defaultPath);
}

export function commandForNotify(notifyPath) {
  return `node ${quoteShellArg(notifyPath)}`;
}

export function readSettings(file) {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function writeSettings(file, settings) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
}

export function blockHasNotify(block, notifyPath) {
  return Array.isArray(block?.hooks) && block.hooks.some((hook) => isNotifyHook(hook, notifyPath));
}

export function isNotifyHook(hook, notifyPath) {
  return hook?.type === 'command' && commandPointsAtNotify(hook.command, notifyPath);
}

function readNotifyArg(argv) {
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--notify' || arg === '--notify-path') {
      return argv[i + 1];
    }
    if (arg.startsWith('--notify=')) {
      return arg.slice('--notify='.length);
    }
    if (arg.startsWith('--notify-path=')) {
      return arg.slice('--notify-path='.length);
    }
  }
  return null;
}

function commandPointsAtNotify(command, notifyPath) {
  if (typeof command !== 'string') return false;
  const candidates = new Set([
    notifyPath,
    quoteShellArg(notifyPath).slice(1, -1),
    JSON.stringify(notifyPath).slice(1, -1),
  ]);

  return [...candidates].some((candidate) => candidate && command.includes(candidate));
}

function quoteShellArg(value) {
  if (process.platform === 'win32') {
    return `"${String(value).replace(/"/g, '\\"')}"`;
  }
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}
