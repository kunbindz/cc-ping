#!/usr/bin/env node
// cli.mjs — `cc-ping <command>` dispatcher. STATUS: STUB — Phase 1/6 (Codex).
//   cc-ping install     → install.mjs (merge hooks into ~/.claude/settings.json)
//   cc-ping uninstall   → uninstall.mjs (remove only cc-ping's hook entries)
const cmd = process.argv[2];

try {
  switch (cmd) {
    case 'install':
      await import('./install.mjs');
      break;
    case 'uninstall':
      await import('./uninstall.mjs');
      break;
    default:
      process.stdout.write(
        'cc-ping — Claude Code task notifier\n\n' +
          'Usage:\n  cc-ping install     Install the hook into ~/.claude/settings.json\n' +
          '  cc-ping uninstall   Remove the cc-ping hook\n'
      );
      process.exit(cmd ? 1 : 0);
  }
} catch (err) {
  process.stderr.write(`cc-ping ${cmd} failed: ${err?.message ?? err}\n`);
  process.exit(1);
}
