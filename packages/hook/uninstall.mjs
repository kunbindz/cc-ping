#!/usr/bin/env node
// Remove ONLY cc-ping's hook entries from ~/.claude/settings.json.
import {
  HOOK_EVENTS,
  defaultNotifyPath,
  isNotifyHook,
  readSettings,
  resolveNotifyPath,
  settingsPath,
  writeSettings,
} from './lib/settings.mjs';

const DEFAULT_NOTIFY_PATH = defaultNotifyPath(import.meta.url);

export function uninstall({ notifyPath = DEFAULT_NOTIFY_PATH } = {}) {
  const absoluteNotifyPath = resolveNotifyPath({
    argv: [],
    env: {},
    defaultPath: notifyPath,
  });
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

        const nextHooks = block.hooks.filter((hook) => !isNotifyHook(hook, absoluteNotifyPath));
        if (nextHooks.length > 0) {
          keptBlocks.push({ ...block, hooks: nextHooks });
        }
      }
      settings.hooks[eventName] = keptBlocks;
    }
  }

  writeSettings(file, settings);
  return { settingsPath: file, notifyPath: absoluteNotifyPath };
}

try {
  const notifyPath = resolveNotifyPath({
    argv: process.argv.slice(2),
    env: process.env,
    defaultPath: DEFAULT_NOTIFY_PATH,
  });
  const result = uninstall({ notifyPath });
  process.stdout.write(`Removed cc-ping hooks from ${result.settingsPath}\n`);
  process.stdout.write(`Notify target: ${result.notifyPath}\n`);
} catch (err) {
  process.stderr.write(`Failed to uninstall cc-ping hooks: ${err?.message ?? err}\n`);
  process.exitCode = 1;
}
