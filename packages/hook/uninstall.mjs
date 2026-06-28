// Remove ONLY cc-ping's hook entries from ~/.claude/settings.json.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NOTIFY_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'notify.mjs');
const HOOK_EVENTS = ['Stop', 'SubagentStop', 'Notification'];

export function settingsPath() {
  return path.join(os.homedir(), '.claude', 'settings.json');
}

export function uninstall() {
  const file = settingsPath();
  const settings = readSettings(file);

  if (settings.hooks && typeof settings.hooks === 'object' && !Array.isArray(settings.hooks)) {
    for (const eventName of HOOK_EVENTS) {
      if (!Array.isArray(settings.hooks[eventName])) continue;

      const keptBlocks = [];
      for (const block of settings.hooks[eventName]) {
        if (!Array.isArray(block?.hooks)) {
          keptBlocks.push(block);
          continue;
        }

        const nextHooks = block.hooks.filter((hook) => !isCcPingHook(hook));
        if (nextHooks.length > 0) {
          keptBlocks.push({ ...block, hooks: nextHooks });
        }
      }
      settings.hooks[eventName] = keptBlocks;
    }
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
  const file = uninstall();
  process.stdout.write(`Removed cc-ping hooks from ${file}\n`);
} catch (err) {
  process.stderr.write(`Failed to uninstall cc-ping hooks: ${err?.message ?? err}\n`);
  process.exitCode = 1;
}
