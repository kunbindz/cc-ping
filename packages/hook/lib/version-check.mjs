import { execFileSync } from 'node:child_process';

const MIN_VERSION = [2, 1, 141];

export function detectClaudeCodeVersion() {
  try {
    const output = execFileSync('claude', ['--version'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 1000,
      windowsHide: true,
      shell: process.platform === 'win32',
    });
    const version = parseVersion(output);
    if (!version) return { status: 'unknown' };
    return compareVersion(version.parts, MIN_VERSION) < 0
      ? { status: 'old', version: version.raw }
      : { status: 'ok', version: version.raw };
  } catch {
    return { status: 'unknown' };
  }
}

function parseVersion(output) {
  const match = String(output).match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return {
    raw: match[0],
    parts: match.slice(1).map((part) => Number(part)),
  };
}

function compareVersion(left, right) {
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const a = left[i] || 0;
    const b = right[i] || 0;
    if (a !== b) return a - b;
  }
  return 0;
}
