// Hook acceptance harness. Run with: node packages/hook/test/run.mjs
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  chmodSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HOOK_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NOTIFY = path.join(HOOK_DIR, 'notify.mjs');
const CLI = path.join(HOOK_DIR, 'cli.mjs');
const BEL = '\u0007';

let failures = 0;
const tempRoots = [];

function tempHome() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'cc-ping-test-'));
  tempRoots.push(dir);
  return dir;
}

function runNode(args, { stdin = '', home = tempHome(), timeoutMs = 2000, env = {} } = {}) {
  return new Promise((resolve) => {
    const childEnv = {
      ...process.env,
      HOME: home,
      USERPROFILE: home,
      ...env,
    };
    const child = spawn(process.execPath, args, {
      cwd: home,
      env: childEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);

    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code, timedOut, home });
    });
    child.stdin.end(stdin);
  });
}

function runNotify(stdin, options) {
  return runNode([NOTIFY], { stdin, ...options });
}

function check(name, cond, detail = '') {
  process.stdout.write(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` (${detail})` : ''}\n`);
  if (!cond) failures++;
}

function parseSettings(home) {
  return JSON.parse(readFileSync(path.join(home, '.claude', 'settings.json'), 'utf8'));
}

function writeConfig(home, config) {
  const dir = path.join(home, '.cc-ping');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'config.json'), `${JSON.stringify(config)}\n`, 'utf8');
}

function writeTranscript(home, name, rows) {
  const file = path.join(home, `${name}.jsonl`);
  writeFileSync(file, rows.map((row) => (typeof row === 'string' ? row : JSON.stringify(row))).join('\n'), 'utf8');
  return file;
}

function writeFakeClaude(home, version) {
  const bin = path.join(home, 'bin');
  mkdirSync(bin, { recursive: true });

  const posix = path.join(bin, 'claude');
  writeFileSync(posix, `#!/bin/sh\necho ${version}\n`, 'utf8');
  try {
    chmodSync(posix, 0o755);
  } catch {}

  const cmd = path.join(bin, 'claude.cmd');
  writeFileSync(cmd, `@echo off\r\necho ${version}\r\n`, 'utf8');
  return bin;
}

async function withServer(handler) {
  const events = [];
  const server = createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/event') {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        try {
          events.push(JSON.parse(body));
        } catch {
          events.push(null);
        }
        res.writeHead(204);
        res.end();
      });
      return;
    }

    res.writeHead(404);
    res.end();
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    return await handler(server.address().port, events);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

try {
  {
    const r = await runNotify('{"cwd":"/tmp/foo","hook_event_name":"Stop"}');
    const payload = JSON.parse(r.stdout || '{}');
    check('Stop emits terminalSequence, exit 0', r.code === 0 && payload.terminalSequence === BEL);
  }
  {
    const r = await runNotify('{"stop_hook_active":true}');
    check('stop_hook_active exits 0 with no output', r.code === 0 && r.stdout === '');
  }
  {
    const r = await runNotify('not json @#$');
    check('garbage stdin exits 0 without throwing', r.code === 0);
  }
  {
    const r = await runNotify('');
    check('empty stdin exits 0 without throwing', r.code === 0);
  }
  {
    const home = tempHome();
    writeConfig(home, { overlay: false });
    const r = await runNotify('{"cwd":"/tmp/foo","hook_event_name":"Notification"}', { home });
    const payload = JSON.parse(r.stdout || '{}');
    check('notify.mjs runs from any working directory', r.code === 0 && payload.terminalSequence === BEL);
  }
  {
    const home = tempHome();
    writeConfig(home, { minDurationMs: 10000, overlay: false });
    const transcript = writeTranscript(home, 'short', [
      { type: 'user', timestamp: '2026-06-28T00:00:00.000Z' },
      { type: 'assistant', timestamp: '2026-06-28T00:00:05.000Z' },
    ]);
    const r = await runNotify(
      JSON.stringify({ cwd: '/tmp/foo', hook_event_name: 'Stop', transcript_path: transcript }),
      { home }
    );
    check('short Stop below minDurationMs stays silent', r.code === 0 && r.stdout === '');
  }
  {
    const home = tempHome();
    writeConfig(home, { minDurationMs: 10000, overlay: false });
    const transcript = writeTranscript(home, 'long', [
      { type: 'user', timestamp: '2026-06-28T00:00:00.000Z' },
      { type: 'assistant', timestamp: '2026-06-28T00:00:12.000Z' },
    ]);
    const r = await runNotify(
      JSON.stringify({ cwd: '/tmp/foo', hook_event_name: 'Stop', transcript_path: transcript }),
      { home }
    );
    const payload = JSON.parse(r.stdout || '{}');
    check('long Stop over threshold rings bell', r.code === 0 && payload.terminalSequence === BEL);
  }
  {
    const home = tempHome();
    writeConfig(home, { quietProjects: ['foo'], overlay: false });
    const r = await runNotify('{"cwd":"/tmp/foo","hook_event_name":"Notification"}', { home });
    check('quietProjects silences all signal paths', r.code === 0 && r.stdout === '');
  }
  {
    const home = tempHome();
    writeConfig(home, { minDurationMs: 999999, overlay: false });
    const r = await runNotify('{"cwd":"/tmp/foo","hook_event_name":"Notification"}', { home });
    const payload = JSON.parse(r.stdout || '{}');
    check('Notification bypasses duration threshold', r.code === 0 && payload.terminalSequence === BEL);
  }
  {
    const home = tempHome();
    writeConfig(home, { bell: false, overlay: false });
    const r = await runNotify('{"cwd":"/tmp/foo","hook_event_name":"Stop"}', { home });
    check('config.bell=false omits terminalSequence', r.code === 0 && r.stdout === '');
  }
  {
    await withServer(async (port, events) => {
      const home = tempHome();
      writeConfig(home, { bell: false, overlay: true, overlayPort: port });
      const transcript = writeTranscript(home, 'post', [
        'malformed',
        { type: 'user', timestamp: 1000 },
        { type: 'assistant', timestamp: 1012 },
      ]);
      const r = await runNotify(
        JSON.stringify({
          cwd: '/tmp/foo',
          hook_event_name: 'SubagentStop',
          session_id: 'abc123',
          agent_type: 'reviewer',
          transcript_path: transcript,
        }),
        { home }
      );
      await new Promise((resolve) => setTimeout(resolve, 500));
      check('POST sends contract body to overlay', r.code === 0 && events.length === 1);
      check(
        'POST maps SubagentStop to done with metadata',
        events[0]?.type === 'done' &&
          events[0]?.project === 'foo' &&
          events[0]?.sessionId === 'abc123' &&
          events[0]?.agentType === 'reviewer' &&
          events[0]?.durationMs === 12000
      );
    });
  }
  {
    const home = tempHome();
    writeConfig(home, { overlay: true, overlayPort: 9 });
    const started = Date.now();
    const r = await runNotify('{"cwd":"/tmp/foo","hook_event_name":"Stop"}', { home });
    check('overlay down exits fast and still rings bell', r.code === 0 && Date.now() - started < 1000 && r.stdout.includes('terminalSequence'));
  }
  {
    const home = tempHome();
    const claudeDir = path.join(home, '.claude');
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(
      path.join(claudeDir, 'settings.json'),
      JSON.stringify({
        hooks: {
          Stop: [{ hooks: [{ type: 'command', command: 'node other.mjs' }] }],
        },
        keep: true,
      }),
      'utf8'
    );

    const first = await runNode([CLI, 'install'], { home });
    const second = await runNode([CLI, 'install'], { home });
    const settings = parseSettings(home);
    const stopHooks = settings.hooks.Stop.flatMap((block) => block.hooks ?? []);
    const ccPingHooks = stopHooks.filter((hook) => hook.command?.includes('notify.mjs'));
    check('install succeeds twice', first.code === 0 && second.code === 0);
    check('install is idempotent and preserves existing hooks', ccPingHooks.length === 1 && stopHooks.some((hook) => hook.command === 'node other.mjs') && settings.keep === true);

    const uninstall = await runNode([CLI, 'uninstall'], { home });
    const after = parseSettings(home);
    const afterStopHooks = after.hooks.Stop.flatMap((block) => block.hooks ?? []);
    check('uninstall succeeds', uninstall.code === 0);
    check('uninstall removes only cc-ping hook entries', afterStopHooks.length === 1 && afterStopHooks[0].command === 'node other.mjs');
  }
  {
    const home = tempHome();
    const bundledNotify = path.join(home, 'overlay bundle', 'hook', 'notify.mjs');
    const install = await runNode([CLI, 'install', '--notify', bundledNotify], { home });
    const settings = parseSettings(home);
    const stopHooks = settings.hooks.Stop.flatMap((block) => block.hooks ?? []);
    check('install accepts explicit bundled notify path', install.code === 0 && stopHooks.some((hook) => hook.command?.includes(bundledNotify)));

    const second = await runNode([CLI, 'install', '--notify', bundledNotify], { home });
    const afterSecond = parseSettings(home);
    const ccPingHooks = afterSecond.hooks.Stop
      .flatMap((block) => block.hooks ?? [])
      .filter((hook) => hook.command?.includes(bundledNotify));
    check('explicit notify install stays idempotent', second.code === 0 && ccPingHooks.length === 1);

    const uninstall = await runNode([CLI, 'uninstall', '--notify', bundledNotify], { home });
    const afterUninstall = parseSettings(home);
    const remaining = afterUninstall.hooks.Stop
      .flatMap((block) => block.hooks ?? [])
      .filter((hook) => hook.command?.includes(bundledNotify));
    check('uninstall accepts explicit bundled notify path', uninstall.code === 0 && remaining.length === 0);
  }
  {
    const home = tempHome();
    const bin = writeFakeClaude(home, '2.1.140');
    const r = await runNode([CLI, 'install'], {
      home,
      env: { PATH: `${bin}${path.delimiter}${process.env.PATH || ''}` },
    });
    check('install warns for Claude Code older than 2.1.141', r.code === 0 && r.stderr.includes('older than 2.1.141'));
  }
} finally {
  for (const dir of tempRoots) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {}
  }
}

process.stdout.write(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
