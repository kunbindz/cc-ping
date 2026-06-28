// Fire-and-forget POST to the overlay. NEVER throws, NEVER blocks turn end.
// CONTRACT: timeout <=300ms, swallow errors, no retry.
import { spawn } from 'node:child_process';

const TIMEOUT_MS = 300;
const HELPER = `
const port = Number(process.argv[1]) || 47321;
let body = {};
try { body = JSON.parse(process.argv[2] || '{}'); } catch {}
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), ${TIMEOUT_MS});
timer.unref?.();
fetch('http://127.0.0.1:' + port + '/event', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
  signal: controller.signal
}).catch(() => {}).finally(() => clearTimeout(timer));
`;

/**
 * POST an event to the overlay at 127.0.0.1:<port>/event. Fire-and-forget.
 * @param {{type:string, project:string, cwd?:string, sessionId?:string|null,
 *          agentType?:string|null, durationMs?:number|null, ts:number}} body
 * @param {number} [port=47321]
 */
export function postEvent(body, port = 47321) {
  try {
    const child = spawn(process.execPath, ['-e', HELPER, String(port), JSON.stringify(body)], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.unref();
  } catch {
    // Overlay delivery is best-effort only.
  }
}
