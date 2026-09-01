#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { chmod, lstat, mkdir, readFile, realpath, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';
import { APP_KEY, inspectSecrets, parsePortableConfig, selectorClaims, unknown } from './portable-config.mjs';
import { createReleasePolicyBoundary } from './release-policy.mjs';
import { parseUniqueJson } from './strict-json.mjs';
export { parsePortableConfig } from './portable-config.mjs';

const DIRECTORY = '.ios-release';
const CONFIG = `${DIRECTORY}/config.json`;
const LOCAL = `${DIRECTORY}/local.json`;
const V1 = `${DIRECTORY}/context.json`;
const BACKUP = `${DIRECTORY}/context.v1.backup.json`;
const WHITELIST = `${DIRECTORY}/.gitignore`;
const EXCLUDE_RULE = '/.ios-release/';
const LOCAL_ROOT_FIELDS = new Set(['schemaVersion', 'apps']);
const LOCAL_APP_FIELDS = new Set(['ascProfile']);
const IGNORE_CONTENT = '*\n!.gitignore\n!config.json\n';
const ALLOWED_TRACKED_CONFIGURATION = new Set([WHITELIST, CONFIG]);

function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function nonEmpty(value) { return typeof value === 'string' && value.trim().length > 0; }
function json(value) { return JSON.stringify(value, null, 2) + '\n'; }
function repoRoot(candidate) { return path.resolve(runGit(path.resolve(candidate), ['rev-parse', '--show-toplevel'])); }
function runGit(repo, args) { return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
function gitPath(repo, value) { const resolved = runGit(repo, ['rev-parse', '--git-path', value]); return path.isAbsolute(resolved) ? resolved : path.resolve(repo, resolved); }
function inside(root, candidate) { const relative = path.relative(root, candidate); return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative); }
function indexEntries(repo, relative) { return execFileSync('git', ['-C', repo, 'ls-files', '--stage', '-z', '--', relative], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).split('\0').filter(Boolean).map((record) => { const match = /^(\d{6}) ([0-9a-f]+) ([0-3])\t([\s\S]+)$/.exec(record); if (!match) throw new Error('Git index returned an invalid entry'); return { mode: match[1], path: match[4] }; }); }
function gitlink(repo, relative) { return indexEntries(repo, relative).some((entry) => entry.mode === '160000' && entry.path === relative); }
function configurationNamespaceGitlink(repo) { return gitlink(repo, DIRECTORY); }
function tracked(repo, target) { return execFileSync('git', ['-C', repo, 'ls-files', '-z', '--', target], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).split('\0').filter(Boolean); }
function configurationTrackingBlockers(repo) { return tracked(repo, DIRECTORY).filter((relative) => !ALLOWED_TRACKED_CONFIGURATION.has(relative)).map((relative) => `${JSON.stringify(relative)}: tracked files under ${DIRECTORY} are limited to ${WHITELIST} and ${CONFIG}`); }
function ignored(repo, target) { try { runGit(repo, ['check-ignore', '--quiet', '--no-index', '--', target]); return true; } catch { return false; } }
function ignoreMatch(repo, target) { try { const fields = execFileSync('git', ['-C', repo, 'check-ignore', '-z', '-v', '--no-index', '--stdin'], { input: `${target}\0`, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).split('\0'); return { source: fields[0], line: fields[1], pattern: fields[2], path: fields[3] }; } catch (error) { if (error.status === 1) return null; throw error; } }
function portableVisibilityBlocker(repo) { const match = ignoreMatch(repo, CONFIG); if (!match || match.pattern.startsWith('!')) return null; const source = path.isAbsolute(match.source) ? match.source : path.resolve(repo, match.source); const excludePath = gitPath(repo, 'info/exclude'); if (realpathSync.native(source) === realpathSync.native(excludePath) && match.pattern === EXCLUDE_RULE) return null; return `${CONFIG}: portable config would remain ignored by ${match.source}:${match.line}`; }
function whitelistValid(repo, errors) { const file = path.join(repo, WHITELIST); return readFile(file, 'utf8').then((content) => { if (content !== IGNORE_CONTENT) errors.push(`${WHITELIST}: expected strict whitelist (*, !.gitignore, !config.json)`); }).catch((error) => { if (error.code === 'ENOENT') errors.push(`${WHITELIST}: missing strict whitelist`); else throw error; }); }
function missingLocalBindings(portableApps, localApps) { if (!object(portableApps) || !object(localApps)) return []; return Object.keys(portableApps).filter((key) => !object(localApps[key]) || !nonEmpty(localApps[key].ascProfile)).map((key) => `${LOCAL}.apps.${key}.ascProfile`); }
function missingBelongsToApp(item, selectedKey, appKeys) { const origin = appKeys.filter((key) => item.startsWith(`apps.${key}.`)).sort((left, right) => right.length - left.length)[0]; return origin === selectedKey; }

export function parseLocalConfig(value) { const errors = []; if (!object(value)) return { value: null, errors: ['$: expected an object'] }; unknown(value, LOCAL_ROOT_FIELDS, '$', errors); if (value.schemaVersion !== 2) errors.push('$.schemaVersion: expected 2'); if (!object(value.apps)) errors.push('$.apps: expected an object'); else for (const [key, binding] of Object.entries(value.apps)) { if (!APP_KEY.test(key)) errors.push(`apps.${key}: invalid app key`); if (!object(binding)) errors.push(`apps.${key}: expected an object`); else { unknown(binding, LOCAL_APP_FIELDS, `apps.${key}`, errors); if (!nonEmpty(binding.ascProfile)) errors.push(`apps.${key}.ascProfile: expected a non-empty string`); } } inspectSecrets(value, '$', errors); return { value, errors }; }

async function assertSafeConfigurationDirectory(repo, options = {}) {
  const directory = path.join(repo, DIRECTORY);
  if (configurationNamespaceGitlink(repo)) throw new Error(`${DIRECTORY}: Git links are forbidden`);
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
  if (realpathSync.native(repoRoot(canonicalDirectory)) !== realpathSync.native(canonicalRepo)) throw new Error(`${DIRECTORY}: path is inside another Git repository`);
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

export async function init(repoCandidate) {
  const repo = repoRoot(repoCandidate);
  let directoryExists = true;
  try { await lstat(path.join(repo, DIRECTORY)); } catch (error) { if (error.code !== 'ENOENT') throw error; directoryExists = false; }
  if (!directoryExists) {
    const directoryIgnore = ignoreMatch(repo, `${DIRECTORY}/`);
    if (directoryIgnore && !directoryIgnore.pattern.startsWith('!')) return { command: 'init', state: 'conflict', repo, created: {}, portableVisible: false, localIgnored: true, errors: [`${CONFIG}: portable config would remain ignored`], missing: [] };
  }
  await assertSafeConfigurationDirectory(repo, { create: true });
  await assertSafeConfigurationFile(repo, WHITELIST);
  let whitelistExists = true;
  try { await lstat(path.join(repo, WHITELIST)); } catch (error) { if (error.code !== 'ENOENT') throw error; whitelistExists = false; }
  if (whitelistExists) {
    const errors = [];
    await whitelistValid(repo, errors);
    if (errors.length) return { command: 'init', state: 'conflict', repo, created: {}, portableVisible: tracked(repo, CONFIG).length > 0 || !ignored(repo, CONFIG), localIgnored: ignored(repo, LOCAL), errors, missing: [] };
  }
  const visibilityBlocker = portableVisibilityBlocker(repo);
  if (visibilityBlocker) return { command: 'init', state: 'conflict', repo, created: {}, portableVisible: false, localIgnored: ignored(repo, LOCAL), errors: [visibilityBlocker], missing: [] };
  const created = {};
  for (const [relative, content, mode] of [[WHITELIST, IGNORE_CONTENT, 0o644], [CONFIG, json({ schemaVersion: 2, apps: {} }), 0o644], [LOCAL, json({ schemaVersion: 2, apps: {} }), 0o600]]) {
    const target = path.join(repo, relative);
    await assertSafeConfigurationFile(repo, relative);
    try { await writeFile(target, content, { encoding: 'utf8', flag: 'wx', mode }); created[relative] = true; } catch (error) { if (error.code !== 'EEXIST') throw error; created[relative] = false; await assertSafeConfigurationFile(repo, relative); }
    if (relative === LOCAL) await chmod(target, 0o600);
  }
  const errors = [];
  await whitelistValid(repo, errors);
  const portableVisible = tracked(repo, CONFIG).length > 0 || !ignored(repo, CONFIG);
  const localIgnored = ignored(repo, LOCAL);
  if (!portableVisible) errors.push(`${CONFIG}: portable config remains ignored after init`);
  if (!localIgnored) errors.push(`${LOCAL}: local config must be ignored after init`);
  if (errors.length) return { command: 'init', state: 'conflict', repo, created, portableVisible, localIgnored, errors, missing: [] };
  return { command: 'init', state: 'initialized', repo, created, portableVisible, localIgnored };
}
export async function doctor(repoCandidate, selectedApp) { const repo = repoRoot(repoCandidate); const errors = []; const missing = []; await assertSafeConfigurationDirectory(repo); for (const relative of [WHITELIST, CONFIG, LOCAL]) await assertSafeConfigurationFile(repo, relative); await whitelistValid(repo, errors); const trackedFiles = tracked(repo, DIRECTORY); errors.push(...trackedFiles.filter((relative) => !ALLOWED_TRACKED_CONFIGURATION.has(relative)).map((relative) => `${JSON.stringify(relative)}: tracked files under ${DIRECTORY} are limited to ${WHITELIST} and ${CONFIG}`)); const configPath = path.join(repo, CONFIG); const localPath = path.join(repo, LOCAL); let config; let local; let configRead = false; let localRead = false; try { config = parseUniqueJson(await readFile(configPath, 'utf8')); configRead = true; } catch (error) { errors.push(`${CONFIG}: ${error.code === 'ENOENT' ? 'file does not exist; run init' : `invalid JSON: ${error.message}`}`); } try { local = parseUniqueJson(await readFile(localPath, 'utf8')); localRead = true; } catch (error) { errors.push(`${LOCAL}: ${error.code === 'ENOENT' ? 'file does not exist; run init' : `invalid JSON: ${error.message}`}`); }
  if (configRead) { let selectedKey; if (selectedApp && object(config?.apps)) { const claims = selectorClaims(config.apps, []); selectedKey = claims.get(selectedApp.toLocaleLowerCase('en-US'))?.key; if (!selectedKey) errors.push(`--app: unknown app ${JSON.stringify(selectedApp)}`); } const parsed = parsePortableConfig(config, repo); errors.push(...parsed.errors); const appKeys = object(config?.apps) ? Object.keys(config.apps) : []; missing.push(...(selectedApp ? parsed.missing.filter((item) => selectedKey && missingBelongsToApp(item, selectedKey, appKeys)) : parsed.missing)); if (ignored(repo, CONFIG)) errors.push(`${CONFIG}: portable config must be visible to Git`); }
  if (localRead) { const parsed = parseLocalConfig(local); errors.push(...parsed.errors); if (object(local?.apps)) for (const key of Object.keys(local.apps)) if (!object(config?.apps) || !Object.hasOwn(config.apps, key)) errors.push(`${LOCAL}.apps.${key}: no matching portable app`); const bindings = missingLocalBindings(config?.apps, local?.apps); const selectedKey = selectedApp && object(config?.apps) ? selectorClaims(config.apps, []).get(selectedApp.toLocaleLowerCase('en-US'))?.key : undefined; missing.push(...(selectedApp ? bindings.filter((item) => selectedKey && item === `${LOCAL}.apps.${selectedKey}.ascProfile`) : bindings)); }
  const state = errors.length ? 'conflict' : missing.length ? 'incomplete' : 'ready'; return { command: 'doctor', state, repo, configPath, localPath, selectedApp: selectedApp ?? null, trackedFiles, ignored: { config: ignored(repo, CONFIG), local: ignored(repo, LOCAL) }, errors, missing };
}
async function atomicWrite(target, content, mode) { const temporary = `${target}.tmp-${process.pid}-${Date.now()}`; await writeFile(temporary, content, { encoding: 'utf8', mode }); await chmod(temporary, mode); await rename(temporary, target); }
export async function migrate(repoCandidate, mode = 'plan') { const repo = repoRoot(repoCandidate); await assertSafeConfigurationDirectory(repo); await assertSafeConfigurationFile(repo, V1); await assertSafeConfigurationFile(repo, BACKUP); await assertSafeConfigurationFile(repo, CONFIG); const source = path.join(repo, V1); const backupPath = path.join(repo, BACKUP); let old; let sourcePresent = true; try { old = parseUniqueJson(await readFile(source, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') return { command: 'migrate', state: 'conflict', repo, errors: [`${V1}: invalid JSON: ${error.message}`], candidates: [] }; sourcePresent = false; try { old = parseUniqueJson(await readFile(backupPath, 'utf8')); } catch (backupError) { const detail = backupError.code === 'ENOENT' ? 'file does not exist' : `invalid JSON: ${backupError.message}`; return { command: 'migrate', state: backupError.code === 'ENOENT' ? 'incomplete' : 'conflict', repo, errors: [`${V1}: file does not exist`, `${BACKUP}: ${detail}`], candidates: [] }; } }
  const oldErrors = []; if (!object(old) || old.schemaVersion !== 1) oldErrors.push(`${V1}: expected schemaVersion 1`); if (oldErrors.length) return { command: 'migrate', state: 'conflict', repo, errors: oldErrors, candidates: [] }; inspectSecrets(old, '$', oldErrors); unknown(old, new Set(['schemaVersion', 'defaultApp', 'apps']), '$', oldErrors); if (!object(old.apps)) oldErrors.push('$.apps: expected an object'); else if (old.defaultApp !== undefined && (!nonEmpty(old.defaultApp) || !Object.hasOwn(old.apps, old.defaultApp))) oldErrors.push('$.defaultApp: unknown app'); if (oldErrors.length) return { command: 'migrate', state: 'conflict', repo, errors: oldErrors, candidates: [] };
  const apps = {}; const localApps = {}; for (const [key, app] of Object.entries(old.apps ?? {})) { if (!object(app)) { oldErrors.push(`apps.${key}: expected an object`); continue; } const { ascProfile, ...portable } = app; apps[key] = portable; if (ascProfile !== undefined) localApps[key] = { ascProfile }; }
  let existingPortable = null; try { existingPortable = parseUniqueJson(await readFile(path.join(repo, CONFIG), 'utf8')); const checked = parsePortableConfig(existingPortable, repo); if (checked.errors.length) return { command: 'migrate', state: 'conflict', repo, errors: checked.errors.map((error) => `${CONFIG}: ${error}`), candidates: [] }; } catch (error) { if (error.code !== 'ENOENT') return { command: 'migrate', state: 'conflict', repo, errors: [`${CONFIG}: invalid JSON: ${error.message}`], candidates: [] }; }
  const appKeys = Object.keys(apps); const candidateMap = {}; const choiceErrors = []; const conflictErrors = []; const policies = createReleasePolicyBoundary(repo); for (const key of appKeys) { const existingPolicy = existingPortable?.apps?.[key]?.releaseNotes; const rawPolicy = Object.hasOwn(apps[key], 'releaseNotes') ? apps[key].releaseNotes : existingPolicy; const decision = policies.planMigration(key, appKeys.length, rawPolicy); if (decision.status === 'choice') { candidateMap[key] = decision.candidates; choiceErrors.push(...decision.errors); } else if (decision.status === 'conflict') conflictErrors.push(...decision.errors); else apps[key].releaseNotes = decision.policy; }
  if (oldErrors.length || conflictErrors.length) return { command: 'migrate', state: 'conflict', repo, errors: [...oldErrors, ...conflictErrors], candidates: candidateMap }; if (choiceErrors.length) return { command: 'migrate', state: 'incomplete', repo, errors: choiceErrors, candidates: candidateMap }; const portable = { schemaVersion: 2, ...(old.defaultApp ? { defaultApp: old.defaultApp } : {}), apps }; const local = { schemaVersion: 2, apps: localApps }; const portableCheck = parsePortableConfig(portable, repo); const localCheck = parseLocalConfig(local); if (portableCheck.errors.length || localCheck.errors.length) return { command: 'migrate', state: 'conflict', repo, errors: [...portableCheck.errors, ...localCheck.errors], candidates: candidateMap }; if (portableCheck.missing.length) return { command: 'migrate', state: 'incomplete', repo, errors: portableCheck.missing.map((item) => `${item}: missing portable configuration`), candidates: candidateMap }; const bindingMissing = missingLocalBindings(portable.apps, local.apps); if (bindingMissing.length) return { command: 'migrate', state: 'incomplete', repo, errors: bindingMissing.map((item) => `${item}: missing local ASC profile binding`), candidates: candidateMap }; const plan = { command: 'migrate', state: mode === 'plan' ? 'planned' : 'migrated', repo, writes: [WHITELIST, CONFIG, LOCAL], backup: BACKUP, removeExcludeRule: true, portable, local };
  if (mode === 'plan') { const plannedFiles = new Map([[WHITELIST, IGNORE_CONTENT], [CONFIG, json(portable)], [LOCAL, json(local)], [BACKUP, json(old)]]); for (const [relative, content] of plannedFiles) { await assertSafeConfigurationFile(repo, relative); try { const existing = await readFile(path.join(repo, relative), 'utf8'); let matches = existing === content; if (!matches && relative.endsWith('.json')) { try { matches = isDeepStrictEqual(parseUniqueJson(existing), parseUniqueJson(content)); } catch { matches = false; } } if (!matches) return { command: 'migrate', state: 'conflict', repo, errors: [`${relative}: existing file conflicts with planned migration`], candidates: candidateMap }; } catch (error) { if (error.code !== 'ENOENT') throw error; } } }
  if (mode === 'plan') return { ...plan, sourcePresent }; const preflightErrors = [portableVisibilityBlocker(repo), ...configurationTrackingBlockers(repo)].filter(Boolean); if (preflightErrors.length) return { command: 'migrate', state: 'conflict', repo, errors: preflightErrors, candidates: candidateMap }; const expected = new Map([[WHITELIST, IGNORE_CONTENT], [CONFIG, json(portable)], [LOCAL, json(local)], [BACKUP, json(old)]]); for (const [relative, content] of expected) { await assertSafeConfigurationFile(repo, relative); try { const existing = await readFile(path.join(repo, relative), 'utf8'); let matches = existing === content; if (!matches && relative.endsWith('.json')) { try { matches = isDeepStrictEqual(parseUniqueJson(existing), parseUniqueJson(content)); } catch { matches = false; } } if (!matches) return { command: 'migrate', state: 'conflict', repo, errors: [`${relative}: existing file conflicts with planned migration`], candidates: candidateMap }; } catch (error) { if (error.code !== 'ENOENT') throw error; } } for (const [relative, content, permissions] of [[WHITELIST, IGNORE_CONTENT, 0o644], [CONFIG, json(portable), 0o644], [LOCAL, json(local), 0o600]]) { const target = path.join(repo, relative); try { await stat(target); } catch { await atomicWrite(target, content, permissions); } } const excludePath = gitPath(repo, 'info/exclude'); try { const content = await readFile(excludePath, 'utf8'); const next = content.replace(/^\/\.ios-release\/(?:\r?\n|$)/gm, ''); if (next !== content) { const permissions = (await stat(excludePath)).mode & 0o7777; await atomicWrite(excludePath, next, permissions); } } catch (error) { if (error.code !== 'ENOENT') throw error; } const postflightErrors = []; if (ignored(repo, CONFIG)) postflightErrors.push(`${CONFIG}: portable config remains ignored after migration writes`); postflightErrors.push(...configurationTrackingBlockers(repo)); if (postflightErrors.length) return { command: 'migrate', state: 'conflict', repo, errors: postflightErrors, candidates: candidateMap, sourcePresent };
  if (sourcePresent) { try { await stat(backupPath); await unlink(source); } catch (error) { if (error.code === 'ENOENT') await rename(source, backupPath); else throw error; } } await chmod(path.join(repo, LOCAL), 0o600); return { ...plan, sourcePresent };
}
function parseArgs(argv) { const [command, ...rest] = argv; if (!['init', 'doctor', 'migrate', 'migrate-v1'].includes(command)) throw new Error('Usage: config.mjs <init|doctor|migrate> --repo PATH [--app KEY] [--plan|--apply]'); let repo = process.cwd(); let app; let mode = command === 'migrate-v1' ? 'apply' : command === 'migrate' ? 'plan' : undefined; let explicitMode; for (let i = 0; i < rest.length; i += 1) { const flag = rest[i]; const value = rest[i + 1]; if (flag === '--repo' && value) { repo = value; i += 1; } else if (flag === '--app' && value && command === 'doctor') { app = value; i += 1; } else if ((flag === '--plan' || flag === '--apply') && command !== 'init') { const next = flag === '--plan' ? 'plan' : 'apply'; if (explicitMode && explicitMode !== next) throw new Error('--plan and --apply are mutually exclusive'); explicitMode = next; mode = next; } else throw new Error(`Unknown or incomplete option: ${flag}`); } return { command: command === 'migrate-v1' ? 'migrate' : command, repo, app, mode }; }
async function main() { try { const options = parseArgs(process.argv.slice(2)); const result = options.command === 'init' ? await init(options.repo) : options.command === 'doctor' ? await doctor(options.repo, options.app) : await migrate(options.repo, options.mode); process.stdout.write(`${JSON.stringify(result, null, 2)}\n`); if (['conflict', 'incomplete'].includes(result.state)) process.exitCode = 1; } catch (error) { process.stdout.write(`${JSON.stringify({ state: 'conflict', errors: [error.message], missing: [] }, null, 2)}\n`); process.exitCode = 1; } }
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
