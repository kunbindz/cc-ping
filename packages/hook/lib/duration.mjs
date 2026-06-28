// Estimate turn duration from the transcript JSONL. NEVER throws.
// null is allowed and means "unknown", which is treated as over-threshold.
import { readFileSync } from 'node:fs';

/**
 * Estimate the duration (ms) of the turn that just ended.
 * Reads transcript_path as JSONL, skips malformed lines, then compares the
 * most recent user message timestamp with the last timestamp in the file.
 * @param {string|undefined} transcriptPath
 * @returns {number|null}
 */
export function estimateDurationMs(transcriptPath) {
  try {
    if (!transcriptPath || typeof transcriptPath !== 'string') return null;

    let latestUserTs = null;
    let lastTs = null;

    for (const line of readFileSync(transcriptPath, 'utf8').split(/\r?\n/)) {
      if (!line.trim()) continue;

      let item;
      try {
        item = JSON.parse(line);
      } catch {
        continue;
      }

      const ts = readTimestamp(item);
      if (ts == null) continue;

      lastTs = ts;
      if (isUserMessage(item)) {
        latestUserTs = ts;
      }
    }

    if (latestUserTs == null || lastTs == null) return null;
    return Math.max(0, lastTs - latestUserTs);
  } catch {
    return null;
  }
}

function isUserMessage(item) {
  return item?.type === 'user' || item?.role === 'user' || item?.message?.role === 'user';
}

function readTimestamp(item) {
  const value = item?.timestamp ?? item?.ts ?? item?.message?.timestamp;

  if (Number.isFinite(value)) {
    return value < 1_000_000_000_000 ? value * 1000 : value;
  }

  if (typeof value === 'string') {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
    }

    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }

  return null;
}
