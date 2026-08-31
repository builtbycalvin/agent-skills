#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createReleasePolicyBoundary } from './release-policy.mjs';
import { duplicateJsonKeys, parseUniqueJson } from './strict-json.mjs';

const ALLOWED_FRONTMATTER = new Set(['schemaVersion', 'app', 'marketingVersion', 'sourceCommit', 'sourceRange', 'sourceLocale', 'locales']);
const SOURCE_COMMIT = /^[0-9a-f]{40}$/i;

function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function runGit(repo, args) { return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
function repoRoot(repo) { return path.resolve(runGit(path.resolve(repo), ['rev-parse', '--show-toplevel'])); }
function inside(root, candidate) { const relative = path.relative(root, candidate); return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative); }
function indexEntries(repo, relative) { return execFileSync('git', ['-C', repo, 'ls-files', '--stage', '-z', '--', relative], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).split('\0').filter(Boolean).map((record) => { const match = /^(\d{6}) ([0-9a-f]+) ([0-3])\t([\s\S]+)$/.exec(record); if (!match) throw new Error('Git index returned an invalid entry'); return { mode: match[1], path: match[4] }; }); }
function safeConfigPath(repo, candidate) {
  const configPath = path.resolve(repo, candidate);
  const canonicalRepo = realpathSync.native(repo);
  if (!inside(repo, configPath)) throw new Error('configuration path escapes the repository');
  const relative = path.relative(repo, configPath); const parts = relative.split(path.sep).filter(Boolean); for (let index = 1; index <= parts.length; index += 1) { const prefix = parts.slice(0, index).join('/'); if (indexEntries(repo, prefix).some((entry) => entry.mode === '160000' && entry.path === prefix)) throw new Error('configuration path is inside a Git submodule'); }
  let current = repo; for (const part of parts) { current = path.join(current, part); if (lstatSync(current).isSymbolicLink()) throw new Error('configuration path has a symlinked component'); }
  const info = lstatSync(configPath);
  if (info.isSymbolicLink()) throw new Error('configuration path is symlinked');
  if (!info.isFile()) throw new Error('configuration path is not a regular file');
  const canonicalConfig = realpathSync.native(configPath);
  if (!inside(canonicalRepo, canonicalConfig)) throw new Error('configuration path escapes the repository');
  const gitDirectory = path.resolve(repo, runGit(repo, ['rev-parse', '--git-dir']));
  const gitCommonDirectory = path.resolve(repo, runGit(repo, ['rev-parse', '--git-common-dir']));
  for (const metadataDirectory of [gitDirectory, gitCommonDirectory]) if (inside(realpathSync.native(metadataDirectory), canonicalConfig)) throw new Error('configuration path is inside Git metadata');
  if (realpathSync.native(repoRoot(path.dirname(canonicalConfig))) !== canonicalRepo) throw new Error('configuration path is inside another Git repository');
  try { runGit(repo, ['check-ignore', '--quiet', '--no-index', '--', path.relative(repo, configPath)]); throw new Error('configuration path is ignored by Git'); } catch (error) { if (error.message === 'configuration path is ignored by Git') throw error; }
  return configPath;
}
function section(markdown, title) { const heading = new RegExp(`^## ${title.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\s*$`, 'm'); const match = heading.exec(markdown); if (!match) return null; const start = match.index + match[0].length; const next = markdown.slice(start).search(/^## .+$/m); return markdown.slice(start, next < 0 ? undefined : start + next).trim(); }
function localized(content, errors, label) { const result = {}; const headings = [...content.matchAll(/^### ([^\n]+)\s*$/gm)]; const prefixEnd = headings[0]?.index ?? content.length; if (content.slice(0, prefixEnd).trim()) errors.push(`${label}: content before first locale heading`); for (let index = 0; index < headings.length; index += 1) { const locale = headings[index][1].trim(); const start = headings[index].index + headings[index][0].length; const end = index + 1 < headings.length ? headings[index + 1].index : content.length; if (Object.hasOwn(result, locale)) errors.push(`${label}: duplicate locale heading ${locale}`); result[locale] = content.slice(start, end).trim(); } return result; }

export function parseReleaseNote(markdown, source = '<string>') {
  const lines = String(markdown).split(/\r?\n/); const errors = []; let frontmatter = null; let frontmatterParsed = false; let body = String(markdown);
  if (lines[0] !== '---') errors.push(`${source}: front matter must start with ---`); else { const end = lines.indexOf('---', 1); if (end < 0) errors.push(`${source}: front matter is not closed`); else { const raw = lines.slice(1, end).join('\n'); try { frontmatter = JSON.parse(raw); frontmatterParsed = true; for (const key of duplicateJsonKeys(raw)) errors.push(`${source}: duplicate front matter key ${JSON.stringify(key)}`); } catch (error) { errors.push(`${source}: front matter is not valid JSON: ${error.message}`); } body = lines.slice(end + 1).join('\n'); } }
  if (frontmatterParsed && !object(frontmatter)) errors.push(`${source}: front matter must be a JSON object`);
  if (object(frontmatter)) { for (const key of Object.keys(frontmatter)) if (!ALLOWED_FRONTMATTER.has(key)) errors.push(`frontmatter.${key}: transient or unknown field`); if (frontmatter.schemaVersion !== 2) errors.push('frontmatter.schemaVersion: expected 2'); if (typeof frontmatter.sourceLocale !== 'string' || !frontmatter.sourceLocale.trim()) errors.push('frontmatter.sourceLocale: expected a non-empty string'); if (!Array.isArray(frontmatter.locales)) errors.push('frontmatter.locales: expected an array'); }
  const recognized = new Set(["App Store What's New", 'TestFlight What to Test', 'Promotional Text', 'Evidence']); const counts = new Map(); const headings = [...body.matchAll(/^## (.+?)\s*$/gm)]; const prefixEnd = headings[0]?.index ?? body.length; if (body.slice(0, prefixEnd).trim()) errors.push('body: content before first top-level section'); for (const match of headings) { const title = match[1].trim(); if (!recognized.has(title)) errors.push(`${title}: unsupported top-level section`); else counts.set(title, (counts.get(title) ?? 0) + 1); } for (const [title, count] of counts) if (count > 1) errors.push(`${title}: duplicate section`);
  const appStoreBody = section(body, "App Store What's New"); const testFlightBody = section(body, 'TestFlight What to Test'); const promotionalTextBody = section(body, 'Promotional Text'); const evidenceBody = section(body, 'Evidence'); if (appStoreBody === null) errors.push('App Store What\'s New section is required'); if (evidenceBody === null) errors.push('Evidence section is required'); else if (!evidenceBody.trim()) errors.push('Evidence section must not be empty');
  return { source, frontmatter, sectionPresence: { appStore: appStoreBody !== null, testFlight: testFlightBody !== null, promotionalText: promotionalTextBody !== null, evidence: evidenceBody !== null }, appStore: appStoreBody === null ? {} : localized(appStoreBody, errors, "App Store What's New"), testFlight: testFlightBody === null ? {} : localized(testFlightBody, errors, 'TestFlight What to Test'), promotionalText: promotionalTextBody === null ? {} : localized(promotionalTextBody, errors, 'Promotional Text'), evidence: evidenceBody ?? '', errors };
}
function addReason(reasons, code, detail) { reasons.push({ code, ...(detail ? { detail } : {}) }); }
function result(status, reasons, extra = {}) { return { status, state: status, valid: status === 'valid', reasons, errors: reasons.map((reason) => reason.detail ? `${reason.code}: ${reason.detail}` : reason.code), ...extra }; }
function resolveCommit(repo, revision) { try { return runGit(repo, ['rev-parse', '--verify', '--end-of-options', `${revision}^{commit}`]); } catch { return null; } }
function isAncestor(repo, base, head) { try { runGit(repo, ['merge-base', '--is-ancestor', base, head]); return true; } catch { return false; } }
function isDirectChild(repo, parent, child) { try { const [commit, ...parents] = runGit(repo, ['rev-list', '--parents', '-n', '1', child]).split(' '); return commit === child && parents.length === 1 && parents[0] === parent; } catch { return false; } }
function committedFileMatches(repo, commit, relative, content) { try { const committedBlob = runGit(repo, ['rev-parse', '--verify', '--end-of-options', `${commit}:${relative}`]); const worktreeBlob = execFileSync('git', ['-C', repo, 'hash-object', `--path=${relative}`, '--stdin'], { input: content, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim(); return committedBlob === worktreeBlob; } catch { return false; } }
function validateGitEvidence(repo, requestedSourceCommit, frontmatter, archiveRelative, markdown, reasons) {
  const recorded = String(frontmatter.sourceCommit ?? '');
  if (!SOURCE_COMMIT.test(requestedSourceCommit) || !SOURCE_COMMIT.test(recorded)) { addReason(reasons, 'full-source-commit-required'); return; }
  const source = resolveCommit(repo, recorded);
  const requested = resolveCommit(repo, requestedSourceCommit);
  if (!source) addReason(reasons, 'source-commit-unresolved', recorded);
  if (!requested) addReason(reasons, 'requested-source-commit-unresolved', requestedSourceCommit);
  else if (source && requested !== source) {
    if (!isDirectChild(repo, source, requested)) addReason(reasons, 'wrong-source-commit', `${requested} is neither archived source ${source} nor its release commit`);
    else if (!committedFileMatches(repo, requested, archiveRelative, markdown)) addReason(reasons, 'release-note-not-in-release-commit', archiveRelative);
  }
  const range = typeof frontmatter.sourceRange === 'string' && !frontmatter.sourceRange.includes('...') ? frontmatter.sourceRange.split('..') : [];
  if (range.length !== 2 || range.some((part) => !part)) { addReason(reasons, 'source-range-invalid', String(frontmatter.sourceRange ?? '<missing>')); return; }
  if (!SOURCE_COMMIT.test(range[0])) { addReason(reasons, 'source-range-base-full-commit-required', range[0]); return; }
  if (!SOURCE_COMMIT.test(range[1])) { addReason(reasons, 'source-range-head-full-commit-required', range[1]); return; }
  const base = resolveCommit(repo, range[0]);
  const head = resolveCommit(repo, range[1]);
  if (!base || !head) addReason(reasons, 'source-range-unresolved', frontmatter.sourceRange);
  else if (source) {
    if (head !== source) addReason(reasons, 'source-range-does-not-end-at-commit', `${head} != ${source}`);
    if (base === source) addReason(reasons, 'source-range-base-not-distinct', base);
    else if (!isAncestor(repo, base, source)) addReason(reasons, 'source-range-base-not-ancestor', `${base} is not an ancestor of ${source}`);
  }
}

export function checkReleaseNote(input) {
  const repo = repoRoot(input.repo); let configPath = path.resolve(repo, input.config ?? '.ios-release/config.json'); const reasons = []; const version = String(input.version ?? ''); const sourceCommit = String(input.sourceCommit ?? '');
  let config; try { if (input.configValue === undefined) configPath = safeConfigPath(repo, input.config ?? '.ios-release/config.json'); config = parseUniqueJson(input.configValue ?? readFileSync(configPath, 'utf8')); } catch (error) { return result('conflict', [{ code: 'invalid-config', detail: error.message }], { path: configPath }); }
  const app = config?.apps?.[input.app]; if (!object(app)) return result('conflict', [{ code: 'unknown-app', detail: String(input.app) }], { path: configPath }); const policy = app.releaseNotes;
  const target = createReleasePolicyBoundary(repo).resolveNote(input.app, policy, version); if (!target.ok) return result('conflict', target.reasons, { path: null }); const { archivePath, archiveRelative } = target.value;
  let markdown; try { markdown = readFileSync(archivePath, 'utf8'); } catch (error) { if (error.code === 'ENOENT') return result('missing', [{ code: 'missing-archive', detail: archiveRelative }], { path: archivePath }); return result('conflict', [{ code: 'archive-unreadable', detail: error.message }], { path: archivePath }); }
  const parsed = parseReleaseNote(markdown, archiveRelative); reasons.push(...parsed.errors.map((detail) => ({ code: 'malformed-note', detail }))); const frontmatter = parsed.frontmatter;
  if (!object(frontmatter)) return result('conflict', reasons, { path: archivePath, parsed }); if (frontmatter.app !== input.app) addReason(reasons, 'wrong-app', `${frontmatter.app ?? '<missing>'} != ${input.app}`); if (frontmatter.marketingVersion !== version) addReason(reasons, 'wrong-version', `${frontmatter.marketingVersion ?? '<missing>'} != ${version}`); validateGitEvidence(repo, sourceCommit, frontmatter, archiveRelative, markdown, reasons);
  const expected = target.value.locales; const actual = Array.isArray(frontmatter.locales) ? frontmatter.locales : []; if (frontmatter.sourceLocale !== target.value.sourceLocale) addReason(reasons, 'source-locale-mismatch', `${frontmatter.sourceLocale ?? '<missing>'} != ${target.value.sourceLocale}`); if (new Set(actual).size !== actual.length) addReason(reasons, 'duplicate-locale'); if (JSON.stringify(actual) !== JSON.stringify(expected)) addReason(reasons, 'locale-coverage-mismatch', `${JSON.stringify(actual)} != ${JSON.stringify(expected)}`); const appStoreLocales = Object.keys(parsed.appStore); if (JSON.stringify(appStoreLocales) !== JSON.stringify(expected)) addReason(reasons, 'app-store-section-locale-mismatch', `${JSON.stringify(appStoreLocales)} != ${JSON.stringify(expected)}`); for (const locale of expected) { const text = parsed.appStore[locale]; if (typeof text !== 'string' || text.trim().length === 0) addReason(reasons, 'missing-locale', locale); else if (text.length > 4000) addReason(reasons, 'over-limit', `${locale} is ${text.length} characters`); } const testFlightLocales = Object.keys(parsed.testFlight); if (parsed.sectionPresence.testFlight && (!testFlightLocales.length || testFlightLocales.some((locale) => !expected.includes(locale)))) addReason(reasons, 'testflight-section-locale-mismatch', `${JSON.stringify(testFlightLocales)} is not a nonempty subset of ${JSON.stringify(expected)}`); for (const locale of testFlightLocales) if (!parsed.testFlight[locale]) addReason(reasons, 'empty-testflight-text', locale); const promoLocales = Object.keys(parsed.promotionalText); if (target.value.promotionalText === 'preserve' && parsed.sectionPresence.promotionalText) addReason(reasons, 'promotional-text-forbidden-by-policy'); if (target.value.promotionalText === 'suggest' && parsed.sectionPresence.promotionalText && JSON.stringify(promoLocales) !== JSON.stringify(expected)) addReason(reasons, 'promotional-text-locale-mismatch', `${JSON.stringify(promoLocales)} != ${JSON.stringify(expected)}`); for (const locale of promoLocales) { const text = parsed.promotionalText[locale]; if (!text) addReason(reasons, 'empty-promotional-text', locale); else if (text.length > 170) addReason(reasons, 'promotional-text-over-limit', `${locale} is ${text.length} characters`); }
  if (reasons.length) return result('conflict', reasons, { path: archivePath, parsed }); return result('valid', [], { path: archivePath, archiveRelative, parsed });
}

export function renderReleaseNote(note) { const frontmatter = { schemaVersion: 2, app: note.app, marketingVersion: note.marketingVersion, sourceCommit: note.sourceCommit, sourceRange: note.sourceRange, sourceLocale: note.sourceLocale, locales: note.locales }; const lines = ['---', JSON.stringify(frontmatter, null, 2), '---', '', "## App Store What's New", '']; for (const locale of note.locales) lines.push(`### ${locale}`, '', String(note.appStore?.[locale] ?? '').trim(), ''); if (note.testflight && Object.keys(note.testflight).length) { lines.push('## TestFlight What to Test', ''); for (const locale of note.locales) if (note.testflight[locale]) lines.push(`### ${locale}`, '', String(note.testflight[locale]).trim(), ''); } if (note.promotionalText && Object.keys(note.promotionalText).length) { lines.push('## Promotional Text', ''); for (const locale of note.locales) lines.push(`### ${locale}`, '', String(note.promotionalText[locale] ?? '').trim(), ''); } lines.push('## Evidence', '', `Used: ${note.usedChanges ?? 'None'}`, `Skipped: ${note.skippedChanges ?? 'None'}`, ''); return lines.join('\n'); }
function parseArgs(argv) { const [command, ...rest] = argv; if (command !== 'check') throw new Error('Usage: release-notes.mjs check --repo PATH --app KEY --version VERSION --source-commit SHA [--config PATH]'); const options = {}; for (let index = 0; index < rest.length; index += 1) { const flag = rest[index]; const value = rest[index + 1]; if (flag.startsWith('--') && value && !value.startsWith('--')) { options[flag.slice(2).replaceAll('-', '_')] = value; index += 1; } else throw new Error(`Unknown or incomplete option: ${flag}`); } for (const required of ['repo', 'app', 'version', 'source_commit']) if (!options[required]) throw new Error(`Missing --${required.replaceAll('_', '-')}`); return options; }
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) { try { const options = parseArgs(process.argv.slice(2)); const checked = checkReleaseNote({ repo: options.repo, app: options.app, version: options.version, sourceCommit: options.source_commit, config: options.config }); process.stdout.write(`${JSON.stringify(checked, null, 2)}\n`); if (checked.status !== 'valid') process.exitCode = 1; } catch (error) { process.stdout.write(`${JSON.stringify({ status: 'conflict', state: 'conflict', valid: false, errors: [error.message] }, null, 2)}\n`); process.exitCode = 1; } }
