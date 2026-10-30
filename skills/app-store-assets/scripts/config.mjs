#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { lstatSync, realpathSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sensitiveAssetPath } from './asset-paths.mjs';
import { parseJSON } from './strict-json.mjs';

const DIRECTORY = '.app-store-assets';
const IGNORE = '*\n!.gitignore\n!config.json\n';
const APP_KEY = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const LOCALE = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;
const BUNDLE = /^[A-Za-z0-9.-]+$/;
const RESERVED = new Set(['build', 'dist', 'deriveddata', 'node_modules', '.build', '.next', '.nuxt', 'coverage', '.cache', 'tmp', 'temp']);
const SECRET_KEY = /secret|password|token|credential|private[_-]?key|api[_-]?key|issuer|jwt|certificate/i;
const TRANSIENT = /^(?:currentVersion|lastVerifiedAt|readiness|ready|build|buildId|submission|submissionId|approval|authority|releaseCommit|sourceCommit|version|marketingVersion|timestamp|createdAt|updatedAt)$/i;
const SECRET_VALUE = /-----BEGIN (?:[A-Z0-9 ]*PRIVATE KEY)-----|\bBearer\s+\S+|\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]+|\bAKIA[A-Z0-9]{16}\b|\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|(?:https?:\/\/)[^\s/]+:[^\s@]+@|[?&](?:token|secret|signature|credential|password)=/i;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const safeKey = value => APP_KEY.test(value) && !SECRET_VALUE.test(value);
const normalize = value => value.normalize('NFC').toLowerCase();
const json = value => JSON.stringify(value, null, 2) + '\n';
const inside = (root, target) => { const r = path.relative(root, target); return r !== '..' && !r.startsWith(`..${path.sep}`) && !path.isAbsolute(r); };
function git(repo, args, input) { return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', input, stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'] }); }
function root(candidate) { return realpathSync(git(path.resolve(candidate), ['rev-parse', '--show-toplevel']).trim()); }
function info(target) { try { return lstatSync(target); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } }
function entries(repo, relative) { return git(repo, ['ls-files', '--stage', '-z', '--', `:(literal)${relative}`]).split('\0').filter(Boolean).map(row => { const match = /^(\d{6}) [0-9a-f]+ [0-3]\t([\s\S]+)$/.exec(row); if (!match) throw new Error('Invalid Git index'); return { mode: match[1], path: match[2] }; }); }
function ignored(repo, relative) { try { const fields = git(repo, ['check-ignore', '--no-index', '-z', '-v', '--stdin'], relative + '\0').split('\0'); return Boolean(fields[2] && !fields[2].startsWith('!')); } catch (error) { if (error.status === 1) return false; throw error; } }
function namespaceIgnored(repo, directory) { return ignored(repo, info(path.join(repo, directory)) ? directory : `${directory}/`); }
function context(repo) { return { repo, metadata: ['--git-dir', '--git-common-dir'].map(flag => realpathSync(path.resolve(repo, git(repo, ['rev-parse', flag]).trim()))) }; }
function safeComponents(ctx, relative, location, errors) {
  const parts = relative.split('/').filter(part => part && part !== '.');
  let current = ctx.repo;
  for (let i = 0; i < parts.length; i++) {
    current = path.join(current, parts[i]);
    if (ctx.metadata.some(meta => inside(meta, current))) { errors.push(`${location}: Git metadata paths are forbidden`); return false; }
    if (entries(ctx.repo, parts.slice(0, i + 1).join('/')).some(entry => entry.mode === '160000' && entry.path === parts.slice(0, i + 1).join('/'))) { errors.push(`${location}: submodules are forbidden`); return false; }
    const s = info(current);
    if (!s) continue;
    if (s.isSymbolicLink()) { errors.push(`${location}: symlinks are forbidden`); return false; }
    if (i < parts.length - 1 && !s.isDirectory()) { errors.push(`${location}: an ancestor is not a directory`); return false; }
    if (s.isDirectory()) {
      if (info(path.join(current, '.git')) || root(current) !== ctx.repo) { errors.push(`${location}: nested repositories are forbidden`); return false; }
    }
  }
  return true;
}
function namespace(ctx, directory, errors) {
  if (!safeComponents(ctx, directory, directory, errors)) return false;
  const stat = info(path.join(ctx.repo, directory));
  if (stat && !stat.isDirectory()) { errors.push(`${directory}: expected a directory`); return false; }
  const allowed = new Set([`${directory}/.gitignore`, `${directory}/config.json`]);
  if (entries(ctx.repo, directory).some(entry => !allowed.has(entry.path) || !['100644', '100755'].includes(entry.mode))) errors.push(`${directory}: only .gitignore and config.json may be tracked`);
  for (const name of ['.gitignore', 'config.json', 'local.json']) {
    const relative = `${directory}/${name}`;
    const s = info(path.join(ctx.repo, relative));
    if (s && (s.isSymbolicLink() || !s.isFile())) errors.push(`${relative}: expected a regular file without symlinks`);
  }
  return true;
}
function inspectSecrets(value, location, errors, dynamic = false) {
  if (Array.isArray(value)) { value.forEach(item => inspectSecrets(item, location, errors)); return; }
  if (object(value)) {
    for (const [key, item] of Object.entries(value)) {
      if (!dynamic && (SECRET_KEY.test(key) || TRANSIENT.test(key))) errors.push(`${location}: secret or transient fields are forbidden`);
      inspectSecrets(item, location, errors, key === 'apps' || key === 'simulators');
    }
  } else if (typeof value === 'string' && SECRET_VALUE.test(value)) errors.push(`${location}: secret-shaped values are forbidden`);
}
function unknown(value, fields, location, errors) { if (Object.keys(value).some(key => !fields.includes(key))) errors.push(`${location}: unsupported fields`); }
function required(value, field, location, errors, missing, valid = nonempty, description = 'a non-empty string') {
  if (value[field] === undefined) { missing.push(`${location}.${field}`); return false; }
  if (!valid(value[field])) { errors.push(`${location}.${field}: expected ${description}`); return false; }
  return true;
}
function pathValue(ctx, value, location, errors, missing, kind, optional = false) {
  if (!nonempty(value)) { errors.push(`${location}: expected a relative path`); return null; }
  if (path.isAbsolute(value) || path.win32.isAbsolute(value) || /[:\\\x00-\x1f\x7f]/.test(value) || value.split('/').includes('..') || /^[A-Za-z]:/.test(value)) { errors.push(`${location}: absolute, traversal, backslash and control-character paths are forbidden`); return null; }
  const relative = path.posix.normalize(value);
  const parts = relative.split('/');
  if (sensitiveAssetPath(relative) || parts.some(part => RESERVED.has(part.toLowerCase()))) { errors.push(`${location}: local, generated or credential paths are forbidden`); return null; }
  if (kind === 'asset' && relative === '.') { errors.push(`${location}: assetRoot must be a non-root directory`); return null; }
  if (!safeComponents(ctx, relative, location, errors)) return null;
  const absolute = path.join(ctx.repo, relative);
  const s = info(absolute);
  if (s && (kind === 'file' ? !s.isFile() : !s.isDirectory())) { errors.push(`${location}: expected a ${kind === 'file' ? 'file' : 'directory'}`); return null; }
  if (ignored(ctx.repo, relative) || (kind !== 'file' && ignored(ctx.repo, relative.replace(/\/$/, '') + '/'))) errors.push(`${location}: path must remain visible to Git`);
  if (!s && kind !== 'asset') missing.push(location);
  return absolute;
}
function readJSON(ctx, relative, errors, missing) {
  const before = errors.length;
  if (!safeComponents(ctx, relative, relative, errors)) return null;
  const s = info(path.join(ctx.repo, relative));
  if (!s) { missing.push(relative); return null; }
  if (!s.isFile()) { errors.push(`${relative}: expected a regular file`); return null; }
  try {
    const value = parseJSON(readFileSync(path.join(ctx.repo, relative)));
    if (!object(value)) { errors.push(`${relative}: expected an object`); return null; }
    inspectSecrets(value, relative, errors);
    return value;
  }
  catch { if (errors.length === before) errors.push(`${relative}: invalid JSON, UTF-8 or duplicate object key`); return null; }
}
function header(value, version, location, errors, missing, portable = false) {
  if (!object(value)) { errors.push(`${location}: expected an object`); return false; }
  unknown(value, portable ? ['schemaVersion', 'defaultApp', 'apps'] : ['schemaVersion', 'apps'], location, errors);
  if (value.schemaVersion !== version) errors.push(`${location}.schemaVersion: unexpected schema version`);
  if (!object(value.apps)) { errors.push(`${location}.apps: expected an object`); return false; }
  return true;
}
function list(value, field, location, errors, missing, valid) {
  if (!required(value, field, location, errors, missing, Array.isArray, 'an array')) return null;
  const items = value[field];
  if (!items.length) { missing.push(`${location}.${field}`); return null; }
  const seen = new Set();
  for (const item of items) {
    if (!nonempty(item) || !valid(item)) errors.push(`${location}.${field}: invalid item`);
    else if (seen.has(normalize(item))) errors.push(`${location}.${field}: duplicate item`);
    else seen.add(normalize(item));
  }
  return seen;
}
function identity(ctx, value, location, errors, missing, linked = false) {
  if (!object(value)) { errors.push(`${location}: expected an object`); return; }
  if (!linked) unknown(value, ['name', 'bundleId', 'ascAppId', 'sourceRoot', 'platform'], location, errors);
  if (!linked) required(value, 'name', location, errors, missing);
  required(value, 'bundleId', location, errors, missing, v => nonempty(v) && BUNDLE.test(v), 'a bundle identifier');
  const id = linked ? 'appId' : 'ascAppId';
  required(value, id, location, errors, missing, v => typeof v === 'string' && /^\d+$/.test(v), 'a decimal App Store ID string');
  required(value, 'platform', location, errors, missing, v => v === 'IOS', 'IOS');
  if (linked && value.sourceRoot === undefined) pathValue(ctx, '.', `${location}.sourceRoot`, errors, missing, 'directory');
  else if (required(value, 'sourceRoot', location, errors, missing)) pathValue(ctx, value.sourceRoot, `${location}.sourceRoot`, errors, missing, 'directory');
}
function localApps(value, keys, version, location, errors, missing, linked = false) {
  if (!header(value, version, location, errors, missing)) return {};
  for (const [key, binding] of Object.entries(value.apps)) {
    const label = `${location}.apps.${safeKey(key) ? key : '[invalid]'}`;
    if (!keys.includes(key)) errors.push(`${label}: no matching portable app`);
    if (!object(binding)) { errors.push(`${label}: expected an object`); continue; }
    unknown(binding, linked ? ['ascProfile'] : ['ascProfile', 'simulators'], label, errors);
    if (binding.ascProfile !== undefined && (!nonempty(binding.ascProfile) || /[\x00-\x1f\x7f]/.test(binding.ascProfile))) errors.push(`${label}.ascProfile: expected a non-empty profile name`);
    if (!linked && binding.simulators !== undefined) {
      if (!object(binding.simulators)) errors.push(`${label}.simulators: expected an object`);
      else for (const [selector, udid] of Object.entries(binding.simulators)) if (!/^(iphone|ipad):[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(selector) || !nonempty(udid) || /[\x00-\x1f\x7f]/.test(udid)) errors.push(`${label}.simulators: invalid simulator binding`);
    }
  }
  return value.apps;
}
function localSafety(ctx, directory, errors) {
  const relative = `${directory}/local.json`;
  const stat = info(path.join(ctx.repo, relative));
  if (stat && !stat.isSymbolicLink() && stat.isFile() && (stat.mode & 0o7177) !== 0) errors.push(`${relative}: permissions must be 0600 or stricter`);
  if (stat && !ignored(ctx.repo, relative)) errors.push(`${relative}: local bindings must be ignored`);
}
function baseResult(command, repo, errors = [], missing = []) { return { command, state: errors.length ? 'conflict' : missing.length ? 'incomplete' : command === 'init' ? 'initialized' : 'ready', repo, errors: [...new Set(errors)], missing: [...new Set(missing)] }; }

export function init(candidate) {
  let repo;
  try {
    repo = root(candidate); const ctx = context(repo); const errors = [];
    namespace(ctx, DIRECTORY, errors);
    const whitelist = path.join(repo, DIRECTORY, '.gitignore');
    const whitelistStat = info(whitelist);
    if (!errors.length && whitelistStat && readFileSync(whitelist, 'utf8') !== IGNORE) errors.push(`${DIRECTORY}/.gitignore: expected the strict whitelist`);
    if (namespaceIgnored(repo, DIRECTORY) || (whitelistStat && ignored(repo, `${DIRECTORY}/config.json`))) errors.push(`${DIRECTORY}: portable configuration must remain visible to Git`);
    if (errors.length) return baseResult('init', repo, errors);
    if (!info(path.join(repo, DIRECTORY))) mkdirSync(path.join(repo, DIRECTORY));
    const created = {};
    for (const [name, content, mode] of [['.gitignore', IGNORE, 0o644], ['config.json', json({ schemaVersion: 1, apps: {} }), 0o644], ['local.json', json({ schemaVersion: 1, apps: {} }), 0o600]]) {
      try { writeFileSync(path.join(repo, DIRECTORY, name), content, { flag: 'wx', mode }); created[name] = true; }
      catch (error) { if (error.code !== 'EEXIST') throw error; created[name] = false; }
    }
    return { ...baseResult('init', repo), created };
  } catch { return baseResult('init', repo ?? null, ['Repository or configuration path cannot be safely initialized']); }
}

export function doctor(candidate, selector) {
  let repo;
  try {
    repo = root(candidate); const ctx = context(repo); const errors = []; const globalMissing = []; const warnings = [];
    if (!namespace(ctx, DIRECTORY, errors) || errors.length) return baseResult('doctor', repo, errors);
    const whitelist = info(path.join(repo, DIRECTORY, '.gitignore'));
    if (!whitelist) globalMissing.push(`${DIRECTORY}/.gitignore`);
    else if (readFileSync(path.join(repo, DIRECTORY, '.gitignore'), 'utf8') !== IGNORE) errors.push(`${DIRECTORY}/.gitignore: expected the strict whitelist`);
    if (ignored(repo, `${DIRECTORY}/config.json`) || namespaceIgnored(repo, DIRECTORY)) errors.push(`${DIRECTORY}: portable configuration must remain visible to Git`);
    localSafety(ctx, DIRECTORY, errors);
    const config = readJSON(ctx, `${DIRECTORY}/config.json`, errors, globalMissing);
    const local = readJSON(ctx, `${DIRECTORY}/local.json`, errors, globalMissing);
    if (!config) return baseResult('doctor', repo, errors, globalMissing);
    if (!header(config, 1, `${DIRECTORY}/config.json`, errors, globalMissing, true)) return baseResult('doctor', repo, errors, globalMissing);
    const keys = Object.keys(config.apps); const incompleteness = new Map(keys.map(key => [key, []]));
    const bindings = local ? localApps(local, keys, 1, `${DIRECTORY}/local.json`, errors, globalMissing) : {};
    if (!keys.length) globalMissing.push('apps');
    const claims = new Map(); const roots = []; const ids = new Map(); const links = new Set();
    const claim = (value, key) => { if (!nonempty(value)) return; const n = normalize(value); if (claims.has(n) && claims.get(n) !== key) errors.push('apps: ambiguous app selector'); else claims.set(n, key); };
    let releaseConfig; let releaseBindings; let releaseLoaded = false; const releaseMissing = [];
    const loadRelease = () => {
      if (releaseLoaded) return; releaseLoaded = true;
      if (!namespace(ctx, '.ios-release', errors)) return;
      const ignoredConfig = ignored(repo, '.ios-release/config.json') || namespaceIgnored(repo, '.ios-release');
      if (ignoredConfig) errors.push('.ios-release/config.json: portable configuration must remain visible to Git');
      releaseConfig = readJSON(ctx, '.ios-release/config.json', errors, releaseMissing);
      if (releaseConfig && !header(releaseConfig, 2, '.ios-release/config.json', errors, releaseMissing, true)) releaseConfig = null;
      localSafety(ctx, '.ios-release', errors);
      const releaseLocal = readJSON(ctx, '.ios-release/local.json', errors, releaseMissing);
      releaseBindings = releaseLocal ? localApps(releaseLocal, Object.keys(releaseConfig?.apps ?? {}), 2, '.ios-release/local.json', errors, releaseMissing, true) : {};
    };
    for (const key of keys) {
      const m = incompleteness.get(key); const label = `apps.${safeKey(key) ? key : '[invalid]'}`; const app = config.apps[key];
      if (!safeKey(key)) errors.push('apps: invalid or secret-shaped app key');
      claim(key, key);
      if (!object(app)) { errors.push(`${label}: expected an object`); continue; }
      unknown(app, ['releaseApp', 'identity', 'assetRoot', 'sourceLocale', 'locales', 'devices', 'orientations', 'templates', 'capturePlan'], label, errors);
      if (required(app, 'assetRoot', label, errors, m)) { const assetRoot = pathValue(ctx, app.assetRoot, `${label}.assetRoot`, errors, m, 'asset'); if (assetRoot) { const canonical = normalize(assetRoot); if (roots.some(previous => inside(previous, canonical) || inside(canonical, previous))) errors.push(`${label}.assetRoot: app asset directories must not overlap`); roots.push(canonical); } }
      required(app, 'sourceLocale', label, errors, m, v => nonempty(v) && LOCALE.test(v), 'a locale');
      const locales = list(app, 'locales', label, errors, m, v => LOCALE.test(v));
      if (nonempty(app.sourceLocale) && locales && !locales.has(normalize(app.sourceLocale))) errors.push(`${label}.sourceLocale: must be included in locales`);
      list(app, 'devices', label, errors, m, v => ['iphone', 'ipad'].includes(v));
      list(app, 'orientations', label, errors, m, v => ['portrait', 'landscape'].includes(v));
      if (app.templates === undefined) m.push(`${label}.templates`);
      else if (!object(app.templates)) errors.push(`${label}.templates: expected an object`);
      else { unknown(app.templates, ['screenshots', 'appPreview', 'header', 'search'], `${label}.templates`, errors); for (const field of ['screenshots', 'appPreview', 'header', 'search']) if (app.templates[field] !== undefined) pathValue(ctx, app.templates[field], `${label}.templates.${field}`, errors, m, 'file'); }
      if (app.capturePlan !== undefined) pathValue(ctx, app.capturePlan, `${label}.capturePlan`, errors, m, 'file');
      const hasLink = app.releaseApp !== undefined; const hasIdentity = app.identity !== undefined;
      if (hasLink && hasIdentity) errors.push(`${label}: use exactly one of releaseApp or identity`);
      else if (!hasLink && !hasIdentity) m.push(`${label}.identity or releaseApp`);
      let appId; let profile = bindings[key]?.ascProfile;
      if (hasIdentity) { identity(ctx, app.identity, `${label}.identity`, errors, m); claim(app.identity?.name, key); appId = app.identity?.ascAppId; }
      if (hasLink) {
        if (!nonempty(app.releaseApp) || !APP_KEY.test(app.releaseApp)) errors.push(`${label}.releaseApp: expected an app key`);
        else {
          const n = normalize(app.releaseApp); if (links.has(n)) errors.push(`${label}.releaseApp: duplicate release link`); links.add(n);
          loadRelease(); m.push(...releaseMissing); const linked = releaseConfig?.apps?.[app.releaseApp];
          if (releaseConfig && linked === undefined) m.push(`${label}.releaseApp: linked app is missing`);
          else if (linked !== undefined) {
            identity(ctx, linked, `${label}.releaseApp.identity`, errors, m, true); appId = linked?.appId;
            if (object(linked)) unknown(linked, ['displayName', 'aliases', 'sourceRoot', 'bundleId', 'appId', 'platform', 'xcode', 'testflight', 'metadataDirectory', 'releaseNotes', 'defaultIntent'], `${label}.releaseApp`, errors);
            if (object(linked)) {
              if (linked.displayName !== undefined && !nonempty(linked.displayName)) errors.push(`${label}.releaseApp.displayName: expected a non-empty name`);
              claim(linked.displayName, key);
              if (linked.aliases !== undefined && (!Array.isArray(linked.aliases) || linked.aliases.some(alias => !nonempty(alias)))) errors.push(`${label}.releaseApp.aliases: expected names`);
              else for (const alias of linked.aliases ?? []) claim(alias, key);
              if (linked.releaseNotes === undefined) m.push(`${label}.releaseApp.releaseNotes`);
              else if (!object(linked.releaseNotes)) errors.push(`${label}.releaseApp.releaseNotes: expected an object`);
              else {
                const notes = linked.releaseNotes; const loc = `${label}.releaseApp.releaseNotes`;
                unknown(notes, ['archiveDirectory', 'sourceLocale', 'locales', 'tagPrefix', 'tone', 'promotionalText'], loc, errors);
                required(notes, 'sourceLocale', loc, errors, m, v => nonempty(v) && LOCALE.test(v), 'a locale');
                const linkedLocales = list(notes, 'locales', loc, errors, m, v => LOCALE.test(v));
                if (linkedLocales && nonempty(notes.sourceLocale) && !linkedLocales.has(normalize(notes.sourceLocale))) errors.push(`${loc}.sourceLocale: must be included in locales`);
                if (nonempty(notes.sourceLocale) && nonempty(app.sourceLocale) && normalize(notes.sourceLocale) !== normalize(app.sourceLocale)) warnings.push(`${label}.sourceLocale: differs from linked release policy; reconcile before the app run`);
                if (linkedLocales && locales && (linkedLocales.size !== locales.size || [...linkedLocales].some(locale => !locales.has(locale)))) warnings.push(`${label}.locales: differ from linked release policy; reconcile before the app run`);
              }
            }
          }
          const linkedProfile = releaseBindings?.[app.releaseApp]?.ascProfile;
          if (profile && linkedProfile && profile !== linkedProfile) errors.push(`${label}: local ASC profiles disagree`);
          if (!linkedProfile) m.push(`${label}.releaseApp.ascProfile`);
          profile = linkedProfile;
        }
      }
      if (!hasLink && !profile) m.push(`${label}.ascProfile`);
      if (typeof appId === 'string') { if (ids.has(appId)) errors.push(`${label}: duplicate App Store identity`); else ids.set(appId, key); }
    }
    let selected;
    if (selector !== undefined) { if (!nonempty(selector) || !claims.has(normalize(selector))) errors.push('--app: unknown app selector'); else selected = claims.get(normalize(selector)); }
    if (config.defaultApp !== undefined && (!nonempty(config.defaultApp) || !Object.hasOwn(config.apps, config.defaultApp))) errors.push('defaultApp: expected an existing app key');
    if (keys.length > 1 && config.defaultApp === undefined && selector === undefined) globalMissing.push('defaultApp');
    const missing = [...globalMissing, ...keys.filter(key => selector === undefined || key === selected).flatMap(key => incompleteness.get(key))];
    return { ...baseResult('doctor', repo, errors, missing), selectedApp: [selected ?? config.defaultApp ?? (keys.length === 1 ? keys[0] : null)].map(value => typeof value === 'string' && safeKey(value) ? value : null)[0], warnings: [...new Set(warnings)], checks: { scope: 'offline', deviceSupport: 'manual', remoteReadiness: 'not-checked' } };
  } catch { return baseResult('doctor', repo ?? null, ['Repository or configuration path cannot be safely inspected']); }
}

const HELP = 'Usage: node config.mjs init --repo PATH\n       node config.mjs doctor --repo PATH [--app KEY-OR-NAME-OR-ALIAS]\nOffline configuration checks only. No ASC or external service calls.\n';
async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) { process.stdout.write(HELP); return; }
  const command = args.shift(); let repo; let app; let invalid = !['init', 'doctor'].includes(command);
  for (let i = 0; i < args.length; i++) {
    const flag = args[i]; const value = args[++i];
    if (!value || value.startsWith('--')) { invalid = true; break; }
    if (flag === '--repo' && repo === undefined) repo = value;
    else if (flag === '--app' && command === 'doctor' && app === undefined) app = value;
    else invalid = true;
  }
  const result = invalid || repo === undefined ? baseResult(command ?? 'unknown', null, ['Expected init or doctor, --repo PATH, and optional doctor --app selector']) : command === 'init' ? init(repo) : doctor(repo, app);
  process.stdout.write(json(result));
  if (!['initialized', 'ready'].includes(result.state)) process.exitCode = 1;
}
if (process.argv[1] && info(process.argv[1]) && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
