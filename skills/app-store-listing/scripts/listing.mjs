#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

// Data shape.
//   Metrics  = { impressions, productPageViews, firstDownloads, redownloads, viewRate, downloadRate, conversionRate }
//   Snapshot = { schemaVersion: 1, appId, window: { start, end }, segments: { "<sourceType>|<territory>": Metrics }, total: Metrics, coverage }
//   Finding  = { segment, metric, before, after, change, significance, test, direction, fields }
// Segment keys use "*" as the wildcard: "<source>|*" groups by source only, "*|<territory>" by territory only.

const fail = message => { throw new Error(message); };
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// One table drives which listing fields to inspect for each funnel metric.
export const FUNNEL = Object.freeze({
  impressions: ['name', 'subtitle', 'keywords'],
  viewRate: ['icon', 'name', 'subtitle', 'first screenshots', 'search result creative'],
  downloadRate: ['product page header', 'screenshots', 'app previews', 'promotional text', 'description', 'ratings'],
  conversionRate: [...new Set([
    'name', 'subtitle', 'keywords', 'icon', 'first screenshots', 'search result creative',
    'product page header', 'screenshots', 'app previews', 'promotional text', 'description', 'ratings',
  ])],
});

// Numerator, denominator and test kind per metric. Counts compare the metric against itself.
const TESTS = Object.freeze({
  impressions: { kind: 'count', value: 'impressions' },
  viewRate: { kind: 'proportion', num: 'productPageViews', den: 'impressions' },
  downloadRate: { kind: 'proportion', num: 'firstDownloads', den: 'productPageViews' },
  conversionRate: { kind: 'proportion', num: 'firstDownloads', den: 'impressions' },
});

// ---------- CSV ----------

const normalizeHeader = value => value.replace(/^﻿/, '').trim().toLowerCase().replace(/[\s_]+/g, ' ');

function splitLine(line, delimiter) {
  const cells = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === delimiter) { cells.push(cell); cell = ''; }
    else cell += ch;
  }
  cells.push(cell);
  return cells;
}

export function readTable(file) {
  let bytes = readFileSync(file);
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) bytes = gunzipSync(bytes);
  const lines = bytes.toString('utf8').split(/\r?\n/).filter(line => line.trim() !== '');
  if (!lines.length) fail(`${file}: empty file`);
  const tabs = (lines[0].match(/\t/g) ?? []).length;
  const commas = (lines[0].match(/,/g) ?? []).length;
  const delimiter = tabs >= commas && tabs > 0 ? '\t' : ',';
  const header = splitLine(lines[0], delimiter).map(normalizeHeader);
  return { file, header, rows: lines.slice(1).map(line => splitLine(line, delimiter)) };
}

function columns(table, names) {
  const index = {};
  for (const name of names) {
    index[name] = table.header.indexOf(name);
  }
  const missing = names.filter(name => index[name] < 0);
  if (missing.length) fail(`${table.file}: missing required column(s): ${missing.join(', ')}. Found: ${table.header.join(', ')}`);
  return index;
}

const emptyCounts = () => ({ impressions: 0, productPageViews: 0, firstDownloads: 0, redownloads: 0 });

function parseCount(raw, table, line) {
  const text = (raw ?? '').trim();
  if (text === '') return 0;
  const value = Number(text.replace(/,/g, ''));
  if (!Number.isFinite(value) || value < 0) fail(`${table.file}:${line}: invalid Counts value "${raw}"`);
  return value;
}

function isoDate(raw, table, line) {
  const text = (raw ?? '').trim().slice(0, 10);
  if (!ISO_DATE.test(text)) fail(`${table.file}:${line}: invalid Date "${raw}"`);
  return text;
}

const slug = value => (value ?? '').trim();

// ---------- Snapshot ----------

function metricsFrom(c, divisor = 1) {
  const m = {
    impressions: c.impressions / divisor,
    productPageViews: c.productPageViews / divisor,
    firstDownloads: c.firstDownloads / divisor,
    redownloads: c.redownloads / divisor,
  };
  const ratio = (a, b) => (b > 0 ? a / b : null);
  m.viewRate = ratio(c.productPageViews, c.impressions);
  m.downloadRate = ratio(c.firstDownloads, c.productPageViews);
  m.conversionRate = ratio(c.firstDownloads, c.impressions);
  return m;
}

function inWindow(date, start, end) { return date >= start && date <= end; }

export function daysBetween(start, end) {
  const days = [];
  for (let t = Date.parse(`${start}T00:00:00Z`); t <= Date.parse(`${end}T00:00:00Z`); t += 86400000) days.push(new Date(t).toISOString().slice(0, 10));
  return days;
}

export function buildSnapshot({ engagement, downloads, appId, start, end, divisor = 1 }) {
  if (!ISO_DATE.test(start ?? '') || !ISO_DATE.test(end ?? '')) fail('--start and --end must be YYYY-MM-DD');
  if (start > end) fail('--start must not be after --end');
  if (!appId) fail('--app-id is required');
  if (!engagement.length) fail('At least one --engagement file is required');
  if (!downloads.length) fail('At least one --downloads file is required');

  const groups = new Map();
  const dates = new Set();
  const add = (source, territory, field, count) => {
    for (const key of [`${source}|${territory}`, `${source}|*`, `*|${territory}`, 'total']) {
      if (!groups.has(key)) groups.set(key, emptyCounts());
      groups.get(key)[field] += count;
    }
  };
  // Apple lists the app id per row; skip rows for other apps when the column is present.
  const sameApp = (cells, idx) => idx < 0 || String(cells[idx] ?? '').trim() === '' || String(cells[idx]).trim() === String(appId);

  // Apple re-delivers each date in several consecutive daily instances. Count each date once per
  // report, from the last file that contains it; callers pass files oldest-processed first.
  const latestRows = (files, required) => {
    const tables = files.map(file => {
      const table = readTable(file);
      const c = columns(table, required);
      const appCol = table.header.indexOf('app apple identifier');
      const rows = table.rows.map((cells, n) => ({ cells, line: n + 2, date: isoDate(cells[c.date], table, n + 2) }));
      return { table, c, rows: rows.filter(r => inWindow(r.date, start, end) && sameApp(r.cells, appCol)) };
    });
    const owner = new Map();
    tables.forEach((t, i) => t.rows.forEach(r => owner.set(r.date, i)));
    return tables.flatMap((t, i) => t.rows.filter(r => owner.get(r.date) === i).map(r => ({ ...r, table: t.table, c: t.c })));
  };

  for (const { cells, line, date, table, c } of latestRows(engagement, ['date', 'event', 'page type', 'source type', 'territory', 'counts'])) {
    const event = slug(cells[c.event]).toLowerCase();
    const count = parseCount(cells[c.counts], table, line);
    dates.add(date);
    let field = null;
    if (event === 'impression') field = 'impressions';
    else if (event === 'page view' && slug(cells[c['page type']]).toLowerCase() === 'product page') field = 'productPageViews';
    if (field) add(slug(cells[c['source type']]), slug(cells[c.territory]), field, count);
  }

  for (const { cells, line, date, table, c } of latestRows(downloads, ['date', 'download type', 'source type', 'territory', 'counts'])) {
    const type = slug(cells[c['download type']]).toLowerCase().replace(/[\s_]+/g, '-');
    const count = parseCount(cells[c.counts], table, line);
    dates.add(date);
    const field = type === 'first-time-download' ? 'firstDownloads' : type === 'redownload' ? 'redownloads' : null;
    if (field) add(slug(cells[c['source type']]), slug(cells[c.territory]), field, count);
  }

  const segments = {};
  for (const key of [...groups.keys()].filter(k => k !== 'total').sort()) segments[key] = metricsFrom(groups.get(key), divisor);
  return {
    schemaVersion: 1,
    appId: String(appId),
    window: { start, end },
    segments,
    total: metricsFrom(groups.get('total') ?? emptyCounts(), divisor),
    coverage: { days: dates.size, expected: daysBetween(start, end).length },
  };
}

// ---------- Compare ----------

const round = (value, places = 4) => (value === null ? null : Number(value.toFixed(places)));

function evaluate(metric, before, after, minEvents) {
  const t = TESTS[metric];
  if (t.kind === 'count') {
    const a = before[t.value], b = after[t.value];
    const z = a + b > 0 ? (b - a) / Math.sqrt(a + b) : 0;
    return { before: a, after: b, z, test: 'count' };
  }
  const n1 = before[t.den], n2 = after[t.den];
  if (n1 < minEvents || n2 < minEvents) return { skip: `${t.den} below ${minEvents} (before=${round(n1, 1)}, after=${round(n2, 1)})` };
  const x1 = before[t.num], x2 = after[t.num];
  const p1 = x1 / n1, p2 = x2 / n2;
  const pooled = (x1 + x2) / (n1 + n2);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / n1 + 1 / n2));
  return { before: p1, after: p2, z: se > 0 ? (p2 - p1) / se : 0, test: 'two-proportion' };
}

export function compareSnapshots(before, after, { minEvents = 200, z = 2 } = {}) {
  for (const [name, s] of [['before', before], ['after', after]]) {
    if (s?.schemaVersion !== 1 || !s.segments || !s.total) fail(`${name} is not a schemaVersion 1 snapshot`);
  }
  if (String(before.appId) !== String(after.appId)) fail(`Snapshots are for different apps (${before.appId} vs ${after.appId})`);

  const findings = [];
  const skipped = [];
  const warnings = [];
  for (const [name, s] of [['before', before], ['after', after]]) {
    if (s.coverage && s.coverage.days < s.coverage.expected) warnings.push(`${name} window has data for ${s.coverage.days} of ${s.coverage.expected} days`);
  }
  const keys = new Set([...Object.keys(before.segments), ...Object.keys(after.segments)]);
  const entries = [['total', before.total, after.total]];
  for (const key of [...keys].sort()) entries.push([key, before.segments[key], after.segments[key]]);

  for (const [segment, b, a] of entries) {
    if (!b || !a) { skipped.push({ segment, reason: `present only in the ${b ? 'before' : 'after'} snapshot` }); continue; }
    if (b.impressions < minEvents || a.impressions < minEvents) {
      skipped.push({ segment, reason: `impressions below ${minEvents} (before=${round(b.impressions, 1)}, after=${round(a.impressions, 1)})` });
      continue;
    }
    for (const metric of Object.keys(FUNNEL)) {
      const r = evaluate(metric, b, a, minEvents);
      if (r.skip) { skipped.push({ segment, reason: `${metric}: ${r.skip}` }); continue; }
      if (Math.abs(r.z) < z) continue;
      findings.push({
        segment,
        metric,
        before: round(r.before, 6),
        after: round(r.after, 6),
        change: r.before > 0 ? round((r.after - r.before) / r.before, 4) : null,
        significance: round(r.z, 3),
        test: r.test,
        direction: r.after < r.before ? 'down' : 'up',
        fields: FUNNEL[metric],
      });
    }
  }
  findings.sort((x, y) => Math.abs(y.significance) - Math.abs(x.significance));
  return { appId: String(after.appId), before: before.window, after: after.window, findings, skipped, warnings, quiet: findings.length === 0 };
}

// ---------- Fetch (read-only against asc) ----------

function ascRun(args, { profile }) {
  const bin = process.env.ASC_BIN || 'asc';
  // --read-only makes asc itself refuse any write, so this script can never create an analytics request.
  const result = spawnSync(bin, ['--profile', profile, '--read-only', ...args], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (result.error) fail(`Could not run ${bin}: ${result.error.message}`);
  if (result.status !== 0) fail(`asc ${args.slice(0, 2).join(' ')} failed (exit ${result.status}): ${(result.stderr || result.stdout).trim()}`);
  return result.stdout;
}

// Exact names asc returns for the two standard reports this script reads.
const REPORTS = Object.freeze({
  'App Store Discovery and Engagement Standard': 'engagement',
  'App Downloads Standard': 'downloads',
});

// `asc analytics view --include-segments` prints { data: [{ name, instances: [{ id, granularity, processingDate, segments: [{ id }] }] }] }.
export function extractSegments(view) {
  const out = [];
  for (const report of view?.data ?? []) {
    const kind = REPORTS[report?.name];
    if (!kind) continue;
    for (const instance of report.instances ?? []) {
      for (const segment of instance.segments ?? []) {
        out.push({
          kind,
          report: report.name,
          granularity: instance.granularity ?? null,
          processingDate: instance.processingDate ?? null,
          instanceId: String(instance.id),
          segmentId: String(segment.id),
        });
      }
    }
  }
  return out;
}

const safe = value => String(value).replace(/[^A-Za-z0-9._-]+/g, '-');

export function fetchReports({ appId, profile, requestId, granularity, since, dest }) {
  if (!requestId) fail('--request-id is required. fetch never creates analytics requests: create an ONGOING analytics report request in App Store Connect first, then pass its id.');
  if (!UUID.test(requestId)) fail(`--request-id "${requestId}" is not a valid request id (UUID expected)`);
  if (!profile) fail('--profile is required');
  if (!['DAILY', 'WEEKLY'].includes(granularity)) fail('--granularity must be DAILY or WEEKLY');
  if (since && !ISO_DATE.test(since)) fail('--since must be YYYY-MM-DD');
  if (!dest) fail('--dest is required');

  let view;
  try {
    view = JSON.parse(ascRun(['analytics', 'view', '--request-id', requestId, '--granularity', granularity, '--include-segments', '--paginate'], { profile }));
  } catch (error) {
    fail(`Could not read analytics request ${requestId}: ${error.message}. Create an ONGOING analytics report request in App Store Connect if none exists, then pass its id.`);
  }
  const segments = extractSegments(view).filter(s => (!s.granularity || s.granularity === granularity) && (!since || !s.processingDate || s.processingDate >= since));
  if (!segments.length) fail(`No "App Store Discovery and Engagement Standard" or "App Downloads Standard" report segments found for request ${requestId}. Reports can take a day or more to appear after an ONGOING request is created.`);

  mkdirSync(dest, { recursive: true });
  const manifestPath = path.join(dest, 'manifest.json');
  const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : { schemaVersion: 1, appId: String(appId ?? ''), requestId, files: [] };
  const known = new Set(manifest.files.map(f => f.file));
  const downloaded = [];
  const skipped = [];
  for (const s of segments) {
    const file = `${s.kind}_${safe(s.granularity ?? granularity)}_${safe(s.processingDate ?? 'unknown')}_${safe(s.instanceId)}_${safe(s.segmentId)}.csv.gz`;
    const target = path.join(dest, file);
    if (existsSync(target)) {
      if (!known.has(file)) manifest.files.push({ file, report: s.report, kind: s.kind, granularity: s.granularity ?? granularity, processingDate: s.processingDate });
      known.add(file);
      skipped.push(file);
      continue;
    }
    ascRun(['analytics', 'download', '--request-id', requestId, '--instance-id', s.instanceId, '--segment-id', s.segmentId, '--output', target], { profile });
    if (!existsSync(target)) fail(`asc reported success but ${target} was not written`);
    manifest.files.push({ file, report: s.report, kind: s.kind, granularity: s.granularity ?? granularity, processingDate: s.processingDate });
    known.add(file);
    downloaded.push(file);
  }
  manifest.files.sort((a, b) => a.file.localeCompare(b.file));
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return { dest, manifest: manifestPath, downloaded, alreadyPresent: skipped };
}

// ---------- Monitor ----------

const addDays = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

// The most recent Monday-Sunday week that ended before `today`.
export function lastCompleteWeek(today) {
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
  const end = addDays(today, -(dow === 0 ? 7 : dow));
  return { start: addDays(end, -6), end };
}

export function monitor({ appId, profile, requestId, stateDir, weeks = 4, minEvents, z, today }) {
  if (!Number.isInteger(weeks) || weeks < 1) fail('--weeks must be a positive integer');
  const root = stateDir || path.join(homedir(), '.local', 'state', 'app-store-listing', String(appId));
  const raw = path.join(root, 'raw');
  fetchReports({ appId, profile, requestId, granularity: 'DAILY', dest: raw });
  const manifest = JSON.parse(readFileSync(path.join(raw, 'manifest.json'), 'utf8'));
  const pick = kind => manifest.files.filter(f => f.kind === kind && f.granularity === 'DAILY').map(f => path.join(raw, f.file));
  const input = { engagement: pick('engagement'), downloads: pick('downloads'), appId };

  const week = lastCompleteWeek(today ?? new Date().toISOString().slice(0, 10));
  const baseline = { start: addDays(week.start, -7 * weeks), end: addDays(week.start, -1) };
  const after = buildSnapshot({ ...input, ...week });
  if (after.coverage.days === 0) fail(`No data for ${week.start}..${week.end} yet. Apple delivers daily reports within about three days; try again later.`);
  const before = buildSnapshot({ ...input, ...baseline, divisor: weeks });
  if (before.coverage.days === 0) fail(`No baseline data for ${baseline.start}..${baseline.end}. Analytics data only exists from when the ONGOING request was created (or Apple's backfill).`);

  const result = compareSnapshots(before, after, { minEvents, z });
  mkdirSync(path.join(root, 'reports'), { recursive: true });
  const report = path.join(root, 'reports', `${week.end}.json`);
  writeFileSync(report, `${JSON.stringify({ ...result, baselineWeeks: weeks, report }, null, 2)}\n`);
  return { ...result, baselineWeeks: weeks, report };
}

// ---------- CLI ----------

const COMMANDS = {
  snapshot: { multi: ['engagement', 'downloads'], single: ['start', 'end', 'app-id', 'out'], required: ['engagement', 'downloads', 'start', 'end', 'app-id'] },
  compare: { multi: [], single: ['before', 'after', 'min-events', 'z'], required: ['before', 'after'] },
  fetch: { multi: [], single: ['app-id', 'profile', 'request-id', 'granularity', 'since', 'dest'], required: ['profile', 'granularity', 'dest'] },
  monitor: { multi: [], single: ['app-id', 'profile', 'request-id', 'state-dir', 'weeks', 'min-events', 'z', 'today'], required: ['app-id', 'profile'] },
};

export function parseArgs(argv, spec) {
  const flags = {};
  let current = null;
  for (const arg of argv) {
    if (arg.startsWith('--')) {
      current = arg.slice(2);
      if (!spec.multi.includes(current) && !spec.single.includes(current)) fail(`Unknown flag --${current}`);
      if (Object.hasOwn(flags, current)) fail(`Repeated flag --${current}`);
      flags[current] = [];
    } else if (current) flags[current].push(arg);
    else fail(`Unexpected argument: ${arg}`);
  }
  for (const name of Object.keys(flags)) {
    if (!flags[name].length) fail(`--${name} needs a value`);
    if (spec.single.includes(name) && flags[name].length !== 1) fail(`--${name} takes exactly one value`);
  }
  for (const name of spec.required) if (!flags[name]) fail(`--${name} is required`);
  return Object.fromEntries(Object.entries(flags).map(([k, v]) => [k, spec.multi.includes(k) ? v : v[0]]));
}

const number = (value, name) => {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) fail(`--${name} must be a non-negative number`);
  return n;
};
const readSnapshot = file => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch (error) { return fail(`${file}: ${error.message}`); } };
const print = value => process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);

export function main(argv) {
  const [command, ...rest] = argv;
  const spec = COMMANDS[command];
  if (!spec) fail(`Usage: listing.mjs <${Object.keys(COMMANDS).join('|')}> [flags]`);
  const f = parseArgs(rest, spec);
  if (command === 'snapshot') {
    const snap = buildSnapshot({ engagement: f.engagement, downloads: f.downloads, appId: f['app-id'], start: f.start, end: f.end });
    if (f.out) writeFileSync(f.out, `${JSON.stringify(snap, null, 2)}\n`);
    else print(snap);
    return 0;
  }
  if (command === 'compare') {
    const result = compareSnapshots(readSnapshot(f.before), readSnapshot(f.after), { minEvents: number(f['min-events'], 'min-events'), z: number(f.z, 'z') });
    print(result);
    return result.quiet ? 0 : 3;
  }
  if (command === 'fetch') {
    print(fetchReports({ appId: f['app-id'], profile: f.profile, requestId: f['request-id'], granularity: f.granularity, since: f.since, dest: f.dest }));
    return 0;
  }
  const result = monitor({
    appId: f['app-id'], profile: f.profile, requestId: f['request-id'], stateDir: f['state-dir'],
    weeks: f.weeks === undefined ? 4 : Number(f.weeks), minEvents: number(f['min-events'], 'min-events'), z: number(f.z, 'z'), today: f.today,
  });
  print(result);
  return result.quiet ? 0 : 3;
}

// Installed skills are often symlinks, so compare real paths.
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  try { process.exitCode = main(process.argv.slice(2)); }
  catch (error) { process.stderr.write(`error: ${error.message}\n`); process.exitCode = 1; }
}
