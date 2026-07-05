#!/usr/bin/env node
import {
  CONFIG_KEYS,
  configPath,
  mergeConfig,
  parseConfigValue,
  readConfigStatus,
  setConfigValue,
  validateConfig,
  writeConfig,
} from './lib/config.mjs';

try {
  const [subcommand, key, ...rest] = process.argv.slice(3);

  switch (subcommand) {
    case 'get':
    case undefined:
      printConfig(key);
      break;
    case 'set':
      setConfig(key, rest.join(' '));
      break;
    case 'validate':
      validate();
      break;
    default:
      usage(1, `Unknown config command: ${subcommand}`);
  }
} catch (err) {
  process.stderr.write(`cc-ping config failed: ${err?.message ?? err}\n`);
  process.exitCode = 1;
}

function printConfig(key) {
  const status = readConfigStatus();
  const config = status.exists && status.raw ? status.raw : mergeConfig({});
  if (key) {
    if (!isKnownKey(key)) usage(1, `Unknown config key: ${key}`);
    process.stdout.write(`${JSON.stringify(readKey(config, key), null, 2)}\n`);
    return;
  }
  process.stdout.write(`${JSON.stringify(mergeConfig(config), null, 2)}\n`);
}

function setConfig(key, rawValue) {
  if (!key) usage(1, 'Missing config key');
  if (!rawValue && rawValue !== '') usage(1, 'Missing config value');
  if (!isKnownKey(key)) usage(1, `Unknown config key: ${key}`);

  const status = readConfigStatus();
  if (status.exists && (!status.ok || !status.raw)) {
    throw new Error(`Refusing to overwrite invalid config at ${status.path}: ${status.issues.join('; ')}`);
  }

  const current = status.exists && status.raw ? status.raw : {};
  const value = parseConfigValue(key, rawValue);
  const next = setConfigValue(current, key, value);
  const issues = validateConfig(next);
  if (issues.length > 0) throw new Error(issues.join('; '));
  writeConfig(next, configPath());
  process.stdout.write(`Updated ${configPath()}\n`);
}

function validate() {
  const status = readConfigStatus();
  if (status.ok) {
    process.stdout.write(`${status.exists ? 'valid' : 'valid (missing; defaults will be used)'}: ${status.path}\n`);
    return;
  }
  process.stdout.write(`invalid: ${status.path}\n`);
  for (const issue of status.issues) {
    process.stdout.write(`- ${issue}\n`);
  }
  process.exitCode = 1;
}

function readKey(config, key) {
  if (key.startsWith('sounds.')) {
    return config.sounds?.[key.slice('sounds.'.length)];
  }
  return config[key];
}

function isKnownKey(key) {
  return (
    CONFIG_KEYS.includes(key) ||
    ['sounds.done', 'sounds.waiting', 'sounds.error'].includes(key) ||
    ['summary.mode', 'summary.baseUrl', 'summary.model', 'summary.apiKeyEnv'].includes(key)
  );
}

function usage(code, message) {
  if (message) process.stderr.write(`${message}\n\n`);
  process.stderr.write(`Usage:
  cc-ping config get [key]
  cc-ping config set <key> <value>
  cc-ping config validate

Keys:
  minDurationMs, bell, overlay, overlayPort, quietProjects
  sounds, sounds.done, sounds.waiting, sounds.error
  summary, summary.mode, summary.baseUrl, summary.model, summary.apiKeyEnv

Examples:
  cc-ping config set minDurationMs 5000
  cc-ping config set quietProjects app-a,app-b
  cc-ping config set sounds.error buzz
  cc-ping config set summary.mode off
`);
  process.exit(code);
}
