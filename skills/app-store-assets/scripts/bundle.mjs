#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseJSON } from './strict-json.mjs';
import { sensitiveAssetPath } from './asset-paths.mjs';

const kinds = new Set(['screenshot', 'app-preview', 'header-image', 'header-video', 'search-image', 'search-video']);
const fail = message => { throw new Error(message); };
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

function shape(value, fields, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`);
  const actual = Object.keys(value);
  if (actual.length !== fields.length || fields.some(key => !Object.hasOwn(value, key))) fail(`${label} has missing or unknown fields`);
}

function nonempty(value, label) {
  if (typeof value !== 'string' || !value.trim()) fail(`${label} must be a nonempty string`);
}

function validatePath(value, media = false) {
  nonempty(value, 'File path');
  if (path.isAbsolute(value) || /^[A-Za-z]:/.test(value) || value.includes('\\') || value.includes('\0')) fail(`Invalid relative file path: ${value}`);
  const parts = value.split('/');
  if (parts.some(part => !part || part === '.' || part === '..')) fail(`Noncanonical file path: ${value}`);
  if (sensitiveAssetPath(value)) fail(`Local-state or credential file path: ${value}`);
  if (media && /(?:\.(?:json|ya?ml|toml|ini|conf|config|plist)|(?:^|\/)(?:config|configuration|package-lock|pnpm-lock|yarn\.lock)(?:\.[^/]*)?)$/i.test(value)) fail(`Configuration cannot be media: ${value}`);
  return value;
}

async function regularFile(filename) {
  const absolute = path.resolve(filename);
  const root = path.parse(absolute).root;
  let current = root;
  const parts = absolute.slice(root.length).split(path.sep);
  for (let index = 0; index < parts.length; index++) {
    current = path.join(current, parts[index]);
    const stat = await lstat(current);
    if (stat.isSymbolicLink()) fail(`Symlink is forbidden: ${current}`);
    if (index === parts.length - 1 ? !stat.isFile() : !stat.isDirectory()) fail(`Expected regular file path: ${filename}`);
  }
  return readFile(absolute);
}

async function snapshot(manifestPath) {
  const manifestBytes = await regularFile(manifestPath);
  const manifest = parseJSON(manifestBytes);
  shape(manifest, ['schemaVersion', 'appKey', 'assets'], 'Manifest');
  if (manifest.schemaVersion !== 1) fail('Unsupported manifest schemaVersion');
  nonempty(manifest.appKey, 'appKey');
  if (!Array.isArray(manifest.assets) || !manifest.assets.length) fail('assets must be a nonempty array');
  const keys = new Set();
  const slots = new Set();
  const files = new Set();
  for (const asset of manifest.assets) {
    shape(asset, ['key', 'kind', 'locale', 'group', 'order', 'file', 'sourceFiles'], 'Asset');
    for (const field of ['key', 'locale', 'group']) nonempty(asset[field], field);
    if (!kinds.has(asset.kind)) fail('Invalid asset kind');
    if (!Number.isSafeInteger(asset.order) || asset.order < 1) fail('order must be a positive integer');
    if (keys.has(asset.key)) fail(`Duplicate asset key: ${asset.key}`);
    keys.add(asset.key);
    const slot = JSON.stringify([asset.kind, asset.locale, asset.group, asset.order]);
    if (slots.has(slot)) fail('Duplicate asset slot');
    slots.add(slot);
    files.add(validatePath(asset.file, true));
    if (!Array.isArray(asset.sourceFiles) || !asset.sourceFiles.length) fail('sourceFiles must be a nonempty array');
    for (const source of asset.sourceFiles) files.add(validatePath(source));
  }
  const result = [];
  for (const relative of [...files].sort()) {
    const bytes = await regularFile(path.resolve(path.dirname(manifestPath), relative));
    result.push({ path: relative, bytes: bytes.length, sha256: sha256(bytes) });
  }
  return { schemaVersion: 1, manifestSha256: sha256(manifestBytes), files: result };
}

function validateSnapshot(value) {
  shape(value, ['schemaVersion', 'manifestSha256', 'files'], 'Snapshot');
  const digest = hash => typeof hash === 'string' && /^[0-9a-f]{64}$/.test(hash);
  if (value.schemaVersion !== 1 || !digest(value.manifestSha256) || !Array.isArray(value.files) || !value.files.length) fail('Malformed snapshot');
  let previous;
  for (const file of value.files) {
    shape(file, ['path', 'bytes', 'sha256'], 'Snapshot file');
    validatePath(file.path);
    if (!Number.isSafeInteger(file.bytes) || file.bytes < 0 || !digest(file.sha256)) fail('Malformed snapshot file');
    if (previous !== undefined && previous >= file.path) fail('Snapshot files must be sorted and unique');
    previous = file.path;
  }
  return { schemaVersion: 1, manifestSha256: value.manifestSha256, files: value.files.map(file => ({ path: file.path, bytes: file.bytes, sha256: file.sha256 })) };
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!['snapshot', 'verify'].includes(command)) fail('Expected snapshot or verify command');
  const options = Object.create(null);
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    if (!['--manifest', '--snapshot'].includes(key) || !args[i + 1] || Object.hasOwn(options, key)) fail('Invalid or duplicate CLI option');
    options[key] = args[i + 1];
  }
  if (!options['--manifest'] || (command === 'verify' ? !options['--snapshot'] : options['--snapshot'])) fail('Invalid command options');
  const computed = await snapshot(path.resolve(options['--manifest']));
  if (command === 'snapshot') return computed;
  const frozen = validateSnapshot(parseJSON(await regularFile(options['--snapshot'])));
  if (JSON.stringify(computed) !== JSON.stringify(frozen)) fail('Bundle identity changed');
  return { ok: true };
}

try {
  process.stdout.write(`${JSON.stringify(await main())}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({ error: error.message })}\n`);
  process.exitCode = 1;
}
