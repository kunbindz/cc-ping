// test/run.mjs — acceptance harness for the hook. Spawns notify.mjs with stdin payloads
// and asserts the CONTRACT §3 behavior. Run: `node test/run.mjs` (or `pnpm test:hook`).
// Phase 1 cases are live below. Codex: add Phase 2 / Phase 5 cases as you implement them.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const NOTIFY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'notify.mjs');

/** Run notify.mjs with the given stdin string; resolve { stdout, code }. */
function run(stdin) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [NOTIFY], { stdio: ['pipe', 'pipe', 'inherit'] });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.on('close', (code) => resolve({ stdout: out, code }));
    p.stdin.end(stdin);
  });
}

let failures = 0;
function check(name, cond) {
  process.stdout.write(`${cond ? 'PASS' : 'FAIL'}  ${name}\n`);
  if (!cond) failures++;
}

// ── Phase 1 acceptance (CONTRACT §3) ────────────────────────────────────────
{
  const r = await run('{"cwd":"/tmp/foo","hook_event_name":"Stop"}');
  check('Stop → emits terminalSequence, exit 0',
    r.code === 0 && r.stdout.includes('terminalSequence') && JSON.parse(r.stdout).terminalSequence === '');
}
{
  const r = await run('{"stop_hook_active":true}');
  check('stop_hook_active → exit 0, no terminalSequence',
    r.code === 0 && !r.stdout.includes('terminalSequence'));
}
{
  const r = await run('not json @#$');
  check('garbage stdin → exit 0, no throw', r.code === 0);
}
{
  const r = await run('');
  check('empty stdin → exit 0, no throw', r.code === 0);
}

// TODO (Codex): Phase 2 cases — threshold silences short tasks, quietProjects, config defaults.
// TODO (Codex): Phase 5 cases — POST attempted but overlay-down still exits 0 fast.

process.stdout.write(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILED'}\n`);
process.exit(failures === 0 ? 0 : 1);
