import { execFileSync } from 'node:child_process';
import { lstatSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { createReleasePolicyBoundary } from './release-policy.mjs';

const DIRECTORY = '.ios-release';
const ROOT_FIELDS = new Set(['schemaVersion', 'defaultApp', 'apps']);
const APP_FIELDS = new Set(['displayName', 'aliases', 'sourceRoot', 'bundleId', 'appId', 'platform', 'xcode', 'testflight', 'metadataDirectory', 'releaseNotes', 'defaultIntent']);
const XCODE_FIELDS = new Set(['project', 'workspace', 'scheme', 'configuration']);
const TESTFLIGHT_FIELDS = new Set(['internalGroups', 'externalGroups']);
const GROUP_FIELDS = new Set(['id', 'name']);
const INTENTS = new Set(['internal-testflight', 'external-testflight', 'app-store-stage', 'app-store-submit']);
const SECRET_KEY = /(?:secret|password|token|credential|private[_-]?key|api[_-]?key|issuer|jwt|certificate)/i;
const TRANSIENT_KEYS = new Set(['currentVersion', 'lastVerifiedAt', 'readiness', 'ready', 'build', 'buildId', 'submission', 'submissionId', 'approval', 'authority', 'releaseCommit', 'sourceCommit', 'version', 'marketingVersion', 'timestamp', 'createdAt', 'updatedAt']);
const PRIVATE_KEY = /-----BEGIN (?:[A-Z0-9]+ )?PRIVATE KEY-----|-----BEGIN OPENSSH PRIVATE KEY-----/;
const CREDENTIAL_PATH = /(?:\.(?:p8|pem|key)(?:$|[\\/])|(?:^|[\\/])credentials?(?:[\\/]|$))/i;
export const APP_KEY = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const APP_ID = /^[0-9]+$/;
const GROUP_ID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const PATH_LINE_BREAK = /[\r\n]/;

function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function nonEmpty(value) { return typeof value === 'string' && value.trim().length > 0; }
function runGit(repo, args) { return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
function repoRoot(candidate) { return path.resolve(runGit(path.resolve(candidate), ['rev-parse', '--show-toplevel'])); }
function inside(root, candidate) { const relative = path.relative(root, candidate); return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative); }
function indexEntries(repo, relative) { return execFileSync('git', ['-C', repo, 'ls-files', '--stage', '-z', '--', relative], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).split('\0').filter(Boolean).map((record) => { const match = /^(\d{6}) ([0-9a-f]+) ([0-3])\t([\s\S]+)$/.exec(record); if (!match) throw new Error('Git index returned an invalid entry'); return { mode: match[1], path: match[4] }; }); }
function gitlink(repo, relative) { return indexEntries(repo, relative).some((entry) => entry.mode === '160000' && entry.path === relative); }
function ignored(repo, target) { try { runGit(repo, ['check-ignore', '--quiet', '--no-index', '--', target]); return true; } catch { return false; } }
function validateRepositoryPath(repo, resolved, location, errors) {
  const canonicalRepo = realpathSync.native(repo);
  const relative = path.relative(repo, resolved);
  const parts = relative.split(path.sep).filter(Boolean);
  for (let index = 1; index <= parts.length; index += 1) if (gitlink(repo, parts.slice(0, index).join(path.sep))) { errors.push(`${location}: path is inside a Git submodule`); break; }
  let current = repo;
  for (const part of parts) {
    current = path.join(current, part);
    try {
      const info = lstatSync(current);
      if (info.isSymbolicLink()) { errors.push(`${location}: symlinks are forbidden`); break; }
      if (!inside(canonicalRepo, realpathSync.native(current))) { errors.push(`${location}: path escapes the repository`); break; }
      if (info.isDirectory() && realpathSync.native(repoRoot(current)) !== canonicalRepo) { errors.push(`${location}: path is inside another Git repository`); break; }
    } catch (error) {
      if (error.code === 'ENOENT') break;
      errors.push(`${location}: path is not inspectable: ${error.message}`);
      break;
    }
  }
}
function relativePath(repo, value, location, errors, options = {}) {
  if (!nonEmpty(value)) { errors.push(`${location}: expected a non-empty relative path`); return null; }
  if (PATH_LINE_BREAK.test(value)) { errors.push(`${location}: carriage returns and newlines are forbidden`); return null; }
  if (CREDENTIAL_PATH.test(value)) errors.push(`${location}: credential or private-key paths are forbidden`);
  if (path.isAbsolute(value) || path.win32.isAbsolute(value)) { errors.push(`${location}: absolute paths are forbidden`); return null; }
  const resolved = path.resolve(repo, value);
  const rel = path.relative(repo, resolved);
  if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) errors.push(`${location}: path escapes the repository`);
  else validateRepositoryPath(repo, resolved, location, errors);
  if (options.rejectLocal && (rel === DIRECTORY || rel.startsWith(`${DIRECTORY}${path.sep}`))) errors.push(`${location}: path cannot be inside ${DIRECTORY}`);
  if (options.requireVisible && ignored(repo, rel)) errors.push(`${location}: path is ignored by Git`);
  if (options.existingDirectory) { try { const info = lstatSync(resolved); if (!info.isSymbolicLink() && !info.isDirectory()) errors.push(`${location}: existing path is not a directory`); } catch (error) { if (error.code !== 'ENOENT') errors.push(`${location}: path is not inspectable: ${error.message}`); } }
  return resolved;
}
export function unknown(value, allowed, location, errors) { if (object(value)) for (const key of Object.keys(value)) if (!allowed.has(key)) errors.push(`${location}.${key}: unknown field`); }
export function inspectSecrets(value, location, errors) {
  if (Array.isArray(value)) return value.forEach((item, index) => inspectSecrets(item, `${location}[${index}]`, errors));
  if (object(value)) { const dynamicAppMap = location === '$.apps'; return Object.entries(value).forEach(([key, item]) => { if (!dynamicAppMap && SECRET_KEY.test(key)) errors.push(`${location}.${key}: secret-shaped keys are forbidden`); if (!dynamicAppMap && TRANSIENT_KEYS.has(key)) errors.push(`${location}.${key}: transient release state is forbidden`); inspectSecrets(item, `${location}.${key}`, errors); }); }
  if (typeof value === 'string' && PRIVATE_KEY.test(value)) errors.push(`${location}: private-key material is forbidden`);
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
  if (app.aliases !== undefined) { if (!Array.isArray(app.aliases)) errors.push(`${location}.aliases: expected an array`); else { const seen = new Set(); app.aliases.forEach((alias, index) => { optionalString(alias, `${location}.aliases[${index}]`, errors); if (!nonEmpty(alias)) return; const normalized = alias.toLocaleLowerCase('en-US'); if (seen.has(normalized)) errors.push(`${location}.aliases: duplicate alias`); seen.add(normalized); }); } }
  relativePath(repo, app.sourceRoot ?? '.', `${location}.sourceRoot`, errors, { requireVisible: true, existingDirectory: true });
  if (!nonEmpty(app.bundleId)) missing.push(`${location}.bundleId`);
  if (!nonEmpty(app.appId)) missing.push(`${location}.appId`); else if (!APP_ID.test(app.appId)) errors.push(`${location}.appId: expected a decimal App Store ID`);
  if (app.platform !== 'IOS') { if (app.platform !== undefined) errors.push(`${location}.platform: expected IOS`); missing.push(`${location}.platform`); }
  if (!object(app.xcode)) { missing.push(`${location}.xcode`); } else { unknown(app.xcode, XCODE_FIELDS, `${location}.xcode`, errors); const containers = ['project', 'workspace'].filter((field) => app.xcode[field] !== undefined); if (containers.length !== 1) errors.push(`${location}.xcode: expected exactly one of project or workspace`); containers.forEach((field) => relativePath(repo, app.xcode[field], `${location}.xcode.${field}`, errors, { requireVisible: true, existingDirectory: true })); for (const field of ['scheme', 'configuration']) if (!nonEmpty(app.xcode[field])) missing.push(`${location}.xcode.${field}`); }
  if (app.testflight !== undefined) { if (!object(app.testflight)) errors.push(`${location}.testflight: expected an object`); else { unknown(app.testflight, TESTFLIGHT_FIELDS, `${location}.testflight`, errors); const ids = new Set(); for (const field of TESTFLIGHT_FIELDS) { if (app.testflight[field] === undefined) continue; if (!Array.isArray(app.testflight[field])) errors.push(`${location}.testflight.${field}: expected an array`); else app.testflight[field].forEach((group, index) => validateGroup(group, `${location}.testflight.${field}[${index}]`, errors, ids)); } } }
  if (app.metadataDirectory !== undefined) relativePath(repo, app.metadataDirectory, `${location}.metadataDirectory`, errors, { rejectLocal: true, requireVisible: true, existingDirectory: true });
  const releaseNotes = policies.validateConfigured(key, app.releaseNotes); errors.push(...releaseNotes.errors); missing.push(...releaseNotes.missing);
  if (app.defaultIntent !== undefined && !INTENTS.has(app.defaultIntent)) errors.push(`${location}.defaultIntent: invalid intent`);
  return releaseNotes.ok ? releaseNotes.value : null;
}
export function selectorClaims(apps, errors) {
  const claims = new Map(); const add = (selector, key, kind, location) => { if (!nonEmpty(selector)) return; const normalized = selector.toLocaleLowerCase('en-US'); if (claims.has(normalized)) errors.push(`${location}: selector ${JSON.stringify(selector)} collides with ${claims.get(normalized).kind}`); else claims.set(normalized, { key, kind }); };
  for (const key of Object.keys(apps)) { add(key, key, `app key ${key}`, `apps.${key}`); const app = apps[key]; if (!object(app)) continue; add(app.displayName, key, `display name ${JSON.stringify(app.displayName)} for ${key}`, `apps.${key}.displayName`); if (Array.isArray(app.aliases)) app.aliases.forEach((alias) => add(alias, key, `alias ${JSON.stringify(alias)} for ${key}`, `apps.${key}.aliases`)); }
  return claims;
}

export function parsePortableConfig(value, repo) { const errors = []; const missing = []; if (!object(value)) return { value: null, errors: ['$: expected an object'], missing }; const policies = createReleasePolicyBoundary(repo); unknown(value, ROOT_FIELDS, '$', errors); if (value.schemaVersion !== 2) errors.push('$.schemaVersion: expected 2'); if (!object(value.apps)) errors.push('$.apps: expected an object'); else { const keys = Object.keys(value.apps); if (value.defaultApp !== undefined && (!nonEmpty(value.defaultApp) || !Object.hasOwn(value.apps, value.defaultApp))) errors.push('$.defaultApp: unknown app'); selectorClaims(value.apps, errors); const archives = new Map(); const appIds = new Map(); for (const key of keys) { if (!APP_KEY.test(key)) errors.push(`apps.${key}: invalid app key`); const appId = value.apps[key]?.appId; if (nonEmpty(appId)) { const previousApp = appIds.get(appId); if (previousApp) errors.push(`apps.${key}.appId: duplicates apps.${previousApp}.appId`); else appIds.set(appId, key); } const releaseNotes = validateApp(repo, policies, key, value.apps[key], errors, missing); if (releaseNotes) { const archiveIdentity = releaseNotes.archive.absolute.normalize('NFC').toLocaleLowerCase('en-US'); const previous = archives.get(archiveIdentity); if (previous) errors.push(`apps.${key}.releaseNotes.archiveDirectory: collides with apps.${previous}.releaseNotes.archiveDirectory`); else archives.set(archiveIdentity, key); } } if (keys.length > 1 && value.defaultApp === undefined) missing.push('defaultApp'); }
  if (object(value.apps) && Object.keys(value.apps).length === 0) missing.push('apps'); inspectSecrets(value, '$', errors); return { value, errors, missing };
}
