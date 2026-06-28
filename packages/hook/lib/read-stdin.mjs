// read-stdin.mjs — read all of stdin and JSON.parse it. NEVER throws.
// A hook that throws would interrupt Claude's turn, so parse failures must
// degrade to an empty object. (CONTRACT §3 rule 3.)
//
// STATUS: Phase 1 seed — verified working on Windows + Node 24. Build on this.
import { readFileSync } from 'node:fs';

/**
 * Read stdin (fd 0) fully and parse as JSON.
 * @returns {object} the parsed hook payload, or {} on any error.
 */
export function readStdin() {
  try {
    const raw = readFileSync(0, 'utf8');
    if (!raw || !raw.trim()) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}
