// install.mjs — merge cc-ping hooks into ~/.claude/settings.json. STATUS: STUB — Phase 1 (Codex).
//
// Requirements (CODEX_BRIEF Phase 1):
//   - Read ~/.claude/settings.json (create {} if absent). Preserve all existing content.
//   - Add command hooks for Stop, SubagentStop, Notification → absolute path of notify.mjs:
//       { "type": "command", "command": "node \"<abs path to notify.mjs>\"" }
//   - MERGE, never overwrite. Idempotent: running twice must not duplicate cc-ping entries.
//     (Tag cc-ping entries so uninstall can find them — e.g. detect by the notify.mjs path.)
//   - Never clobber the user's own hooks in those arrays.
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const NOTIFY_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'notify.mjs');
const HOOK_EVENTS = ['Stop', 'SubagentStop', 'Notification'];

// TODO (Codex): implement the merge. Use ~/.claude/settings.json via os.homedir().
void NOTIFY_PATH;
void HOOK_EVENTS;
process.stdout.write('install.mjs not yet implemented — see CODEX_BRIEF.md Phase 1\n');
