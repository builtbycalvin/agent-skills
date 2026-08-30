#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { constants } from 'node:fs';
import { access, appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const CONTEXT_DIRECTORY = '.ios-release';
const CONTEXT_PATH = `${CONTEXT_DIRECTORY}/context.json`;
const EXCLUDE_RULE = '/.ios-release/';
const ROOT_FIELDS = new Set(['schemaVersion', 'defaultApp', 'apps']);
const APP_FIELDS = new Set([
  'displayName',
  'aliases',
  'sourceRoot',
  'bundleId',
  'appId',
  'platform',
  'ascProfile',
  'xcode',
  'testflight',
  'metadataDirectory',
  'defaultIntent',
]);
const XCODE_FIELDS = new Set(['project', 'workspace', 'scheme', 'configuration']);
const TESTFLIGHT_FIELDS = new Set(['internalGroups', 'externalGroups']);
const GROUP_FIELDS = new Set(['id', 'name']);
const INTENTS = new Set([
  'internal-testflight',
  'external-testflight',
  'app-store-stage',
  'app-store-submit',
]);
const SECRET_KEY = /(?:secret|password|token|credential|private[_-]?key|api[_-]?key|key[_-]?(?:file|path)|certificate)/i;
const PRIVATE_KEY_MATERIAL = /-----BEGIN (?:[A-Z0-9]+ )?PRIVATE KEY-----|-----BEGIN OPENSSH PRIVATE KEY-----/;
const CREDENTIAL_PATH = /\.(?:p8|pem|key)$/i;

function runGit(repo, args) {
  return execFileSync('git', ['-C', repo, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function resolveRepo(candidate) {
  return path.resolve(runGit(path.resolve(candidate), ['rev-parse', '--show-toplevel']));
}

function gitPath(repo, relativeGitPath) {
  const value = runGit(repo, ['rev-parse', '--git-path', relativeGitPath]);
  return path.isAbsolute(value) ? value : path.resolve(repo, value);
}

function isIgnored(repo) {
  try {
    runGit(repo, ['check-ignore', '--quiet', '--no-index', CONTEXT_PATH]);
    return true;
  } catch {
    return false;
  }
}

function trackedFiles(repo) {
  const output = runGit(repo, ['ls-files', '--', CONTEXT_DIRECTORY]);
  return output ? output.split('\n').filter(Boolean) : [];
}

function parseArguments(argv) {
  const [command, ...rest] = argv;
  if (!['init', 'doctor'].includes(command)) {
    throw new Error('Usage: context.mjs <init|doctor> [--repo PATH] [--app KEY]');
  }
  let repo = process.cwd();
  let app;
  for (let index = 0; index < rest.length; index += 1) {
    const flag = rest[index];
    const value = rest[index + 1];
    if (flag === '--repo' && value) {
      repo = value;
      index += 1;
    } else if (flag === '--app' && value && command === 'doctor') {
      app = value;
      index += 1;
    } else {
      throw new Error(`Unknown or incomplete option: ${flag}`);
    }
  }
  return { command, repo, app };
}

async function ensureExcludeRule(repo) {
  const excludePath = gitPath(repo, 'info/exclude');
  await mkdir(path.dirname(excludePath), { recursive: true });
  let current = '';
  try {
    current = await readFile(excludePath, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const present = current.split(/\r?\n/).includes(EXCLUDE_RULE);
  if (!present) {
    const prefix = current.length > 0 && !current.endsWith('\n') ? '\n' : '';
    await appendFile(excludePath, `${prefix}${EXCLUDE_RULE}\n`, 'utf8');
  }
  return { excludePath, added: !present };
}

async function init(repoCandidate) {
  const repo = resolveRepo(repoCandidate);
  const exclude = await ensureExcludeRule(repo);
  if (!isIgnored(repo)) {
    throw new Error(`${CONTEXT_PATH} is not ignored after updating ${exclude.excludePath}`);
  }
  const directory = path.join(repo, CONTEXT_DIRECTORY);
  const contextPath = path.join(repo, CONTEXT_PATH);
  await mkdir(directory, { recursive: true });
  let created = false;
  try {
    await writeFile(contextPath, '{\n  "schemaVersion": 1,\n  "apps": {}\n}\n', {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    });
    created = true;
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  return {
    command: 'init',
    state: 'initialized',
    repo,
    contextPath,
    excludePath: exclude.excludePath,
    excludeRuleAdded: exclude.added,
    contextCreated: created,
    ignored: true,
  };
}

function addUnknownFieldErrors(value, allowed, location, errors) {
  if (!isObject(value)) return;
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) errors.push(`${location}.${key}: unknown field`);
  }
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function inspectSecrets(value, location, errors) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => inspectSecrets(item, `${location}[${index}]`, errors));
    return;
  }
  if (isObject(value)) {
    for (const [key, item] of Object.entries(value)) {
      if (SECRET_KEY.test(key)) errors.push(`${location}.${key}: secret-shaped keys are forbidden`);
      inspectSecrets(item, `${location}.${key}`, errors);
    }
    return;
  }
  if (typeof value === 'string' && PRIVATE_KEY_MATERIAL.test(value)) {
    errors.push(`${location}: private-key material is forbidden`);
  } else if (typeof value === 'string' && CREDENTIAL_PATH.test(value)) {
    errors.push(`${location}: credential or private-key paths are forbidden`);
  }
}

function validateRelativePath(repo, value, location, errors) {
  if (!nonEmptyString(value)) {
    errors.push(`${location}: expected a non-empty relative path`);
    return;
  }
  if (path.isAbsolute(value) || path.win32.isAbsolute(value)) {
    errors.push(`${location}: absolute paths are forbidden`);
    return;
  }
  const resolved = path.resolve(repo, value);
  const relative = path.relative(repo, resolved);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    errors.push(`${location}: path escapes the repository`);
  }
}

function validateGroup(group, location, errors) {
  if (!isObject(group)) {
    errors.push(`${location}: expected an object`);
    return;
  }
  addUnknownFieldErrors(group, GROUP_FIELDS, location, errors);
  for (const field of ['id', 'name']) {
    if (!nonEmptyString(group[field])) errors.push(`${location}.${field}: expected a non-empty string`);
  }
}

function validateOptionalString(value, location, errors) {
  if (value !== undefined && !nonEmptyString(value)) errors.push(`${location}: expected a non-empty string`);
}

function validateApp(repo, key, app, errors, missing) {
  const location = `apps.${key}`;
  if (!isObject(app)) {
    errors.push(`${location}: expected an object`);
    return;
  }
  addUnknownFieldErrors(app, APP_FIELDS, location, errors);
  for (const field of ['displayName', 'bundleId', 'appId', 'ascProfile']) {
    validateOptionalString(app[field], `${location}.${field}`, errors);
  }
  if (app.aliases !== undefined) {
    if (!Array.isArray(app.aliases)) {
      errors.push(`${location}.aliases: expected an array`);
    } else {
      app.aliases.forEach((alias, index) => validateOptionalString(alias, `${location}.aliases[${index}]`, errors));
      if (new Set(app.aliases).size !== app.aliases.length) errors.push(`${location}.aliases: duplicate alias`);
    }
  }
  for (const field of ['sourceRoot', 'metadataDirectory']) {
    if (app[field] !== undefined) validateRelativePath(repo, app[field], `${location}.${field}`, errors);
  }
  if (app.platform !== undefined && app.platform !== 'IOS') {
    errors.push(`${location}.platform: expected IOS`);
  }
  if (app.defaultIntent !== undefined && !INTENTS.has(app.defaultIntent)) {
    errors.push(`${location}.defaultIntent: invalid intent`);
  }
  if (app.xcode !== undefined) {
    if (!isObject(app.xcode)) {
      errors.push(`${location}.xcode: expected an object`);
    } else {
      addUnknownFieldErrors(app.xcode, XCODE_FIELDS, `${location}.xcode`, errors);
      const containers = ['project', 'workspace'].filter((field) => app.xcode[field] !== undefined);
      if (containers.length !== 1) errors.push(`${location}.xcode: expected exactly one of project or workspace`);
      containers.forEach((field) => validateRelativePath(repo, app.xcode[field], `${location}.xcode.${field}`, errors));
      validateOptionalString(app.xcode.scheme, `${location}.xcode.scheme`, errors);
      validateOptionalString(app.xcode.configuration, `${location}.xcode.configuration`, errors);
    }
  }
  if (app.testflight !== undefined) {
    if (!isObject(app.testflight)) {
      errors.push(`${location}.testflight: expected an object`);
    } else {
      addUnknownFieldErrors(app.testflight, TESTFLIGHT_FIELDS, `${location}.testflight`, errors);
      for (const field of TESTFLIGHT_FIELDS) {
        if (app.testflight[field] === undefined) continue;
        if (!Array.isArray(app.testflight[field])) {
          errors.push(`${location}.testflight.${field}: expected an array`);
        } else {
          app.testflight[field].forEach((group, index) => validateGroup(group, `${location}.testflight.${field}[${index}]`, errors));
        }
      }
    }
  }
  for (const field of ['bundleId', 'appId', 'platform', 'ascProfile']) {
    if (!nonEmptyString(app[field])) missing.push(`${location}.${field}`);
  }
  if (!isObject(app.xcode) || !nonEmptyString(app.xcode.project ?? app.xcode.workspace)) {
    missing.push(`${location}.xcode.project|workspace`);
  }
  if (!isObject(app.xcode) || !nonEmptyString(app.xcode.scheme)) missing.push(`${location}.xcode.scheme`);
  if (!isObject(app.xcode) || !nonEmptyString(app.xcode.configuration)) missing.push(`${location}.xcode.configuration`);
}

function selectorClaims(apps, errors) {
  const claims = new Map();
  const selectors = [];
  for (const key of Object.keys(apps)) selectors.push({ selector: key, key, kind: `app key ${key}` });
  for (const [key, app] of Object.entries(apps)) {
    if (!isObject(app)) continue;
    if (nonEmptyString(app.displayName)) {
      selectors.push({
        selector: app.displayName,
        key,
        kind: `display name ${JSON.stringify(app.displayName)} for ${key}`,
        location: `apps.${key}.displayName`,
      });
    }
    if (Array.isArray(app.aliases)) {
      for (const alias of app.aliases) {
        if (!nonEmptyString(alias)) continue;
        selectors.push({
          selector: alias,
          key,
          kind: `alias ${JSON.stringify(alias)} for ${key}`,
          location: `apps.${key}.aliases`,
        });
      }
    }
  }
  for (const claim of selectors) {
    const normalized = claim.selector.toLocaleLowerCase('en-US');
    const existing = claims.get(normalized);
    if (existing) {
      errors.push(`${claim.location ?? `apps.${claim.key}`}: selector ${JSON.stringify(claim.selector)} collides with ${existing.kind}`);
    } else {
      claims.set(normalized, claim);
    }
  }
  return claims;
}

function validateContext(repo, context, selectedApp, ignored, tracked) {
  const errors = [];
  const missing = [];
  if (!ignored) errors.push(`${CONTEXT_PATH}: file is not ignored`);
  if (tracked.length > 0) errors.push(`${CONTEXT_DIRECTORY}: tracked files are forbidden: ${tracked.join(', ')}`);
  inspectSecrets(context, '$', errors);
  if (!isObject(context)) {
    errors.push('$: expected an object');
    return { state: 'conflict', errors, missing };
  }
  addUnknownFieldErrors(context, ROOT_FIELDS, '$', errors);
  if (context.schemaVersion !== 1) errors.push('$.schemaVersion: expected 1');
  if (!isObject(context.apps)) {
    errors.push('$.apps: expected an object');
    return { state: 'conflict', errors, missing };
  }
  validateOptionalString(context.defaultApp, '$.defaultApp', errors);
  const appKeys = Object.keys(context.apps);
  for (const key of appKeys) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(key)) errors.push(`apps.${key}: invalid app key`);
  }
  if (context.defaultApp !== undefined && !Object.hasOwn(context.apps, context.defaultApp)) {
    errors.push(`$.defaultApp: unknown app ${JSON.stringify(context.defaultApp)}`);
  }
  const claims = selectorClaims(context.apps, errors);
  let keysToValidate = appKeys;
  if (selectedApp !== undefined) {
    const selectedClaim = claims.get(selectedApp.toLocaleLowerCase('en-US'));
    if (!selectedClaim) {
      errors.push(`--app: unknown app ${JSON.stringify(selectedApp)}`);
      keysToValidate = [];
    } else {
      keysToValidate = [selectedClaim.key];
    }
  } else if (appKeys.length === 0) {
    missing.push('apps');
  } else if (appKeys.length > 1 && context.defaultApp === undefined) {
    errors.push('$.defaultApp: required when multiple apps are configured');
  }
  for (const key of appKeys) {
    const appMissing = [];
    validateApp(repo, key, context.apps[key], errors, appMissing);
    if (keysToValidate.includes(key)) missing.push(...appMissing);
  }
  return {
    state: errors.length > 0 ? 'conflict' : missing.length > 0 ? 'incomplete' : 'ready',
    errors,
    missing,
  };
}

async function doctor(repoCandidate, selectedApp) {
  const repo = resolveRepo(repoCandidate);
  const contextPath = path.join(repo, CONTEXT_PATH);
  let content;
  try {
    await access(contextPath, constants.R_OK);
    content = await readFile(contextPath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {
        command: 'doctor',
        state: 'conflict',
        repo,
        contextPath,
        selectedApp: selectedApp ?? null,
        errors: [`${CONTEXT_PATH}: file does not exist; run init`],
        missing: [],
      };
    }
    throw error;
  }
  let context;
  try {
    context = JSON.parse(content);
  } catch (error) {
    return {
      command: 'doctor',
      state: 'conflict',
      repo,
      contextPath,
      selectedApp: selectedApp ?? null,
      errors: [`${CONTEXT_PATH}: invalid JSON: ${error.message}`],
      missing: [],
    };
  }
  const ignored = isIgnored(repo);
  const tracked = trackedFiles(repo);
  return {
    command: 'doctor',
    repo,
    contextPath,
    selectedApp: selectedApp ?? null,
    ignored,
    trackedFiles: tracked,
    ...validateContext(repo, context, selectedApp, ignored, tracked),
  };
}

async function main() {
  try {
    const options = parseArguments(process.argv.slice(2));
    const result = options.command === 'init'
      ? await init(options.repo)
      : await doctor(options.repo, options.app);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.state === 'conflict') process.exitCode = 1;
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ state: 'conflict', errors: [error.message], missing: [] }, null, 2)}\n`);
    process.exitCode = 1;
  }
}

await main();
