import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const cli = fileURLToPath(new URL('./bundle.mjs', import.meta.url));
const digest = value => createHash('sha256').update(value).digest('hex');

async function fixture(t) {
  const root = await mkdtemp(path.join(await realpath(tmpdir()), 'asset-bundle-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'media'));
  await mkdir(path.join(root, 'sources'));
  await writeFile(path.join(root, 'media/screen.png'), 'image bytes');
  await writeFile(path.join(root, 'sources/screen.svg'), 'source bytes');
  const manifest = { schemaVersion: 1, appKey: 'sample', assets: [{ key: 'screen', kind: 'screenshot', locale: 'en-US', group: 'phone', order: 1, file: 'media/screen.png', sourceFiles: ['sources/screen.svg', 'media/screen.png'] }] };
  const manifestPath = path.join(root, 'manifest.json');
  const frozenPath = path.join(root, 'frozen.json');
  const save = () => writeFile(manifestPath, JSON.stringify(manifest));
  await save();
  const run = (command, extra = []) => {
    const result = spawnSync(process.execPath, [cli, command, '--manifest', 'manifest.json', ...extra], { cwd: root, encoding: 'utf8' });
    assert.equal(result.stderr, '');
    return { status: result.status, json: JSON.parse(result.stdout) };
  };
  const freeze = async () => {
    const result = run('snapshot');
    assert.equal(result.status, 0, JSON.stringify(result));
    await writeFile(frozenPath, JSON.stringify(result.json));
    return result.json;
  };
  const verify = () => run('verify', ['--snapshot', frozenPath]);
  return { root, manifest, manifestPath, frozenPath, save, run, freeze, verify };
}

test('snapshot records exact bytes, sorted deduplicated references, and CLI does not write', async t => {
  const f = await fixture(t);
  const before = await readFile(f.manifestPath);
  const listing = await readdir(f.root, { recursive: true });
  assert.equal(f.run('snapshot').status, 0);
  assert.deepEqual(await readdir(f.root, { recursive: true }), listing);
  const snapshot = await f.freeze();
  assert.deepEqual(snapshot, {
    schemaVersion: 1,
    manifestSha256: digest(before),
    files: [
      { path: 'media/screen.png', bytes: 11, sha256: digest('image bytes') },
      { path: 'sources/screen.svg', bytes: 12, sha256: digest('source bytes') },
    ],
  });
  assert.deepEqual(f.verify(), { status: 0, json: { ok: true } });
  assert.deepEqual(await readFile(f.manifestPath), before);
});

for (const change of ['manifest whitespace', 'media bytes', 'source bytes', 'missing media']) {
  test(`verify rejects ${change}`, async t => {
    const f = await fixture(t);
    await f.freeze();
    if (change === 'manifest whitespace') await writeFile(f.manifestPath, `${JSON.stringify(f.manifest)}\n`);
    if (change === 'media bytes') await writeFile(path.join(f.root, 'media/screen.png'), 'IMAGE BYTES');
    if (change === 'source bytes') await writeFile(path.join(f.root, 'sources/screen.svg'), 'changed');
    if (change === 'missing media') await rm(path.join(f.root, 'media/screen.png'));
    assert.equal(f.verify().status, 1);
  });
}

const invalidManifests = {
  'unknown manifest field': f => { f.manifest.extra = true; },
  'unknown asset field': f => { f.manifest.assets[0].extra = true; },
  'missing required field': f => { delete f.manifest.assets[0].locale; },
  'empty sourceFiles': f => { f.manifest.assets[0].sourceFiles = []; },
  'empty assets': f => { f.manifest.assets = []; },
  'duplicate key': f => { f.manifest.assets.push({ ...f.manifest.assets[0], order: 2 }); },
  'duplicate slot': f => { f.manifest.assets.push({ ...f.manifest.assets[0], key: 'other' }); },
  'invalid order': f => { f.manifest.assets[0].order = 0; },
  'invalid kind': f => { f.manifest.assets[0].kind = 'icon'; },
  'invalid version': f => { f.manifest.schemaVersion = 2; },
  'traversal': f => { f.manifest.assets[0].file = '../outside.png'; },
  'absolute path': f => { f.manifest.assets[0].file = '/private/tmp/outside.png'; },
  'windows path': f => { f.manifest.assets[0].file = 'C:\\outside.png'; },
  'dot component': f => { f.manifest.assets[0].file = 'media/./screen.png'; },
  'reserved root': f => { f.manifest.assets[0].sourceFiles = ['.git/config']; },
  'release root': f => { f.manifest.assets[0].sourceFiles = ['.ios-release/state.json']; },
  'assets config root': f => { f.manifest.assets[0].sourceFiles = ['.app-store-assets/config.json']; },
  'secret source': f => { f.manifest.assets[0].sourceFiles = ['.env.local']; },
  'config media': f => { f.manifest.assets[0].file = 'media/config.json'; },
};
for (const [name, mutate] of Object.entries(invalidManifests)) {
  test(`snapshot rejects ${name}`, async t => {
    const f = await fixture(t);
    mutate(f);
    await f.save();
    const result = f.run('snapshot');
    assert.equal(result.status, 1);
    assert.equal(typeof result.json.error, 'string');
  });
}

test('duplicate JSON fields are rejected', async t => {
  const f = await fixture(t);
  const bytes = await readFile(f.manifestPath, 'utf8');
  await writeFile(f.manifestPath, bytes.replace('"schemaVersion":1', '"schemaVersion":1,"schemaVersion":1'));
  assert.match(f.run('snapshot').json.error, /Duplicate JSON field/);
});

for (const component of ['file', 'directory', 'manifest', 'manifest parent']) {
  test(`rejects symlink in ${component}`, async t => {
    const f = await fixture(t);
    if (component === 'file') {
      await symlink('../sources/screen.svg', path.join(f.root, 'media/link.png'));
      f.manifest.assets[0].file = 'media/link.png';
      await f.save();
    } else if (component === 'directory') {
      await symlink('sources', path.join(f.root, 'linked'));
      f.manifest.assets[0].sourceFiles = ['linked/screen.svg'];
      await f.save();
    } else if (component === 'manifest') {
      await symlink('manifest.json', path.join(f.root, 'linked.json'));
      const result = spawnSync(process.execPath, [cli, 'snapshot', '--manifest', path.join(f.root, 'linked.json')], { encoding: 'utf8' });
      assert.equal(result.status, 1);
      return;
    } else {
      await symlink(f.root, path.join(f.root, 'linked'));
      const result = spawnSync(process.execPath, [cli, 'snapshot', '--manifest', path.join(f.root, 'linked/manifest.json')], { encoding: 'utf8' });
      assert.equal(result.status, 1);
      return;
    }
    assert.match(f.run('snapshot').json.error, /Symlink/);
  });
}

test('rejects directory references', async t => {
  const f = await fixture(t);
  f.manifest.assets[0].sourceFiles = ['sources'];
  await f.save();
  assert.equal(f.run('snapshot').status, 1);
});

for (const name of ['unknown fields', 'wrong digest', 'duplicate files', 'unsorted files', 'invalid bytes', 'duplicate JSON fields', 'invalid JSON']) {
  test(`verify rejects malformed snapshot: ${name}`, async t => {
    const f = await fixture(t);
    const frozen = await f.freeze();
    if (name === 'unknown fields') frozen.extra = true;
    if (name === 'wrong digest') frozen.manifestSha256 = 'x';
    if (name === 'duplicate files') frozen.files.push(frozen.files[0]);
    if (name === 'unsorted files') frozen.files.reverse();
    if (name === 'invalid bytes') frozen.files[0].bytes = -1;
    let bytes = JSON.stringify(frozen);
    if (name === 'duplicate JSON fields') bytes = bytes.replace('"schemaVersion":1', '"schemaVersion":1,"schemaVersion":1');
    if (name === 'invalid JSON') bytes = '{';
    await writeFile(f.frozenPath, bytes);
    assert.equal(f.verify().status, 1);
  });
}

test('accepts equivalent snapshot field ordering and rejects CLI misuse', async t => {
  const f = await fixture(t);
  const frozen = await f.freeze();
  await writeFile(f.frozenPath, JSON.stringify({ files: frozen.files, manifestSha256: frozen.manifestSha256, schemaVersion: 1 }));
  assert.equal(f.verify().status, 0);
  for (const [command, args] of [['unknown', []], ['snapshot', ['--snapshot', f.frozenPath]], ['verify', []], ['snapshot', ['--manifest', f.manifestPath]], ['snapshot', ['--extra', 'x']]]) {
    assert.equal(f.run(command, args).status, 1);
  }
});

test('snapshot rejects local-state and credential sources at every depth', async t => {
  const f = await fixture(t);
  for (const relative of ['sources/AuthKey_ABC.p8', 'sources/.ios-release/local.json', 'sources/.git/config', '.asc/config.json', 'sources/.app-store-assets/local.json', 'sources/.ssh/id_ed25519', 'sources/credentials/session.json']) {
    const target = path.join(f.root, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, 'fixture');
    f.manifest.assets[0].sourceFiles = [relative];
    await f.save();
    const result = f.run('snapshot');
    assert.equal(result.status, 1, relative);
    assert.match(result.json.error, /Local-state or credential/);
  }
});

test('manifest and snapshot JSON reject malformed UTF-8 instead of replacement decoding', async t => {
  const f = await fixture(t);
  await f.freeze();
  const manifest = await readFile(f.manifestPath);
  const corruptManifest = Buffer.from(manifest);
  corruptManifest[corruptManifest.indexOf('sample')] = 0xff;
  await writeFile(f.manifestPath, corruptManifest);
  const snapshotResult = f.run('snapshot');
  assert.equal(snapshotResult.status, 1);
  assert.match(snapshotResult.json.error, /encoded data.*utf-8/i);
  await writeFile(f.manifestPath, manifest);
  const corruptSnapshot = await readFile(f.frozenPath);
  corruptSnapshot[corruptSnapshot.indexOf('media/screen.png')] = 0xff;
  await writeFile(f.frozenPath, corruptSnapshot);
  const verifyResult = f.verify();
  assert.equal(verifyResult.status, 1);
  assert.match(verifyResult.json.error, /encoded data.*utf-8/i);
});
