import { execFileSync } from 'node:child_process';
import { lstatSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';

const DIRECTORY = '.ios-release';
const FORBIDDEN = new Set(['.git', '.asc', DIRECTORY, 'credentials', 'deriveddata', 'build', 'dist']);
const PATH_LINE_BREAK = /[\r\n]/;
const LOCALE = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;
const PROMOTIONAL_TEXT = new Set(['preserve', 'suggest']);
const RELEASE_FIELDS = new Set(['archiveDirectory', 'sourceLocale', 'locales', 'tagPrefix', 'tone', 'promotionalText']);

function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function nonEmpty(value) { return typeof value === 'string' && value.trim().length > 0; }
function runGit(repo, args) { return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
function repoRoot(candidate) { return path.resolve(runGit(path.resolve(candidate), ['rev-parse', '--show-toplevel'])); }
function inside(root, candidate) { const relative = path.relative(root, candidate); return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative); }
function gitMetadataDirectories(repo) { return [...new Set(['--git-dir', '--git-common-dir'].map((flag) => realpathSync.native(path.resolve(repo, runGit(repo, ['rev-parse', flag])))))]; }
function ignoreMatch(repo, relative) { try { const fields = execFileSync('git', ['-C', repo, 'check-ignore', '-z', '-v', '--no-index', '--stdin'], { input: `${relative}\0`, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).split('\0'); return { source: fields[0], line: fields[1], pattern: fields[2], path: fields[3] }; } catch (error) { if (error.status === 1) return null; throw error; } }
function ignored(repo, relative) { const match = ignoreMatch(repo, relative); return Boolean(match && !match.pattern.startsWith('!')); }
function tracked(repo, relative) { return runGit(repo, ['ls-files', '--', relative]).length > 0; }
function gitlink(repo, relative) { return execFileSync('git', ['-C', repo, 'ls-files', '--stage', '-z', '--', relative], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).split('\0').filter(Boolean).some((record) => { const match = /^(\d{6}) ([0-9a-f]+) ([0-3])\t([\s\S]+)$/.exec(record); if (!match) throw new Error('Git index returned an invalid entry'); return match[1] === '160000' && match[4] === relative; }); }

function parsePolicy(appKey, rawPolicy) {
  const location = `apps.${appKey}.releaseNotes`;
  const errors = [];
  const missing = [];
  if (rawPolicy === undefined) return { ok: false, errors: [], missing: [location] };
  if (!object(rawPolicy)) return { ok: false, errors: [`${location}: expected an object`], missing: [] };
  for (const key of Object.keys(rawPolicy)) if (!RELEASE_FIELDS.has(key)) errors.push(`${location}.${key}: unknown field`);
  if (!nonEmpty(rawPolicy.archiveDirectory)) errors.push(`${location}.archiveDirectory: expected a non-empty relative path`);
  if (!nonEmpty(rawPolicy.sourceLocale) || !LOCALE.test(rawPolicy.sourceLocale)) errors.push(`${location}.sourceLocale: expected a valid locale`);
  if (!Array.isArray(rawPolicy.locales) || rawPolicy.locales.length === 0) errors.push(`${location}.locales: expected a non-empty array`);
  else {
    const seen = new Set();
    for (const [index, locale] of rawPolicy.locales.entries()) {
      if (!nonEmpty(locale) || !LOCALE.test(locale)) errors.push(`${location}.locales[${index}]: expected a valid locale`);
      const normalized = nonEmpty(locale) ? locale.normalize('NFC').toLocaleLowerCase('en-US') : locale;
      if (seen.has(normalized)) errors.push(`${location}.locales: duplicate locale`);
      seen.add(normalized);
    }
    const sourceLocale = nonEmpty(rawPolicy.sourceLocale) ? rawPolicy.sourceLocale.normalize('NFC').toLocaleLowerCase('en-US') : rawPolicy.sourceLocale;
    if (nonEmpty(rawPolicy.sourceLocale) && !seen.has(sourceLocale)) errors.push(`${location}.sourceLocale: must be included in locales`);
  }
  for (const field of ['tagPrefix', 'tone']) if (rawPolicy[field] !== undefined && !nonEmpty(rawPolicy[field])) errors.push(`${location}.${field}: expected a non-empty string`);
  if (!PROMOTIONAL_TEXT.has(rawPolicy.promotionalText)) errors.push(`${location}.promotionalText: expected preserve or suggest`);
  if (errors.length) return { ok: false, errors, missing };
  return { ok: true, value: { ...rawPolicy, locales: [...rawPolicy.locales] }, errors: [], missing: [] };
}

function resolveRepositoryPath(repo, metadataDirectories, value, location, allowTracked = false, directoryCandidate = false) {
  const errors = [];
  if (!nonEmpty(value)) return { ok: false, errors: [`${location}: expected a non-empty relative path`] };
  if (PATH_LINE_BREAK.test(value)) return { ok: false, errors: [`${location}: carriage returns and newlines are forbidden`] };
  if (path.isAbsolute(value) || path.win32.isAbsolute(value)) return { ok: false, errors: [`${location}: absolute paths are forbidden`] };
  const absolute = path.resolve(repo, value);
  if (!inside(repo, absolute)) return { ok: false, errors: [`${location}: path escapes the repository`] };
  const relative = path.relative(repo, absolute);
  const canonicalCandidate = path.resolve(realpathSync.native(repo), relative);
  if (metadataDirectories.some((metadata) => inside(metadata, canonicalCandidate))) errors.push(`${location}: path is inside Git metadata`);
  const parts = relative.split(path.sep).filter(Boolean);
  if (parts.some((part) => FORBIDDEN.has(part.normalize('NFC').toLocaleLowerCase('en-US')))) errors.push(`${location}: unsafe generated, local, or credential location`);
  for (let index = 1; index <= parts.length; index += 1) if (gitlink(repo, parts.slice(0, index).join(path.sep))) { errors.push(`${location}: path is inside a Git submodule`); break; }
  const canonicalRepo = realpathSync.native(repo);
  let current = repo;
  for (const part of parts) {
    current = path.join(current, part);
    try {
      const info = lstatSync(current);
      if (info.isSymbolicLink()) { errors.push(`${location}: symlinks are forbidden`); break; }
      if (!inside(canonicalRepo, realpathSync.native(current))) { errors.push(`${location}: path escapes the repository`); break; }
      if (info.isDirectory()) {
        try { if (realpathSync.native(repoRoot(current)) !== canonicalRepo) { errors.push(`${location}: path is inside another Git repository`); break; } } catch { /* A normal untracked directory may not be a Git worktree. */ }
      }
    } catch (error) {
      if (error.code === 'ENOENT') break;
      errors.push(`${location}: path is not inspectable: ${error.message}`);
      break;
    }
  }
  const gitRelative = relative.split(path.sep).join('/') || '.'; const isIgnored = errors.length === 0 && (ignored(repo, gitRelative) || (directoryCandidate && gitRelative !== '.' && ignored(repo, `${gitRelative}/`))); const markdownCandidate = gitRelative === '.' ? '0.0.0.md' : `${gitRelative}/0.0.0.md`; const markdownIgnored = errors.length === 0 && directoryCandidate && ignored(repo, markdownCandidate);
  if ((isIgnored && !(allowTracked && tracked(repo, relative))) || markdownIgnored) errors.push(`${location}: path is ignored`);
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { relative, absolute }, errors: [] };
}

function defaultPolicy(archiveDirectory) { return { archiveDirectory, sourceLocale: 'en-US', locales: ['en-US'], promotionalText: 'preserve' }; }
function convention(appKey, appCount) { return appCount > 1 ? `release-notes/ios/${appKey}` : 'release-notes'; }

export function createReleasePolicyBoundary(repoCandidate) {
  const repo = repoRoot(repoCandidate);
  const metadataDirectories = gitMetadataDirectories(repo);
  function validateConfigured(appKey, rawPolicy) {
    const parsed = parsePolicy(appKey, rawPolicy);
    if (!parsed.ok) return parsed;
    const archive = resolveRepositoryPath(repo, metadataDirectories, parsed.value.archiveDirectory, `apps.${appKey}.releaseNotes.archiveDirectory`, false, true);
    if (!archive.ok) return { ok: false, errors: archive.errors, missing: [] };
    try {
      if (!lstatSync(archive.value.absolute).isDirectory()) return { ok: false, errors: [`apps.${appKey}.releaseNotes.archiveDirectory: existing path is not a directory`], missing: [] };
    } catch (error) {
      if (error.code !== 'ENOENT') return { ok: false, errors: [`apps.${appKey}.releaseNotes.archiveDirectory: path is not inspectable: ${error.message}`], missing: [] };
    }
    return { ok: true, value: { policy: parsed.value, archive: archive.value }, errors: [], missing: [] };
  }
  function planMigration(appKey, appCount, rawPolicy) {
    if (rawPolicy !== undefined) {
      const checked = validateConfigured(appKey, rawPolicy);
      return checked.ok ? { status: 'ready', policy: checked.value.policy } : { status: 'conflict', errors: checked.errors };
    }
    const safe = [];
    for (const relative of [`release-notes/ios/${appKey}`, `release-notes/${appKey}`, 'release-notes']) {
      try {
        if (!statSync(path.join(repo, relative)).isDirectory()) continue;
      } catch { continue; }
      const checked = validateConfigured(appKey, defaultPolicy(relative));
      if (checked.ok) safe.push(relative);
    }
    const candidates = [...new Set(safe)];
    if (appCount > 1 && candidates.includes('release-notes')) {
      const perApp = [...new Set([...candidates.filter((relative) => relative !== 'release-notes'), `release-notes/ios/${appKey}`, `release-notes/${appKey}`])]
        .filter((relative) => validateConfigured(appKey, defaultPolicy(relative)).ok);
      return { status: 'choice', candidates: perApp, errors: [`apps.${appKey}.releaseNotes.archiveDirectory: shared release-notes is ambiguous for multiple apps; choose one per-app candidate: ${perApp.join(', ')}`] };
    }
    if (candidates.length > 1) return { status: 'choice', candidates, errors: [`apps.${appKey}.releaseNotes.archiveDirectory: choose one candidate: ${candidates.join(', ')}`] };
    const policy = defaultPolicy(candidates[0] ?? convention(appKey, appCount));
    const checked = validateConfigured(appKey, policy);
    return checked.ok ? { status: 'ready', policy: checked.value.policy } : { status: 'conflict', errors: checked.errors };
  }
  function resolveNote(appKey, rawPolicy, marketingVersion) {
    const checked = validateConfigured(appKey, rawPolicy);
    if (!checked.ok) {
      const localeError = checked.errors.some((error) => error.includes('.locales') || error.includes('.sourceLocale'));
      return { ok: false, reasons: [{ code: localeError ? 'invalid-locale-policy' : 'invalid-archive-policy', detail: checked.errors.join('; ') }] };
    }
    if (!nonEmpty(marketingVersion) || marketingVersion !== path.basename(marketingVersion) || marketingVersion !== path.win32.basename(marketingVersion) || marketingVersion === '.' || marketingVersion === '..') {
      return { ok: false, reasons: [{ code: 'invalid-marketing-version', detail: 'version must be one path segment' }] };
    }
    const note = resolveRepositoryPath(repo, metadataDirectories, path.join(checked.value.archive.relative, `${marketingVersion}.md`), 'releaseNotes.archivePath', true);
    if (!note.ok) return { ok: false, reasons: [{ code: 'archive-outside-repository', detail: note.errors.join('; ') }] };
    return { ok: true, value: { archivePath: note.value.absolute, archiveRelative: note.value.relative, locales: checked.value.policy.locales, sourceLocale: checked.value.policy.sourceLocale, promotionalText: checked.value.policy.promotionalText } };
  }
  return { validateConfigured, planMigration, resolveNote };
}
