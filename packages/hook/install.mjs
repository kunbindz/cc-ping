#!/usr/bin/env node
// Merge cc-ping hooks into ~/.claude/settings.json. Idempotent and non-destructive.
import { detectClaudeCodeVersion } from './lib/version-check.mjs';
import {
  HOOK_EVENTS,
  blockHasNotify,
  commandForNotify,
  defaultNotifyPath,
  readSettings,
  resolveNotifyPath,
  settingsPath,
  writeSettings,
} from './lib/settings.mjs';

const DEFAULT_NOTIFY_PATH = defaultNotifyPath(import.meta.url);

export function install({ notifyPath = DEFAULT_NOTIFY_PATH, warnVersion = true } = {}) {
  const absoluteNotifyPath = resolveNotifyPath({
    argv: [],
    env: {},
    defaultPath: notifyPath,
  });
  const file = settingsPath();
  const settings = readSettings(file);
  const command = commandForNotify(absoluteNotifyPath);

  if (!settings.hooks || typeof settings.hooks !== 'object' || Array.isArray(settings.hooks)) {
    settings.hooks = {};
  }

  for (const eventName of HOOK_EVENTS) {
    const blocks = Array.isArray(settings.hooks[eventName]) ? settings.hooks[eventName] : [];
    if (!blocks.some((block) => blockHasNotify(block, absoluteNotifyPath))) {
      blocks.push({ hooks: [{ type: 'command', command }] });
    }
    settings.hooks[eventName] = blocks;
  }

  writeSettings(file, settings);

  if (warnVersion) {
    const result = detectClaudeCodeVersion();
    if (result.status === 'old') {
      process.stderr.write(
        `cc-ping warning: Claude Code ${result.version} is older than 2.1.141; ` +
          'terminal bell fallback may require the overlay to be running.\n'
      );
    }
  }

  return { settingsPath: file, notifyPath: absoluteNotifyPath };
}

try {
  const notifyPath = resolveNotifyPath({
    argv: process.argv.slice(2),
    env: process.env,
    defaultPath: DEFAULT_NOTIFY_PATH,
  });
  const result = install({ notifyPath });
  process.stdout.write(`Installed cc-ping hooks in ${result.settingsPath}\n`);
  process.stdout.write(`Notify target: ${result.notifyPath}\n`);
} catch (err) {
  process.stderr.write(`Failed to install cc-ping hooks: ${err?.message ?? err}\n`);
  process.exitCode = 1;
}
