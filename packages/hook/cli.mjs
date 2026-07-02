#!/usr/bin/env node
const [cmd] = process.argv.slice(2);

try {
  switch (cmd) {
    case 'install':
      await import('./install.mjs');
      break;
    case 'uninstall':
      await import('./uninstall.mjs');
      break;
    case '--help':
    case '-h':
    case undefined:
      printHelp();
      process.exit(0);
      break;
    default:
      process.stderr.write(`Unknown cc-ping command: ${cmd}\n\n`);
      printHelp();
      process.exit(1);
  }
} catch (err) {
  process.stderr.write(`cc-ping ${cmd} failed: ${err?.message ?? err}\n`);
  process.exit(1);
}

function printHelp() {
  process.stdout.write(`cc-ping - Claude Code task notifier

Usage:
  cc-ping install [--notify <path>]     Install hooks into ~/.claude/settings.json
  cc-ping uninstall [--notify <path>]   Remove cc-ping hooks from settings.json

Options:
  --notify, --notify-path <path>        Absolute or relative path to notify.mjs

Environment:
  CC_PING_NOTIFY_PATH                   Alternative way to set the notify.mjs target
`);
}
