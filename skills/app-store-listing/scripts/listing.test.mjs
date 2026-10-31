import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(here, 'listing.mjs');
const fx = name => path.join(here, 'fixtures', name);
const REQUEST = '11111111-2222-3333-4444-555555555555';

function run(args, env = {}) {
  const r = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', env: { ...process.env, ...env } });
  let json = null;
  try { json = JSON.parse(r.stdout); } catch { /* error paths print nothing */ }
  return { code: r.status, stdout: r.stdout, stderr: r.stderr, json };
}

function scratch(t) {
  const dir = mkdtempSync(path.join(tmpdir(), 'listing-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function snapshot(t, which) {
  const windows = { before: ['2026-01-05', '2026-01-11', 'engagement-before.tsv', 'downloads-before.tsv'], after: ['2026-01-12', '2026-01-18', 'engagement-after.csv', 'downloads-after.csv.gz'] };
  const [start, end, engagement, downloads] = windows[which];
  const out = path.join(scratch(t), `${which}.json`);
  const r = run(['snapshot', '--engagement', fx(engagement), '--downloads', fx(downloads), '--start', start, '--end', end, '--app-id', '111', '--out', out]);
  assert.equal(r.code, 0, r.stderr);
  return out;
}

test('snapshot sums only in-window rows, counts only Product page views, and reads tab, comma and gzip input', () => {
  const r = run(['snapshot', '--engagement', fx('engagement-before.tsv'), '--downloads', fx('downloads-before.tsv'), '--start', '2026-01-05', '--end', '2026-01-11', '--app-id', '111']);
  assert.equal(r.code, 0, r.stderr);
  const search = r.json.segments['App Store search|US'];
  assert.equal(search.impressions, 10000);
  assert.equal(search.productPageViews, 2000);
  assert.equal(search.firstDownloads, 500);
  assert.equal(search.redownloads, 80);
  assert.equal(search.viewRate, 0.2);
  assert.equal(search.downloadRate, 0.25);
  assert.equal(search.conversionRate, 0.05);
  assert.equal(r.json.total.impressions, 10350);
  assert.deepEqual(r.json.window, { start: '2026-01-05', end: '2026-01-11' });
  assert.ok('App Store search|*' in r.json.segments && '*|US' in r.json.segments);

  const after = run(['snapshot', '--engagement', fx('engagement-after.csv'), '--downloads', fx('downloads-after.csv.gz'), '--start', '2026-01-12', '--end', '2026-01-18', '--app-id', '111']);
  assert.equal(after.code, 0, after.stderr);
  assert.equal(after.json.segments['App Store search|US'].productPageViews, 1000);
  assert.equal(after.json.segments['App Store search|US'].redownloads, 84);
});

test('a rate with a zero denominator is null, never zero', () => {
  const r = run(['snapshot', '--engagement', fx('engagement-before.tsv'), '--downloads', fx('downloads-before.tsv'), '--start', '2026-01-05', '--end', '2026-01-11', '--app-id', '111']);
  const de = r.json.segments['App referrer|DE'];
  assert.equal(de.firstDownloads, 6);
  assert.equal(de.viewRate, null);
  assert.equal(de.downloadRate, null);
  assert.equal(de.conversionRate, null);
});

test('a missing required column fails loudly with the column name', () => {
  const r = run(['snapshot', '--engagement', fx('engagement-missing-column.csv'), '--downloads', fx('downloads-before.tsv'), '--start', '2026-01-05', '--end', '2026-01-11', '--app-id', '111']);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /missing required column.*source type/i);
  assert.equal(r.stdout, '');
});

test('compare flags a significant drop with the listing fields that drive the metric, and skips small segments', t => {
  const r = run(['compare', '--before', snapshot(t, 'before'), '--after', snapshot(t, 'after')]);
  assert.equal(r.code, 3);
  assert.equal(r.json.quiet, false);

  const viewDrop = r.json.findings.find(f => f.segment === 'App Store search|US' && f.metric === 'viewRate');
  assert.ok(viewDrop);
  assert.equal(viewDrop.direction, 'down');
  assert.equal(viewDrop.before, 0.2);
  assert.equal(viewDrop.after, 0.1);
  assert.ok(viewDrop.fields.includes('icon') && viewDrop.fields.includes('first screenshots'));
  assert.ok(!viewDrop.fields.includes('keywords'));

  assert.ok(!r.json.findings.some(f => f.metric === 'downloadRate' && f.segment === 'App Store search|US'), 'unchanged rate stays quiet');
  assert.ok(!r.json.findings.some(f => f.segment === 'App Store browse|US'), 'tiny change in a small segment is noise');
  assert.ok(r.json.skipped.some(s => s.segment === 'Web referrer|GB' && /below 200/.test(s.reason)));

  const sizes = r.json.findings.map(f => Math.abs(f.significance));
  assert.deepEqual(sizes, [...sizes].sort((a, b) => b - a));
});

test('compare exits 0 and reports quiet when nothing differs', t => {
  const same = snapshot(t, 'before');
  const r = run(['compare', '--before', same, '--after', same]);
  assert.equal(r.code, 0);
  assert.equal(r.json.quiet, true);
  assert.deepEqual(r.json.findings, []);
});

test('compare with a stricter z threshold suppresses weaker findings', t => {
  const loose = run(['compare', '--before', snapshot(t, 'before'), '--after', snapshot(t, 'after'), '--z', '2']);
  const strict = run(['compare', '--before', snapshot(t, 'before'), '--after', snapshot(t, 'after'), '--z', '1000']);
  assert.ok(loose.json.findings.length > 0);
  assert.equal(strict.code, 0);
});

function fakeAsc(t, { includeInstances = true, files = { s1: fx('engagement-before.tsv'), s2: fx('engagement-after.csv'), s3: fx('downloads-before.tsv'), s4: fx('downloads-after.csv.gz') } } = {}) {
  const dir = scratch(t);
  const log = path.join(dir, 'calls.log');
  const md5 = id => (files[id] ? createHash('md5').update(readFileSync(files[id])).digest('hex') : '0');
  // Mirrors real `asc analytics view --include-segments` output (asc 5.17.1).
  const instance = (id, processingDate, segment) => ({ id, processingDate, granularity: 'DAILY', segments: [{ id: segment, downloadUrl: 'https://example.invalid', checksum: md5(segment), sizeInBytes: 1 }] });
  const view = {
    requestId: REQUEST,
    data: includeInstances ? [
      { id: 'r1', name: 'App Store Discovery and Engagement Standard', category: 'APP_STORE_ENGAGEMENT', instances: [instance('i1', '2026-01-11', 's1'), instance('i2', '2026-01-18', 's2')] },
      { id: 'r5', name: 'App Store Discovery and Engagement Detailed', category: 'APP_STORE_ENGAGEMENT', instances: [instance('i5', '2026-01-18', 's5')] },
      { id: 'r2', name: 'App Downloads Standard', category: 'COMMERCE', instances: [instance('i3', '2026-01-11', 's3'), instance('i4', '2026-01-18', 's4')] },
      { id: 'r3', name: 'App Sessions Standard', category: 'APP_USAGE', instances: [instance('i9', '2026-01-18', 's9')] },
      { id: 'r4', name: 'AirPlay Discovery Sessions', category: 'FRAMEWORK_USAGE' },
    ] : [],
    links: {},
  };
  const bin = path.join(dir, 'asc');
  writeFileSync(bin, `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify(args) + '\\n');
const flag = name => args[args.indexOf(name) + 1];
if (args.includes('view')) { process.stdout.write(${JSON.stringify(JSON.stringify(view))}); process.exit(0); }
if (args.includes('download')) {
  const src = ${JSON.stringify(files)}[flag('--segment-id')];
  if (!src) { process.stderr.write('unknown segment'); process.exit(2); }
  fs.copyFileSync(src, flag('--output'));
  process.stdout.write('{}');
  process.exit(0);
}
process.exit(9);
`);
  chmodSync(bin, 0o755);
  const calls = () => (existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) : []);
  return { bin, calls, dir };
}

test('fetch downloads only the two standard reports, writes a manifest, and a rerun downloads nothing', t => {
  const asc = fakeAsc(t);
  const dest = path.join(scratch(t), 'raw');
  const args = ['fetch', '--app-id', '111', '--profile', 'demo', '--request-id', REQUEST, '--granularity', 'DAILY', '--since', '2026-01-01', '--dest', dest];

  const first = run(args, { ASC_BIN: asc.bin });
  assert.equal(first.code, 0, first.stderr);
  assert.equal(first.json.downloaded.length, 4);
  const downloadsAfterFirst = asc.calls().filter(c => c.includes('download')).length;
  assert.equal(downloadsAfterFirst, 4, 'the unrelated report is never downloaded');
  assert.ok(asc.calls().every(c => c.includes('--read-only') && c.includes('demo')));

  const manifest = JSON.parse(readFileSync(path.join(dest, 'manifest.json'), 'utf8'));
  assert.equal(manifest.files.length, 4);
  assert.deepEqual(manifest.files.map(f => f.kind).sort(), ['downloads', 'downloads', 'engagement', 'engagement']);
  assert.ok(manifest.files.every(f => f.granularity === 'DAILY' && /^\d{4}-\d{2}-\d{2}$/.test(f.processingDate) && f.report));

  const second = run(args, { ASC_BIN: asc.bin });
  assert.equal(second.code, 0, second.stderr);
  assert.deepEqual(second.json.downloaded, []);
  assert.equal(second.json.alreadyPresent.length, 4);
  assert.equal(asc.calls().filter(c => c.includes('download')).length, downloadsAfterFirst, 'rerun made no download calls');
});

test('fetch skips instances processed before --since', t => {
  const asc = fakeAsc(t);
  const dest = path.join(scratch(t), 'raw');
  const r = run(['fetch', '--profile', 'demo', '--request-id', REQUEST, '--granularity', 'DAILY', '--since', '2026-01-15', '--dest', dest], { ASC_BIN: asc.bin });
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.json.downloaded.length, 2);
});

test('fetch refuses without a request id and never calls asc', t => {
  const asc = fakeAsc(t);
  const r = run(['fetch', '--profile', 'demo', '--granularity', 'DAILY', '--dest', path.join(scratch(t), 'raw')], { ASC_BIN: asc.bin });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /ONGOING/);
  assert.deepEqual(asc.calls(), []);
});

test('fetch exits 1 with guidance when the request has no matching reports', t => {
  const asc = fakeAsc(t, { includeInstances: false });
  const r = run(['fetch', '--profile', 'demo', '--request-id', REQUEST, '--granularity', 'DAILY', '--dest', path.join(scratch(t), 'raw')], { ASC_BIN: asc.bin });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /No "App Store Discovery and Engagement Standard"/);
});

// Fourteen days, 2026-01-05..18. Week two halves search page views and product page downloads.
function dailyFiles(t) {
  const dir = scratch(t);
  const days = Array.from({ length: 14 }, (_, i) => `2026-01-${String(5 + i).padStart(2, '0')}`);
  const engagement = ['Date\tEvent\tPage Type\tSource Type\tTerritory\tCounts', ...days.flatMap((d, i) => [
    `${d}\tImpression\tNo page\tApp Store search\tUS\t1000`,
    `${d}\tPage view\tProduct page\tApp Store search\tUS\t${i < 7 ? 200 : 100}`,
  ])];
  const downloads = ['Date\tDownload Type\tPage Type\tSource Type\tTerritory\tCounts', ...days.flatMap((d, i) => [
    `${d}\tFirst-time download\tProduct page\tApp Store search\tUS\t${i < 7 ? 50 : 25}`,
    `${d}\tFirst-time download\tNo page\tApp Store search\tUS\t40`,
  ])];
  const files = { s1: path.join(dir, 'e1.tsv'), s2: path.join(dir, 'e2.tsv'), s3: path.join(dir, 'd1.tsv'), s4: path.join(dir, 'd2.tsv') };
  writeFileSync(files.s1, [engagement[0], ...engagement.slice(1, 15)].join('\n'));
  writeFileSync(files.s2, [engagement[0], ...engagement.slice(15)].join('\n'));
  writeFileSync(files.s3, [downloads[0], ...downloads.slice(1, 15)].join('\n'));
  writeFileSync(files.s4, [downloads[0], ...downloads.slice(15)].join('\n'));
  return files;
}

test('monitor compares the last complete week with the baseline, saves a report, and exits 3 on a drop', t => {
  const asc = fakeAsc(t, { files: dailyFiles(t) });
  const state = path.join(scratch(t), 'state');
  const r = run(['monitor', '--app-id', '111', '--profile', 'demo', '--request-id', REQUEST, '--state-dir', state, '--weeks', '1', '--today', '2026-01-19'], { ASC_BIN: asc.bin });
  assert.equal(r.code, 3, r.stderr);
  assert.deepEqual(r.json.after, { start: '2026-01-12', end: '2026-01-18' });
  assert.deepEqual(r.json.before, { start: '2026-01-05', end: '2026-01-11' });
  assert.ok(r.json.findings.some(f => f.segment === 'App Store search|US' && f.metric === 'viewRate' && f.direction === 'down'));
  assert.ok(!r.json.findings.some(f => f.metric === 'impressions'), 'steady impressions stay quiet');
  const saved = JSON.parse(readFileSync(path.join(state, 'reports', '2026-01-18.json'), 'utf8'));
  assert.equal(saved.findings.length, r.json.findings.length);
});

test('monitor scales a baseline with fewer days of data instead of reporting a false drop or rise', t => {
  const asc = fakeAsc(t, { files: dailyFiles(t) });
  const r = run(['monitor', '--app-id', '111', '--profile', 'demo', '--request-id', REQUEST, '--state-dir', path.join(scratch(t), 'state'), '--weeks', '4', '--today', '2026-01-19'], { ASC_BIN: asc.bin });
  assert.equal(r.code, 3, r.stderr);
  assert.equal(r.json.beforeScale, 1);
  assert.ok(!r.json.findings.some(f => f.metric === 'impressions'));
  assert.ok(r.json.warnings.some(w => /7 of 28 days/.test(w)));
});

test('monitor refuses a week that is not complete yet', t => {
  const files = dailyFiles(t);
  writeFileSync(files.s4, readFileSync(files.s4, 'utf8').split('\n').filter(l => !/^2026-01-1[78]/.test(l)).join('\n'));
  writeFileSync(files.s2, readFileSync(files.s2, 'utf8').split('\n').filter(l => !/^2026-01-1[78]/.test(l)).join('\n'));
  const asc = fakeAsc(t, { files });
  const r = run(['monitor', '--app-id', '111', '--profile', 'demo', '--request-id', REQUEST, '--state-dir', path.join(scratch(t), 'state'), '--weeks', '1', '--today', '2026-01-19'], { ASC_BIN: asc.bin });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /Only 5 of 7 days/);
});

test('download rate counts only product page downloads, so search-result downloads cannot break it', t => {
  const files = dailyFiles(t);
  const r = run(['snapshot', '--engagement', files.s1, '--downloads', files.s3, '--start', '2026-01-05', '--end', '2026-01-11', '--app-id', '111']);
  assert.equal(r.code, 0, r.stderr);
  const us = r.json.segments['App Store search|US'];
  assert.equal(us.firstDownloads, 630);
  assert.equal(us.productPageDownloads, 350);
  assert.equal(us.downloadRate, 0.25);
  assert.equal(us.conversionRate, 0.09);
});

test('compare skips a rate whose numerator exceeds its denominator instead of reporting it quiet', t => {
  const dir = scratch(t);
  const snap = (views, pageDownloads) => {
    const m = { impressions: 10000, productPageViews: views, firstDownloads: 3000, productPageDownloads: pageDownloads, redownloads: 0 };
    return { schemaVersion: 2, appId: '111', window: { start: '2026-01-05', end: '2026-01-11' }, segments: {}, total: m, coverage: { days: 7, expected: 7 } };
  };
  writeFileSync(path.join(dir, 'b.json'), JSON.stringify(snap(1000, 3000)));
  writeFileSync(path.join(dir, 'a.json'), JSON.stringify(snap(1000, 1500)));
  const r = run(['compare', '--before', path.join(dir, 'b.json'), '--after', path.join(dir, 'a.json')]);
  assert.ok(r.json.skipped.some(s => s.segment === 'total' && /downloadRate: productPageDownloads exceeds productPageViews/.test(s.reason)));
});

test('a date split across segment files of one instance counts every segment', t => {
  const dir = scratch(t);
  const header = 'Date\tEvent\tPage Type\tSource Type\tTerritory\tCounts';
  const us = path.join(dir, 'us.tsv');
  const jp = path.join(dir, 'jp.tsv');
  writeFileSync(us, `${header}\n2026-01-05\tImpression\tNo page\tApp Store search\tUS\t1000`);
  writeFileSync(jp, `${header}\n2026-01-05\tImpression\tNo page\tApp Store search\tJP\t500`);
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import { buildSnapshot } from ${JSON.stringify(script)};
    const s = buildSnapshot({ engagement: [{ file: ${JSON.stringify(us)}, instance: 'i1' }, { file: ${JSON.stringify(jp)}, instance: 'i1' }], downloads: [${JSON.stringify(fx('downloads-before.tsv'))}], appId: '111', start: '2026-01-05', end: '2026-01-05' });
    process.stdout.write(String(s.total.impressions));
  `], { encoding: 'utf8' });
  assert.equal(r.stdout, '1500', r.stderr);
});

test('fetch downloads a damaged earlier file again', t => {
  const asc = fakeAsc(t);
  const dest = path.join(scratch(t), 'raw');
  const args = ['fetch', '--profile', 'demo', '--request-id', REQUEST, '--granularity', 'DAILY', '--dest', dest];
  assert.equal(run(args, { ASC_BIN: asc.bin }).code, 0);
  const manifest = JSON.parse(readFileSync(path.join(dest, 'manifest.json'), 'utf8'));
  writeFileSync(path.join(dest, manifest.files[0].file), 'truncated');
  const again = run(args, { ASC_BIN: asc.bin });
  assert.equal(again.code, 0, again.stderr);
  assert.deepEqual(again.json.downloaded, [manifest.files[0].file]);
});

test('unknown flags and commands are rejected', () => {
  assert.equal(run(['bogus']).code, 1);
  const r = run(['compare', '--before', 'a.json', '--after', 'b.json', '--nope', '1']);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /Unknown flag/);
});

test('the CLI runs when invoked through a symlink, as installed skills are', t => {
  const link = path.join(scratch(t), 'listing.mjs');
  symlinkSync(script, link);
  const r = spawnSync(process.execPath, [link, 'compare', '--before', snapshot(t, 'before'), '--after', snapshot(t, 'before')], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).quiet, true);
});

test('a date delivered in several files is counted once, from the last file given', t => {
  const dir = scratch(t);
  const header = 'Date\tEvent\tPage Type\tSource Type\tTerritory\tCounts';
  const day = (date, n) => `${date}\tImpression\tNo page\tApp Store search\tUS\t${n}`;
  const older = path.join(dir, 'older.tsv');
  const newer = path.join(dir, 'newer.tsv');
  writeFileSync(older, [header, day('2026-01-05', 100), day('2026-01-06', 100)].join('\n'));
  writeFileSync(newer, [header, day('2026-01-06', 120), day('2026-01-07', 100)].join('\n'));
  const r = run(['snapshot', '--engagement', older, newer, '--downloads', fx('downloads-before.tsv'), '--start', '2026-01-05', '--end', '2026-01-07', '--app-id', '111']);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.json.total.impressions, 320);
  assert.deepEqual(r.json.coverage, { days: 3, expected: 3 });
});
