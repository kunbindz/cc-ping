// Merge cc-ping hooks into ~/.claude/settings.json. Idempotent and non-destructive.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NOTIFY_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'notify.mjs');
const HOOK_EVENTS = ['Stop', 'SubagentStop', 'Notification'];
const COMMAND = `node "${NOTIFY_PATH}"`;

export function settingsPath() {
  return path.join(os.homedir(), '.claude', 'settings.json');
}

export function install() {
  const file = settingsPath();
  const settings = readSettings(file);
  if (!settings.hooks || typeof settings.hooks !== 'object' || Array.isArray(settings.hooks)) {
    settings.hooks = {};
  }

  for (const eventName of HOOK_EVENTS) {
    const blocks = Array.isArray(settings.hooks[eventName]) ? settings.hooks[eventName] : [];
    if (!blocks.some((block) => blockHasCcPing(block))) {
      blocks.push({ hooks: [{ type: 'command', command: COMMAND }] });
    }
    settings.hooks[eventName] = blocks;
  }

  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
  return file;
}

function readSettings(file) {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function blockHasCcPing(block) {
  return Array.isArray(block?.hooks) && block.hooks.some(isCcPingHook);
}

function isCcPingHook(hook) {
  return hook?.type === 'command' && commandPointsAtNotify(hook.command);
}

function commandPointsAtNotify(command) {
  return (
    typeof command === 'string' &&
    (command.includes(NOTIFY_PATH) || command.includes(JSON.stringify(NOTIFY_PATH).slice(1, -1)))
  );
}

try {
  const file = install();
  process.stdout.write(`Installed cc-ping hooks in ${file}\n`);
} catch (err) {
  process.stderr.write(`Failed to install cc-ping hooks: ${err?.message ?? err}\n`);
  process.exitCode = 1;
}
