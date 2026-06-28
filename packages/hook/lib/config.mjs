// Read ~/.cc-ping/config.json with per-key defaults. NEVER throws.
// CONTRACT section 4 is the authoritative schema.
import { readFileSync } from 'node:fs';
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
 * Missing/malformed file -> DEFAULT_CONFIG. Must never throw.
 * @returns {typeof DEFAULT_CONFIG}
 */
export function loadConfig() {
  try {
    const raw = readFileSync(configPath(), 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return cloneDefaultConfig();
    }

    const cfg = cloneDefaultConfig();

    if (Number.isFinite(parsed.minDurationMs)) {
      cfg.minDurationMs = Math.max(0, parsed.minDurationMs);
    }
    if (typeof parsed.bell === 'boolean') {
      cfg.bell = parsed.bell;
    }
    if (typeof parsed.overlay === 'boolean') {
      cfg.overlay = parsed.overlay;
    }
    if (
      Number.isFinite(parsed.overlayPort) &&
      parsed.overlayPort > 0 &&
      parsed.overlayPort <= 65535
    ) {
      cfg.overlayPort = parsed.overlayPort;
    }
    if (parsed.sounds && typeof parsed.sounds === 'object' && !Array.isArray(parsed.sounds)) {
      cfg.sounds = { ...cfg.sounds, ...parsed.sounds };
    }
    if (Array.isArray(parsed.quietProjects)) {
      cfg.quietProjects = parsed.quietProjects.filter((item) => typeof item === 'string');
    }

    return cfg;
  } catch {
    return cloneDefaultConfig();
  }
}

function cloneDefaultConfig() {
  return {
    ...DEFAULT_CONFIG,
    sounds: { ...DEFAULT_CONFIG.sounds },
    quietProjects: [...DEFAULT_CONFIG.quietProjects],
  };
}
