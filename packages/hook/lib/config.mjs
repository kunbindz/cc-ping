// config.mjs — read ~/.cc-ping/config.json with per-key defaults. NEVER throws.
// CONTRACT §4 is the authoritative schema. STATUS: STUB — Phase 2 (Codex).
import os from 'node:os';
import path from 'node:path';

export const DEFAULT_CONFIG = {
  minDurationMs: 10000,
  bell: true,
  overlay: true,
  overlayPort: 47321,
  sounds: { done: 'ting', waiting: 'soft', error: 'buzz' },
  quietProjects: [],
};

export function configPath() {
  return path.join(os.homedir(), '.cc-ping', 'config.json');
}

/**
 * Load config, merging file values over DEFAULT_CONFIG per-key.
 * Missing/malformed file → DEFAULT_CONFIG. Must never throw.
 * @returns {typeof DEFAULT_CONFIG}
 */
export function loadConfig() {
  // TODO (Codex, Phase 2): readFileSync(configPath()), JSON.parse in try/catch,
  // shallow-merge known keys over DEFAULT_CONFIG, validate types, fall back per-key.
  return { ...DEFAULT_CONFIG };
}
