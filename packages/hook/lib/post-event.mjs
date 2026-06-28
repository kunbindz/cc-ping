// post-event.mjs — fire-and-forget POST to the overlay. NEVER throws, NEVER blocks turn end.
// CONTRACT §2 (body) + §3 Path B (timeout ≤300ms, swallow errors, no retry).
// STATUS: STUB — Phase 5 (Codex).

const TIMEOUT_MS = 300;

/**
 * POST an event to the overlay at 127.0.0.1:<port>/event. Fire-and-forget.
 * @param {{type:string, project:string, cwd?:string, sessionId?:string|null,
 *          agentType?:string|null, durationMs?:number|null, ts:number}} body
 * @param {number} [port=47321]
 */
export function postEvent(body, port = 47321) {
  // TODO (Codex, Phase 5): use global fetch with AbortController(TIMEOUT_MS).
  // Do not await in a way that delays process exit beyond the bell. Swallow all errors:
  //   fetch(url, {method:'POST', signal, headers, body: JSON.stringify(body)}).catch(()=>{});
  // Consider `process.exitCode = 0` semantics — the bell was already written synchronously.
  void body;
  void port;
  void TIMEOUT_MS;
}
