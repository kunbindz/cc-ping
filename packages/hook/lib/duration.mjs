// duration.mjs — estimate turn duration from the transcript JSONL. NEVER throws.
// CONTRACT §3: null is allowed and means "unknown" → treated as over-threshold.
// STATUS: STUB — Phase 2 (Codex).

/**
 * Estimate the duration (ms) of the turn that just ended.
 * Approach (pragmatic): read transcript_path (JSONL), parse each line (skip bad lines),
 * find timestamp of the most recent `user` message and of the last message; return the
 * difference. Unreadable / not enough data → null.
 * @param {string|undefined} transcriptPath
 * @returns {number|null}
 */
export function estimateDurationMs(transcriptPath) {
  // TODO (Codex, Phase 2): implement JSONL parse. Return null on any failure.
  if (!transcriptPath) return null;
  return null;
}
