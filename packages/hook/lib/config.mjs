import { existsSync, readFileSync } from 'node:fs';
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

export function readConfigStatus(file = configPath()) {
  try {
    if (!existsSync(file)) {
      return { ok: true, exists: false, path: file, config: cloneDefaultConfig(), issues: [] };
    }

    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {
        ok: false,
        exists: true,
        path: file,
        config: cloneDefaultConfig(),
        issues: ['config root must be an object'],
      };
    }

    const issues = validateConfig(parsed);
    return {
      ok: issues.length === 0,
      exists: true,
      path: file,
      config: mergeConfig(parsed),
      issues,
    };
  } catch (err) {
    return {
      ok: false,
      exists: true,
      path: file,
      config: cloneDefaultConfig(),
      issues: [err?.message ?? 'failed to read config'],
    };
  }
}

function validateConfig(value) {
  const issues = [];
  if ('minDurationMs' in value && !Number.isFinite(value.minDurationMs)) {
    issues.push('minDurationMs must be a number');
  }
  if ('bell' in value && typeof value.bell !== 'boolean') {
    issues.push('bell must be a boolean');
  }
  if ('overlay' in value && typeof value.overlay !== 'boolean') {
    issues.push('overlay must be a boolean');
  }
  if (
    'overlayPort' in value &&
    (!Number.isFinite(value.overlayPort) || value.overlayPort <= 0 || value.overlayPort > 65535)
  ) {
    issues.push('overlayPort must be a number from 1 to 65535');
  }
  if ('sounds' in value && (!value.sounds || typeof value.sounds !== 'object' || Array.isArray(value.sounds))) {
    issues.push('sounds must be an object');
  }
  if ('quietProjects' in value && (!Array.isArray(value.quietProjects) || value.quietProjects.some((item) => typeof item !== 'string'))) {
    issues.push('quietProjects must be a string array');
  }
  return issues;
}

function mergeConfig(value) {
  const cfg = cloneDefaultConfig();
  if (Number.isFinite(value.minDurationMs)) cfg.minDurationMs = Math.max(0, value.minDurationMs);
  if (typeof value.bell === 'boolean') cfg.bell = value.bell;
  if (typeof value.overlay === 'boolean') cfg.overlay = value.overlay;
  if (Number.isFinite(value.overlayPort) && value.overlayPort > 0 && value.overlayPort <= 65535) {
    cfg.overlayPort = value.overlayPort;
  }
  if (value.sounds && typeof value.sounds === 'object' && !Array.isArray(value.sounds)) {
    cfg.sounds = { ...cfg.sounds, ...value.sounds };
  }
  if (Array.isArray(value.quietProjects)) {
    cfg.quietProjects = value.quietProjects.filter((item) => typeof item === 'string');
  }
  return cfg;
}

function cloneDefaultConfig() {
  return {
    ...DEFAULT_CONFIG,
    sounds: { ...DEFAULT_CONFIG.sounds },
    quietProjects: [...DEFAULT_CONFIG.quietProjects],
  };
}
