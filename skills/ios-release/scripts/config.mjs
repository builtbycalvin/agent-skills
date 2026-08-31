#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { lstatSync, realpathSync } from 'node:fs';
import { chmod, lstat, mkdir, readFile, realpath, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createReleasePolicyBoundary } from './release-policy.mjs';

const DIRECTORY = '.ios-release';
const CONFIG = `${DIRECTORY}/config.json`;
const LOCAL = `${DIRECTORY}/local.json`;
const V1 = `${DIRECTORY}/context.json`;
const BACKUP = `${DIRECTORY}/context.v1.backup.json`;
const WHITELIST = `${DIRECTORY}/.gitignore`;
const EXCLUDE_RULE = '/.ios-release/';
const ROOT_FIELDS = new Set(['schemaVersion', 'defaultApp', 'apps']);
const APP_FIELDS = new Set(['displayName', 'aliases', 'sourceRoot', 'bundleId', 'appId', 'platform', 'xcode', 'testflight', 'metadataDirectory', 'releaseNotes', 'defaultIntent']);
const XCODE_FIELDS = new Set(['project', 'workspace', 'scheme', 'configuration']);
const TESTFLIGHT_FIELDS = new Set(['internalGroups', 'externalGroups']);
const GROUP_FIELDS = new Set(['id', 'name']);
const LOCAL_ROOT_FIELDS = new Set(['schemaVersion', 'apps']);
const LOCAL_APP_FIELDS = new Set(['ascProfile']);
const INTENTS = new Set(['internal-testflight', 'external-testflight', 'app-store-stage', 'app-store-submit']);
const SECRET_KEY = /(?:secret|password|token|credential|private[_-]?key|api[_-]?key|issuer|jwt|certificate)/i;
const TRANSIENT_KEYS = new Set(['currentVersion', 'lastVerifiedAt', 'readiness', 'ready', 'build', 'buildId', 'submission', 'submissionId', 'approval', 'authority', 'releaseCommit', 'sourceCommit', 'version', 'marketingVersion', 'timestamp', 'createdAt', 'updatedAt']);
const PRIVATE_KEY = /-----BEGIN (?:[A-Z0-9]+ )?PRIVATE KEY-----|-----BEGIN OPENSSH PRIVATE KEY-----/;
const CREDENTIAL_PATH = /(?:\.(?:p8|pem|key)(?:$|[\\/])|(?:^|[\\/])credentials?(?:[\\/]|$))/i;
const APP_KEY = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const GROUP_ID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const IGNORE_CONTENT = '*\n!.gitignore\n!config.json\n';

function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function nonEmpty(value) { return typeof value === 'string' && value.trim().length > 0; }
function json(value) { return JSON.stringify(value, null, 2) + '\n'; }
function repoRoot(candidate) { return path.resolve(runGit(path.resolve(candidate), ['rev-parse', '--show-toplevel'])); }
function runGit(repo, args) { return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
function gitPath(repo, value) { const resolved = runGit(repo, ['rev-parse', '--git-path', value]); return path.isAbsolute(resolved) ? resolved : path.resolve(repo, resolved); }
function inside(root, candidate) { const relative = path.relative(root, candidate); return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative); }
function validateRepositoryPath(repo, resolved, location, errors) {
  const canonicalRepo = realpathSync.native(repo);
  const relative = path.relative(repo, resolved);
  let current = repo;
  for (const part of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    try {
      const info = lstatSync(current);
      if (info.isSymbolicLink()) { errors.push(`${location}: symlinks are forbidden`); break; }
      if (!inside(canonicalRepo, realpathSync.native(current))) { errors.push(`${location}: path escapes the repository`); break; }
    } catch (error) {
      if (error.code === 'ENOENT') break;
      errors.push(`${location}: path is not inspectable: ${error.message}`);
      break;
    }
  }
}
function relativePath(repo, value, location, errors, options = {}) {
  if (!nonEmpty(value)) { errors.push(`${location}: expected a non-empty relative path`); return null; }
  if (path.isAbsolute(value) || path.win32.isAbsolute(value)) { errors.push(`${location}: absolute paths are forbidden`); return null; }
  const resolved = path.resolve(repo, value);
  const rel = path.relative(repo, resolved);
  if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) errors.push(`${location}: path escapes the repository`);
  else validateRepositoryPath(repo, resolved, location, errors);
  if (options.rejectLocal && (rel === DIRECTORY || rel.startsWith(`${DIRECTORY}${path.sep}`))) errors.push(`${location}: path cannot be inside ${DIRECTORY}`);
  return resolved;
}
function unknown(value, allowed, location, errors) { if (object(value)) for (const key of Object.keys(value)) if (!allowed.has(key)) errors.push(`${location}.${key}: unknown field`); }
function inspectSecrets(value, location, errors) {
  if (Array.isArray(value)) return value.forEach((item, index) => inspectSecrets(item, `${location}[${index}]`, errors));
  if (object(value)) return Object.entries(value).forEach(([key, item]) => { if (SECRET_KEY.test(key)) errors.push(`${location}.${key}: secret-shaped keys are forbidden`); if (TRANSIENT_KEYS.has(key)) errors.push(`${location}.${key}: transient release state is forbidden`); inspectSecrets(item, `${location}.${key}`, errors); });
  if (typeof value === 'string' && PRIVATE_KEY.test(value)) errors.push(`${location}: private-key material is forbidden`);
  if (typeof value === 'string' && CREDENTIAL_PATH.test(value)) errors.push(`${location}: credential or private-key paths are forbidden`);
}
function optionalString(value, location, errors) { if (value !== undefined && !nonEmpty(value)) errors.push(`${location}: expected a non-empty string`); }
function validateGroup(group, location, errors, ids) {
  if (!object(group)) { errors.push(`${location}: expected an object`); return; }
  unknown(group, GROUP_FIELDS, location, errors);
  if (!nonEmpty(group.id)) errors.push(`${location}.id: expected a non-empty string`); else if (!GROUP_ID.test(group.id)) errors.push(`${location}.id: invalid group ID`);
  if (!nonEmpty(group.name)) errors.push(`${location}.name: expected a non-empty string`);
  const normalizedId = nonEmpty(group.id) ? group.id.toLocaleLowerCase('en-US') : null;
  if (normalizedId && ids.has(normalizedId)) errors.push(`${location}.id: duplicate group ID`); else if (normalizedId) ids.add(normalizedId);
}
function validateApp(repo, policies, key, app, errors, missing) {
  const location = `apps.${key}`;
  if (!object(app)) { errors.push(`${location}: expected an object`); return null; }
  unknown(app, APP_FIELDS, location, errors);
  optionalString(app.displayName, `${location}.displayName`, errors);
  if (app.aliases !== undefined) { if (!Array.isArray(app.aliases)) errors.push(`${location}.aliases: expected an array`); else { const seen = new Set(); app.aliases.forEach((alias, index) => { optionalString(alias, `${location}.aliases[${index}]`, errors); if (seen.has(alias?.toLocaleLowerCase('en-US'))) errors.push(`${location}.aliases: duplicate alias`); seen.add(alias?.toLocaleLowerCase('en-US')); }); } }
  relativePath(repo, app.sourceRoot ?? '.', `${location}.sourceRoot`, errors);
  for (const field of ['bundleId', 'appId']) { if (!nonEmpty(app[field])) missing.push(`${location}.${field}`); else if (CREDENTIAL_PATH.test(app[field])) errors.push(`${location}.${field}: credential or private-key paths are forbidden`); }
  if (app.platform !== 'IOS') { if (app.platform !== undefined) errors.push(`${location}.platform: expected IOS`); missing.push(`${location}.platform`); }
  if (!object(app.xcode)) { missing.push(`${location}.xcode`); } else { unknown(app.xcode, XCODE_FIELDS, `${location}.xcode`, errors); const containers = ['project', 'workspace'].filter((field) => app.xcode[field] !== undefined); if (containers.length !== 1) errors.push(`${location}.xcode: expected exactly one of project or workspace`); containers.forEach((field) => relativePath(repo, app.xcode[field], `${location}.xcode.${field}`, errors)); for (const field of ['scheme', 'configuration']) { if (!nonEmpty(app.xcode[field])) missing.push(`${location}.xcode.${field}`); } }
  if (app.testflight !== undefined) { if (!object(app.testflight)) errors.push(`${location}.testflight: expected an object`); else { unknown(app.testflight, TESTFLIGHT_FIELDS, `${location}.testflight`, errors); const ids = new Set(); for (const field of TESTFLIGHT_FIELDS) { if (app.testflight[field] === undefined) continue; if (!Array.isArray(app.testflight[field])) errors.push(`${location}.testflight.${field}: expected an array`); else app.testflight[field].forEach((group, index) => validateGroup(group, `${location}.testflight.${field}[${index}]`, errors, ids)); } } }
  if (app.metadataDirectory !== undefined) relativePath(repo, app.metadataDirectory, `${location}.metadataDirectory`, errors, { rejectLocal: true });
  const releaseNotes = policies.validateConfigured(key, app.releaseNotes); errors.push(...releaseNotes.errors); missing.push(...releaseNotes.missing);
  if (app.defaultIntent !== undefined && !INTENTS.has(app.defaultIntent)) errors.push(`${location}.defaultIntent: invalid intent`);
  return releaseNotes.ok ? releaseNotes.value : null;
}
function selectorClaims(apps, errors) {
  const claims = new Map(); const add = (selector, key, kind, location) => { if (!nonEmpty(selector)) return; const normalized = selector.toLocaleLowerCase('en-US'); if (claims.has(normalized)) errors.push(`${location}: selector ${JSON.stringify(selector)} collides with ${claims.get(normalized).kind}`); else claims.set(normalized, { key, kind }); };
  for (const key of Object.keys(apps)) { add(key, key, `app key ${key}`, `apps.${key}`); const app = apps[key]; if (!object(app)) continue; add(app.displayName, key, `display name ${JSON.stringify(app.displayName)} for ${key}`, `apps.${key}.displayName`); if (Array.isArray(app.aliases)) app.aliases.forEach((alias) => add(alias, key, `alias ${JSON.stringify(alias)} for ${key}`, `apps.${key}.aliases`)); }
  return claims;
}
function tracked(repo, target) { const output = runGit(repo, ['ls-files', '--', target]); return output ? output.split('\n').filter(Boolean) : []; }
function ignored(repo, target) { try { runGit(repo, ['check-ignore', '--quiet', '--no-index', '--', target]); return true; } catch { return false; } }
function whitelistValid(repo, errors) { const file = path.join(repo, WHITELIST); return readFile(file, 'utf8').then((content) => { if (content !== IGNORE_CONTENT) errors.push(`${WHITELIST}: expected strict whitelist (*, !.gitignore, !config.json)`); }).catch((error) => { if (error.code === 'ENOENT') errors.push(`${WHITELIST}: missing strict whitelist`); else throw error; }); }
function missingLocalBindings(portableApps, localApps) { if (!object(portableApps) || !object(localApps)) return []; return Object.keys(portableApps).filter((key) => !object(localApps[key]) || !nonEmpty(localApps[key].ascProfile)).map((key) => `${LOCAL}.apps.${key}.ascProfile`); }

export function parsePortableConfig(value, repo) { const errors = []; const missing = []; if (!object(value)) return { value: null, errors: ['$: expected an object'], missing }; const policies = createReleasePolicyBoundary(repo); unknown(value, ROOT_FIELDS, '$', errors); if (value.schemaVersion !== 2) errors.push('$.schemaVersion: expected 2'); if (!object(value.apps)) errors.push('$.apps: expected an object'); else { const keys = Object.keys(value.apps); if (value.defaultApp !== undefined && (!nonEmpty(value.defaultApp) || !Object.hasOwn(value.apps, value.defaultApp))) errors.push('$.defaultApp: unknown app'); selectorClaims(value.apps, errors); const archives = new Map(); const appIds = new Map(); for (const key of keys) { if (!APP_KEY.test(key)) errors.push(`apps.${key}: invalid app key`); const appId = value.apps[key]?.appId; if (nonEmpty(appId)) { const previousApp = appIds.get(appId); if (previousApp) errors.push(`apps.${key}.appId: duplicates apps.${previousApp}.appId`); else appIds.set(appId, key); } const releaseNotes = validateApp(repo, policies, key, value.apps[key], errors, missing); if (releaseNotes) { const archiveIdentity = releaseNotes.archive.absolute.normalize('NFC').toLocaleLowerCase('en-US'); const previous = archives.get(archiveIdentity); if (previous) errors.push(`apps.${key}.releaseNotes.archiveDirectory: collides with apps.${previous}.releaseNotes.archiveDirectory`); else archives.set(archiveIdentity, key); } } if (keys.length > 1 && value.defaultApp === undefined) missing.push('defaultApp'); }
  if (object(value.apps) && Object.keys(value.apps).length === 0) missing.push('apps'); inspectSecrets(value, '$', errors); return { value, errors, missing };
}
export function parseLocalConfig(value) { const errors = []; if (!object(value)) return { value: null, errors: ['$: expected an object'] }; unknown(value, LOCAL_ROOT_FIELDS, '$', errors); if (value.schemaVersion !== 2) errors.push('$.schemaVersion: expected 2'); if (!object(value.apps)) errors.push('$.apps: expected an object'); else for (const [key, binding] of Object.entries(value.apps)) { if (!APP_KEY.test(key)) errors.push(`apps.${key}: invalid app key`); if (!object(binding)) errors.push(`apps.${key}: expected an object`); else { unknown(binding, LOCAL_APP_FIELDS, `apps.${key}`, errors); if (!nonEmpty(binding.ascProfile)) errors.push(`apps.${key}.ascProfile: expected a non-empty string`); } } inspectSecrets(value, '$', errors); return { value, errors }; }

async function assertSafeConfigurationDirectory(repo, options = {}) {
  const directory = path.join(repo, DIRECTORY);
  try {
    const info = await lstat(directory);
    if (info.isSymbolicLink()) throw new Error(`${DIRECTORY}: symlinks are forbidden`);
    if (!info.isDirectory()) throw new Error(`${DIRECTORY}: existing path is not a directory`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    if (!options.create) return null;
    await mkdir(directory, { recursive: false });
  }
  const canonicalRepo = await realpath(repo);
  const canonicalDirectory = await realpath(directory);
  const relative = path.relative(canonicalRepo, canonicalDirectory);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error(`${DIRECTORY}: path escapes the repository`);
  return directory;
}
async function assertSafeConfigurationFile(repo, relative) {
  const target = path.join(repo, relative);
  try {
    const info = await lstat(target);
    if (info.isSymbolicLink()) throw new Error(`${relative}: symlinks are forbidden`);
    if (!info.isFile()) throw new Error(`${relative}: existing path is not a regular file`);
    const directory = await realpath(path.join(repo, DIRECTORY));
    const canonical = await realpath(target);
    const relation = path.relative(directory, canonical);
    if (relation === '..' || relation.startsWith(`..${path.sep}`) || path.isAbsolute(relation)) throw new Error(`${relative}: path escapes ${DIRECTORY}`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

export async function init(repoCandidate) { const repo = repoRoot(repoCandidate); await assertSafeConfigurationDirectory(repo, { create: true }); const created = {}; for (const [relative, content, mode] of [[WHITELIST, IGNORE_CONTENT, 0o644], [CONFIG, json({ schemaVersion: 2, apps: {} }), 0o644], [LOCAL, json({ schemaVersion: 2, apps: {} }), 0o600]]) { const target = path.join(repo, relative); await assertSafeConfigurationFile(repo, relative); try { await writeFile(target, content, { encoding: 'utf8', flag: 'wx', mode }); created[relative] = true; } catch (error) { if (error.code !== 'EEXIST') throw error; created[relative] = false; await assertSafeConfigurationFile(repo, relative); } if (relative === LOCAL) await chmod(target, 0o600); }
  return { command: 'init', state: 'initialized', repo, created, portableVisible: tracked(repo, CONFIG).length > 0 || !ignored(repo, CONFIG), localIgnored: ignored(repo, LOCAL) };
}
export async function doctor(repoCandidate, selectedApp) { const repo = repoRoot(repoCandidate); const errors = []; const missing = []; await whitelistValid(repo, errors); const configPath = path.join(repo, CONFIG); const localPath = path.join(repo, LOCAL); let config; let local; let configRead = false; let localRead = false; try { config = JSON.parse(await readFile(configPath, 'utf8')); configRead = true; } catch (error) { errors.push(`${CONFIG}: ${error.code === 'ENOENT' ? 'file does not exist; run init' : `invalid JSON: ${error.message}`}`); } try { local = JSON.parse(await readFile(localPath, 'utf8')); localRead = true; } catch (error) { errors.push(`${LOCAL}: ${error.code === 'ENOENT' ? 'file does not exist; run init' : `invalid JSON: ${error.message}`}`); }
  if (configRead) { const parsed = parsePortableConfig(config, repo); errors.push(...parsed.errors); missing.push(...parsed.missing); if (ignored(repo, CONFIG)) errors.push(`${CONFIG}: portable config must be visible to Git`); if (tracked(repo, LOCAL).length) errors.push(`${LOCAL}: local config must not be tracked`); if (selectedApp && object(config?.apps)) { const claims = selectorClaims(config.apps, []); if (!claims.has(selectedApp.toLocaleLowerCase('en-US'))) errors.push(`--app: unknown app ${JSON.stringify(selectedApp)}`); } }
  if (localRead) { const parsed = parseLocalConfig(local); errors.push(...parsed.errors); if (object(local?.apps)) for (const key of Object.keys(local.apps)) if (!object(config?.apps) || !Object.hasOwn(config.apps, key)) errors.push(`${LOCAL}.apps.${key}: no matching portable app`); missing.push(...missingLocalBindings(config?.apps, local?.apps)); }
  const state = errors.length ? 'conflict' : missing.length ? 'incomplete' : 'ready'; return { command: 'doctor', state, repo, configPath, localPath, selectedApp: selectedApp ?? null, trackedFiles: tracked(repo, DIRECTORY), ignored: { config: ignored(repo, CONFIG), local: ignored(repo, LOCAL) }, errors, missing };
}
async function atomicWrite(target, content, mode) { const temporary = `${target}.tmp-${process.pid}-${Date.now()}`; await writeFile(temporary, content, { encoding: 'utf8', mode }); await chmod(temporary, mode); await rename(temporary, target); }
export async function migrate(repoCandidate, mode = 'plan') { const repo = repoRoot(repoCandidate); await assertSafeConfigurationDirectory(repo); await assertSafeConfigurationFile(repo, V1); await assertSafeConfigurationFile(repo, BACKUP); await assertSafeConfigurationFile(repo, CONFIG); const source = path.join(repo, V1); const backupPath = path.join(repo, BACKUP); let old; let sourcePresent = true; try { old = JSON.parse(await readFile(source, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') return { command: 'migrate', state: 'incomplete', repo, errors: [`${V1}: invalid JSON: ${error.message}`], candidates: [] }; sourcePresent = false; try { old = JSON.parse(await readFile(backupPath, 'utf8')); } catch (backupError) { const detail = backupError.code === 'ENOENT' ? 'file does not exist' : `invalid JSON: ${backupError.message}`; return { command: 'migrate', state: 'incomplete', repo, errors: [`${V1}: file does not exist`, `${BACKUP}: ${detail}`], candidates: [] }; } }
  const oldErrors = []; if (!object(old) || old.schemaVersion !== 1) oldErrors.push(`${V1}: expected schemaVersion 1`); if (oldErrors.length) return { command: 'migrate', state: 'conflict', repo, errors: oldErrors, candidates: [] }; inspectSecrets(old, '$', oldErrors); unknown(old, new Set(['schemaVersion', 'defaultApp', 'apps']), '$', oldErrors); if (!object(old.apps)) oldErrors.push('$.apps: expected an object'); else if (old.defaultApp !== undefined && (!nonEmpty(old.defaultApp) || !Object.hasOwn(old.apps, old.defaultApp))) oldErrors.push('$.defaultApp: unknown app'); if (oldErrors.length) return { command: 'migrate', state: 'conflict', repo, errors: oldErrors, candidates: [] };
  const apps = {}; const localApps = {}; for (const [key, app] of Object.entries(old.apps ?? {})) { if (!object(app)) { oldErrors.push(`apps.${key}: expected an object`); continue; } const { ascProfile, ...portable } = app; apps[key] = { ...portable, releaseNotes: portable.releaseNotes }; if (ascProfile !== undefined) localApps[key] = { ascProfile }; }
  let existingPortable = null; try { existingPortable = JSON.parse(await readFile(path.join(repo, CONFIG), 'utf8')); const checked = parsePortableConfig(existingPortable, repo); if (checked.errors.length) return { command: 'migrate', state: 'conflict', repo, errors: checked.errors.map((error) => `${CONFIG}: ${error}`), candidates: [] }; } catch (error) { if (error.code !== 'ENOENT') return { command: 'migrate', state: 'conflict', repo, errors: [`${CONFIG}: invalid JSON: ${error.message}`], candidates: [] }; }
  const appKeys = Object.keys(apps); const candidateMap = {}; const candidateErrors = []; const policies = createReleasePolicyBoundary(repo); for (const key of appKeys) { const existingPolicy = existingPortable?.apps?.[key]?.releaseNotes; const decision = policies.planMigration(key, appKeys.length, apps[key].releaseNotes ?? existingPolicy); if (decision.status === 'choice') { candidateMap[key] = decision.candidates; candidateErrors.push(...decision.errors); } else if (decision.status === 'conflict') candidateErrors.push(...decision.errors); else apps[key].releaseNotes = decision.policy; }
  if (oldErrors.length) return { command: 'migrate', state: 'conflict', repo, errors: oldErrors, candidates: candidateMap }; if (candidateErrors.length) return { command: 'migrate', state: 'incomplete', repo, errors: candidateErrors, candidates: candidateMap }; const portable = { schemaVersion: 2, ...(old.defaultApp ? { defaultApp: old.defaultApp } : {}), apps }; const local = { schemaVersion: 2, apps: localApps }; const portableCheck = parsePortableConfig(portable, repo); const localCheck = parseLocalConfig(local); if (portableCheck.errors.length || localCheck.errors.length) return { command: 'migrate', state: 'conflict', repo, errors: [...portableCheck.errors, ...localCheck.errors], candidates: candidateMap }; const bindingMissing = missingLocalBindings(portable.apps, local.apps); if (bindingMissing.length) return { command: 'migrate', state: 'incomplete', repo, errors: bindingMissing.map((item) => `${item}: missing local ASC profile binding`), candidates: candidateMap }; const plan = { command: 'migrate', state: mode === 'plan' ? 'planned' : 'migrated', repo, writes: [WHITELIST, CONFIG, LOCAL], backup: BACKUP, removeExcludeRule: true, portable, local };
  if (mode === 'plan') return { ...plan, sourcePresent }; const expected = new Map([[WHITELIST, IGNORE_CONTENT], [CONFIG, json(portable)], [LOCAL, json(local)], [BACKUP, json(old)]]); for (const [relative, content] of expected) { await assertSafeConfigurationFile(repo, relative); try { const existing = await readFile(path.join(repo, relative), 'utf8'); let matches = existing === content; if (!matches && relative.endsWith('.json')) { try { matches = isDeepStrictEqual(JSON.parse(existing), JSON.parse(content)); } catch { matches = false; } } if (!matches) return { command: 'migrate', state: 'conflict', repo, errors: [`${relative}: existing file conflicts with planned migration`], candidates: candidateMap }; } catch (error) { if (error.code !== 'ENOENT') throw error; } } for (const [relative, content, permissions] of [[WHITELIST, IGNORE_CONTENT, 0o644], [CONFIG, json(portable), 0o644], [LOCAL, json(local), 0o600]]) { const target = path.join(repo, relative); try { await stat(target); } catch { await atomicWrite(target, content, permissions); } } const excludePath = gitPath(repo, 'info/exclude'); try { const content = await readFile(excludePath, 'utf8'); const lines = content.split(/\r?\n/); const next = lines.filter((line) => line !== EXCLUDE_RULE).join('\n'); if (next !== content) await atomicWrite(excludePath, next, 0o644); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (sourcePresent) { try { await stat(backupPath); await unlink(source); } catch (error) { if (error.code === 'ENOENT') await rename(source, backupPath); else throw error; } } await chmod(path.join(repo, LOCAL), 0o600); return { ...plan, sourcePresent };
}
function parseArgs(argv) { const [command, ...rest] = argv; if (!['init', 'doctor', 'migrate', 'migrate-v1'].includes(command)) throw new Error('Usage: config.mjs <init|doctor|migrate> --repo PATH [--app KEY] [--plan|--apply]'); let repo = process.cwd(); let app; let mode = command === 'migrate-v1' ? 'apply' : undefined; for (let i = 0; i < rest.length; i += 1) { const flag = rest[i]; const value = rest[i + 1]; if (flag === '--repo' && value) { repo = value; i += 1; } else if (flag === '--app' && value && command === 'doctor') { app = value; i += 1; } else if (flag === '--plan' && command !== 'init') mode = 'plan'; else if (flag === '--apply' && command !== 'init') mode = 'apply'; else throw new Error(`Unknown or incomplete option: ${flag}`); } return { command: command === 'migrate-v1' ? 'migrate' : command, repo, app, mode: mode ?? 'apply' }; }
async function main() { try { const options = parseArgs(process.argv.slice(2)); const result = options.command === 'init' ? await init(options.repo) : options.command === 'doctor' ? await doctor(options.repo, options.app) : await migrate(options.repo, options.mode); process.stdout.write(`${JSON.stringify(result, null, 2)}\n`); if (['conflict', 'incomplete'].includes(result.state)) process.exitCode = 1; } catch (error) { process.stdout.write(`${JSON.stringify({ state: 'conflict', errors: [error.message], missing: [] }, null, 2)}\n`); process.exitCode = 1; } }
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
