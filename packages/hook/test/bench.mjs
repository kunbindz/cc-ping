import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HOOK_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NOTIFY = path.join(HOOK_DIR, 'notify.mjs');
const RUNS = Number(process.env.CC_PING_BENCH_RUNS || 50);
const WARMUP = 5;

const tempRoots = [];

function tempHome() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'cc-ping-bench-'));
  tempRoots.push(dir);
  return dir;
}

function writeConfig(home, config) {
  const dir = path.join(home, '.cc-ping');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'config.json'), `${JSON.stringify(config)}\n`, 'utf8');
}

function runProcess(args, stdin, home) {
  return new Promise((resolve) => {
    const started = process.hrtime.bigint();
    const child = spawn(process.execPath, args, {
      cwd: home,
      env: { ...process.env, HOME: home, USERPROFILE: home },
      stdio: ['pipe', 'ignore', 'ignore'],
      windowsHide: true,
    });

    child.on('close', () => {
      const elapsedMs = Number(process.hrtime.bigint() - started) / 1_000_000;
      resolve(elapsedMs);
    });
    child.stdin.end(stdin);
  });
}

async function baseline() {
  const home = tempHome();
  const samples = [];

  for (let i = 0; i < WARMUP + RUNS; i += 1) {
    const elapsed = await runProcess(['-e', ''], '', home);
    if (i >= WARMUP) samples.push(elapsed);
  }

  return summarize('node startup baseline', samples);
}

async function bench(name, config) {
  const home = tempHome();
  writeConfig(home, { minDurationMs: 0, bell: true, ...config });
  const stdin = JSON.stringify({ cwd: home, hook_event_name: 'Notification' });
  const samples = [];

  for (let i = 0; i < WARMUP + RUNS; i += 1) {
    const elapsed = await runProcess([NOTIFY], stdin, home);
    if (i >= WARMUP) samples.push(elapsed);
  }

  return summarize(name, samples);
}

function summarize(name, samples) {
  samples.sort((a, b) => a - b);
  return {
    name,
    runs: RUNS,
    min: samples[0],
    median: percentile(samples, 0.5),
    p95: percentile(samples, 0.95),
    max: samples[samples.length - 1],
  };
}

function percentile(samples, p) {
  const index = Math.min(samples.length - 1, Math.ceil(samples.length * p) - 1);
  return samples[index];
}

function fmt(ms) {
  return `${ms.toFixed(1)}ms`;
}

try {
  const base = await baseline();
  const results = [
    await bench('bell only (overlay disabled)', { overlay: false }),
    await bench('overlay down (local POST failure)', { overlay: true, overlayPort: 9 }),
  ];

  process.stdout.write(
    `${base.name}: median ${fmt(base.median)}, p95 ${fmt(base.p95)}, ` +
      `min ${fmt(base.min)}, max ${fmt(base.max)} (${base.runs} runs)\n`
  );

  for (const result of results) {
    const netMedian = Math.max(0, result.median - base.median);
    const netP95 = Math.max(0, result.p95 - base.p95);
    process.stdout.write(
      `${result.name}: median ${fmt(result.median)}, p95 ${fmt(result.p95)}, ` +
        `net median +${fmt(netMedian)}, net p95 +${fmt(netP95)} (${result.runs} runs)\n`
    );
    result.netMedian = netMedian;
  }

  const full = results[results.length - 1];
  process.exit(full.netMedian < 50 ? 0 : 1);
} finally {
  for (const dir of tempRoots) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {}
  }
}
