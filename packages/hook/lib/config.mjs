import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const DEFAULT_CONFIG = {
  minDurationMs: 10000,
  bell: true,
  overlay: true,
  overlayPort: 47321,
  sounds: { done: 'ting', waiting: 'soft', error: 'buzz' },
  summary: { mode: 'heuristic', baseUrl: null, model: null, apiKeyEnv: null },
  quietProjects: [],
};

export const CONFIG_KEYS = ['minDurationMs', 'bell', 'overlay', 'overlayPort', 'sounds', 'summary', 'quietProjects'];

export function configPath() {
  return path.join(os.homedir(), '.cc-ping', 'config.json');
}

export function readConfigStatus(file = configPath()) {
  try {
    if (!existsSync(file)) {
      return {
        ok: true,
        exists: false,
        path: file,
        raw: {},
        config: cloneDefaultConfig(),
        issues: [],
      };
    }

    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    if (!isPlainObject(parsed)) {
      return invalid(file, parsed, ['config root must be an object']);
    }

    const issues = validateConfig(parsed);
    return {
      ok: issues.length === 0,
      exists: true,
      path: file,
      raw: parsed,
      config: mergeConfig(parsed),
      issues,
    };
  } catch (err) {
    return {
      ok: false,
      exists: true,
      path: file,
      raw: null,
      config: cloneDefaultConfig(),
      issues: [err?.message ?? 'failed to read config'],
    };
  }
}

export function validateConfig(value) {
  const issues = [];
  if (!isPlainObject(value)) return ['config root must be an object'];

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
  if ('sounds' in value) {
    if (!isPlainObject(value.sounds)) {
      issues.push('sounds must be an object');
    } else {
      for (const key of ['done', 'waiting', 'error']) {
        if (key in value.sounds && !isSoundValue(value.sounds[key])) {
          issues.push(`sounds.${key} must be a string, null, or false`);
        }
      }
    }
  }
  if ('summary' in value) {
    if (!isPlainObject(value.summary)) {
      issues.push('summary must be an object');
    } else {
      if ('mode' in value.summary && !['off', 'heuristic', 'llm'].includes(value.summary.mode)) {
        issues.push('summary.mode must be off, heuristic, or llm');
      }
      for (const key of ['baseUrl', 'model', 'apiKeyEnv']) {
        if (key in value.summary && value.summary[key] != null && typeof value.summary[key] !== 'string') {
          issues.push(`summary.${key} must be a string or null`);
        }
      }
    }
  }
  if (
    'quietProjects' in value &&
    (!Array.isArray(value.quietProjects) || value.quietProjects.some((item) => typeof item !== 'string'))
  ) {
    issues.push('quietProjects must be a string array');
  }
  return issues;
}

export function mergeConfig(value) {
  const cfg = cloneDefaultConfig();
  if (!isPlainObject(value)) return cfg;

  if (Number.isFinite(value.minDurationMs)) cfg.minDurationMs = Math.max(0, value.minDurationMs);
  if (typeof value.bell === 'boolean') cfg.bell = value.bell;
  if (typeof value.overlay === 'boolean') cfg.overlay = value.overlay;
  if (Number.isFinite(value.overlayPort) && value.overlayPort > 0 && value.overlayPort <= 65535) {
    cfg.overlayPort = value.overlayPort;
  }
  if (isPlainObject(value.sounds)) {
    cfg.sounds = { ...cfg.sounds, ...value.sounds };
  }
  if (isPlainObject(value.summary)) {
    cfg.summary = { ...cfg.summary, ...value.summary };
  }
  if (Array.isArray(value.quietProjects)) {
    cfg.quietProjects = value.quietProjects.filter((item) => typeof item === 'string');
  }
  return cfg;
}

export function writeConfig(value, file = configPath()) {
  const issues = validateConfig(value);
  if (issues.length > 0) {
    throw new Error(issues.join('; '));
  }
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export function parseConfigValue(key, rawValue) {
  if (key === 'minDurationMs' || key === 'overlayPort') {
    const number = Number(rawValue);
    if (!Number.isFinite(number)) throw new Error(`${key} must be a number`);
    return number;
  }
  if (key === 'bell' || key === 'overlay') {
    if (rawValue === 'true') return true;
    if (rawValue === 'false') return false;
    throw new Error(`${key} must be true or false`);
  }
  if (key === 'quietProjects') {
    if (!rawValue) return [];
    return rawValue.split(',').map((item) => item.trim()).filter(Boolean);
  }
  if (key === 'sounds') {
    const parsed = JSON.parse(rawValue);
    if (!isPlainObject(parsed)) throw new Error('sounds must be a JSON object');
    return parsed;
  }
  if (key === 'summary') {
    const parsed = JSON.parse(rawValue);
    if (!isPlainObject(parsed)) throw new Error('summary must be a JSON object');
    return parsed;
  }
  if (key.startsWith('sounds.')) {
    const soundKey = key.slice('sounds.'.length);
    if (!['done', 'waiting', 'error'].includes(soundKey)) {
      throw new Error('sounds key must be done, waiting, or error');
    }
    if (rawValue === 'null') return null;
    if (rawValue === 'false') return false;
    return rawValue;
  }
  if (key.startsWith('summary.')) {
    const summaryKey = key.slice('summary.'.length);
    if (!['mode', 'baseUrl', 'model', 'apiKeyEnv'].includes(summaryKey)) {
      throw new Error('summary key must be mode, baseUrl, model, or apiKeyEnv');
    }
    if (summaryKey === 'mode' && !['off', 'heuristic', 'llm'].includes(rawValue)) {
      throw new Error('summary.mode must be off, heuristic, or llm');
    }
    if (rawValue === 'null') return null;
    return rawValue;
  }
  throw new Error(`unknown config key: ${key}`);
}

export function setConfigValue(config, key, value) {
  const next = isPlainObject(config) ? { ...config } : {};
  if (key.startsWith('sounds.')) {
    const soundKey = key.slice('sounds.'.length);
    next.sounds = isPlainObject(next.sounds) ? { ...next.sounds, [soundKey]: value } : { [soundKey]: value };
  } else if (key.startsWith('summary.')) {
    const summaryKey = key.slice('summary.'.length);
    next.summary = isPlainObject(next.summary) ? { ...next.summary, [summaryKey]: value } : { [summaryKey]: value };
  } else {
    next[key] = value;
  }
  return next;
}

function invalid(file, raw, issues) {
  return {
    ok: false,
    exists: true,
    path: file,
    raw,
    config: cloneDefaultConfig(),
    issues,
  };
}

function cloneDefaultConfig() {
  return {
    ...DEFAULT_CONFIG,
    sounds: { ...DEFAULT_CONFIG.sounds },
    summary: { ...DEFAULT_CONFIG.summary },
    quietProjects: [...DEFAULT_CONFIG.quietProjects],
  };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isSoundValue(value) {
  return typeof value === 'string' || value == null || value === false;
}
