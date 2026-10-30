import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, chmodSync, lstatSync, readdirSync, symlinkSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scratch = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(scratch, 'config.mjs');
const D = '.app-store-assets';
const whitelist = '*\n!.gitignore\n!config.json\n';
const git = (repo, args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
function fixture(t) { const repo = mkdtempSync(path.join(scratch, 'fixture-')); git(repo, ['init', '-q']); t.after(() => rmSync(repo, { recursive: true, force: true })); return repo; }
function write(repo, name, value, mode) { const target = path.join(repo, name); mkdirSync(path.dirname(target), { recursive: true }); writeFileSync(target, typeof value === 'string' ? value : JSON.stringify(value), { mode }); }
function cli(repo, command = 'doctor', app) { const output = spawnSync(process.execPath, [script, command, '--repo', repo, ...(app === undefined ? [] : ['--app', app])], { encoding: 'utf8' }); assert.equal(output.stderr, ''); return { code: output.status, ...JSON.parse(output.stdout) }; }
function app(extra = {}) { return { identity: { name: 'Example', bundleId: 'com.example.app', ascAppId: '123', sourceRoot: '.', platform: 'IOS' }, assetRoot: 'store-assets/example', sourceLocale: 'en-US', locales: ['en-US'], devices: ['iphone'], orientations: ['portrait'], templates: {}, ...extra }; }
function setup(repo, apps = { example: app() }, localApps = { example: { ascProfile: 'example-profile' } }, extra = {}) { assert.equal(cli(repo, 'init').state, 'initialized'); write(repo, `${D}/config.json`, { schemaVersion: 1, apps, ...extra }); write(repo, `${D}/local.json`, { schemaVersion: 1, apps: localApps }); }
function linked(repo, assetExtra = {}, releaseExtra = {}, binding = 'profile') {
  const { identity, ...assets } = app(); setup(repo, { example: { ...assets, releaseApp: 'release', ...assetExtra } }, {});
  write(repo, '.ios-release/.gitignore', whitelist);
  write(repo, '.ios-release/config.json', { schemaVersion: 2, apps: { release: { displayName: 'Release App', aliases: ['Alias'], bundleId: 'com.example.linked', appId: '456', platform: 'IOS', sourceRoot: '.', releaseNotes: { sourceLocale: 'en-US', locales: ['en-US'] }, ...releaseExtra } } });
  write(repo, '.ios-release/local.json', { schemaVersion: 2, apps: { release: { ascProfile: binding } } }, 0o600);
}
function snapshot(repo, relative = '') { const result = {}; for (const name of readdirSync(path.join(repo, relative))) { if (name === '.git') continue; const rel = path.join(relative, name); const s = lstatSync(path.join(repo, rel)); result[rel] = { mode: s.mode, content: s.isFile() ? readFileSync(path.join(repo, rel)).toString('base64') : null }; if (s.isDirectory()) Object.assign(result, snapshot(repo, rel)); } return result; }

test('init resolves Git root, uses private local mode, and preserves existing bytes and modes on rerun', t => {
  const repo = fixture(t); mkdirSync(path.join(repo, 'source'));
  assert.equal(cli(path.join(repo, 'source'), 'init').state, 'initialized');
  assert.equal(readFileSync(path.join(repo, D, '.gitignore'), 'utf8'), whitelist);
  assert.equal(lstatSync(path.join(repo, D, 'local.json')).mode & 0o777, 0o600);
  write(repo, `${D}/config.json`, '{ "existing": true }\n'); chmodSync(path.join(repo, D, 'local.json'), 0o644);
  const before = snapshot(repo); assert.equal(cli(repo, 'init').state, 'initialized'); assert.deepEqual(snapshot(repo), before);
  assert.equal(cli(repo).state, 'conflict');
});
test('standalone doctor is ready, read-only, and does not require an existing prospective assetRoot', t => {
  const repo = fixture(t); setup(repo); const before = snapshot(repo); const result = cli(repo);
  assert.equal(result.code, 0); assert.equal(result.state, 'ready'); assert.equal(result.checks.remoteReadiness, 'not-checked'); assert.deepEqual(snapshot(repo), before);
});
test('bundle identifiers do not require a reverse-DNS naming convention', t => {
  const repo = fixture(t); const configured = app(); configured.identity.bundleId = 'ExampleApp';
  setup(repo, { example: configured });
  assert.equal(cli(repo).state, 'ready');
});
test('doctor rejects malformed UTF-8 inside an otherwise valid JSON string', t => {
  const repo = fixture(t); setup(repo);
  const target = path.join(repo, D, 'config.json');
  const malformed = Buffer.from(readFileSync(target, 'utf8').replace('"Example"', '"?xample"'));
  malformed[malformed.indexOf('?xample')] = 0xff;
  writeFileSync(target, malformed);
  const before = snapshot(repo); const result = cli(repo);
  assert.equal(result.state, 'conflict');
  assert.deepEqual(snapshot(repo), before);
});
test('doctor rejects every non-object root across asset and linked release documents', t => {
  const repo = fixture(t); linked(repo);
  for (const name of [`${D}/config.json`, `${D}/local.json`, '.ios-release/config.json', '.ios-release/local.json']) {
    const target = path.join(repo, name); const original = readFileSync(target);
    for (const value of [null, false, 0, '', [], 42]) {
      write(repo, name, JSON.stringify(value));
      const before = snapshot(repo); const result = cli(repo);
      assert.equal(result.state, 'conflict', `${name}: ${JSON.stringify(value)}`);
      assert.match(result.errors.join('\n'), /expected an object/);
      assert.deepEqual(snapshot(repo), before);
    }
    writeFileSync(target, original);
  }
});
test('doctor rejects credential files as templates or capture plans', t => {
  const repo = fixture(t); setup(repo);
  for (const name of ['.netrc', '.npmrc', 'id_rsa', 'id_ed25519', 'signing.p8', 'signing.p12', 'signing.pfx', 'app.mobileprovision']) {
    write(repo, name, 'fixture');
    for (const field of ['templates', 'capturePlan']) {
      const configured = app(field === 'templates' ? { templates: { screenshots: name } } : { capturePlan: name });
      write(repo, `${D}/config.json`, { schemaVersion: 1, apps: { example: configured } });
      const before = snapshot(repo); const result = cli(repo);
      assert.equal(result.state, 'conflict', `${field}: ${name}`);
      assert.deepEqual(snapshot(repo), before);
    }
  }
});
test('init and doctor work through a symlinked installed-skill directory', t => {
  const repo = fixture(t); const install = path.join(repo, 'installed-skill');
  symlinkSync(scratch, install, 'dir');
  const installedScript = path.join(install, 'config.mjs');
  for (const args of [['--help'], ['init', '--repo', repo], ['doctor', '--repo', repo]]) {
    const result = spawnSync(process.execPath, [installedScript, ...args], { encoding: 'utf8' });
    assert.equal(result.stderr, '');
    assert.ok(result.stdout.length > 0);
    if (args[0] === '--help') { assert.equal(result.status, 0); assert.match(result.stdout, /Usage:/); }
    else { const parsed = JSON.parse(result.stdout); assert.equal(parsed.state, args[0] === 'init' ? 'initialized' : 'incomplete'); assert.equal(result.status, args[0] === 'init' ? 0 : 1); }
  }
});
test('empty config and absent choices are incomplete; malformed specified choices conflict', t => {
  const repo = fixture(t); assert.equal(cli(repo, 'init').state, 'initialized'); assert.equal(cli(repo).state, 'incomplete');
  setup(repo, { example: { assetRoot: 'assets' } }, {}); assert.equal(cli(repo).state, 'incomplete');
  setup(repo, { example: app({ devices: 'iphone' }) }); assert.equal(cli(repo).state, 'conflict');
});
test('multiple apps need a default unless --app selects a key or name, but malformed unselected apps still conflict', t => {
  const repo = fixture(t); const other = app({ identity: { name: 'Other', bundleId: 'com.other.app', ascAppId: '999', sourceRoot: '.', platform: 'IOS' }, assetRoot: 'assets/other' });
  delete other.devices; setup(repo, { example: app(), other }, { example: { ascProfile: 'p' } });
  assert.equal(cli(repo).state, 'incomplete'); assert.equal(cli(repo, 'doctor', 'EXAMPLE').state, 'ready');
  assert.equal(cli(repo, 'doctor', 'Example').selectedApp, 'example');
  other.orientations = 1; setup(repo, { example: app(), other }); assert.equal(cli(repo, 'doctor', 'Example').state, 'conflict');
  delete other.orientations; setup(repo, { example: app(), other }, {}, { defaultApp: 'missing' }); assert.equal(cli(repo).state, 'conflict');
});
test('linked identity and profile resolve without Xcode or TestFlight completeness; aliases select apps', t => {
  const repo = fixture(t); linked(repo); assert.equal(cli(repo, 'doctor', 'ALIAS').state, 'ready');
  const before = snapshot(repo); assert.equal(cli(repo).state, 'ready'); assert.deepEqual(snapshot(repo), before);
  const release = JSON.parse(readFileSync(path.join(repo, '.ios-release/config.json'))); delete release.apps.release.sourceRoot; write(repo, '.ios-release/config.json', release); assert.equal(cli(repo).state, 'ready');
  linked(repo, { sourceLocale: 'zh-TW', locales: ['zh-TW'] }); const changed = cli(repo); assert.equal(changed.state, 'ready'); assert.equal(changed.warnings.length, 2);
});
test('linked profile overrides must agree and missing linkage stays incomplete', t => {
  const repo = fixture(t); linked(repo); write(repo, `${D}/local.json`, { schemaVersion: 1, apps: { example: { ascProfile: 'different' } } }); assert.equal(cli(repo).state, 'conflict');
  write(repo, `${D}/local.json`, { schemaVersion: 1, apps: {} }); rmSync(path.join(repo, '.ios-release/local.json')); assert.equal(cli(repo).state, 'incomplete');
  rmSync(path.join(repo, '.ios-release/config.json')); assert.equal(cli(repo).state, 'incomplete');
});
test('unselected missing linkage does not make the selected standalone app incomplete', t => {
  const repo = fixture(t); const { identity, ...asset } = app(); setup(repo, { example: app(), other: { ...asset, assetRoot: 'assets/other', releaseApp: 'missing' } });
  assert.equal(cli(repo, 'doctor', 'example').state, 'ready');
});
test('unknown, secret, transient, malformed UTF-8 and duplicate JSON fields conflict without printing values', t => {
  const repo = fixture(t); setup(repo);
  for (const content of [
    '{"schemaVersion":1,"schemaVersion":1,"apps":{}}',
    '{"schemaVersion":1,"apps":{},"password":"DO_NOT_PRINT_ME"}',
    JSON.stringify({ schemaVersion: 1, apps: { example: app({ currentVersion: '1.2' }) } }),
    JSON.stringify({ schemaVersion: 1, apps: { example: app({ identity: { ...app().identity, name: 'Bearer DO_NOT_PRINT_ME' } }) } }),
    JSON.stringify({ schemaVersion: 1, apps: { example: app({ unexpected: true }) } }),
    JSON.stringify({ schemaVersion: 1, defaultApp: 'sk_live_DO_NOT_PRINT_ME', apps: { sk_live_DO_NOT_PRINT_ME: app() } })
  ]) { write(repo, `${D}/config.json`, content); const result = cli(repo); assert.equal(result.state, 'conflict'); assert.ok(!JSON.stringify(result).includes('DO_NOT_PRINT_ME')); }
  writeFileSync(path.join(repo, D, 'config.json'), Buffer.from([0xff])); assert.equal(cli(repo).state, 'conflict');
});
test('selectors, identities, release links, and overlapping roots reject collisions', t => {
  const repo = fixture(t);
  for (const other of [app({ assetRoot: 'assets/other' }), app({ identity: { ...app().identity, name: 'Different', ascAppId: '999' }, assetRoot: 'store-assets/example/nested' })]) {
    setup(repo, { example: app(), other }, {}, { defaultApp: 'example' }); assert.equal(cli(repo).state, 'conflict');
  }
  linked(repo); const config = JSON.parse(readFileSync(path.join(repo, D, 'config.json'))); config.apps.other = { ...config.apps.example, assetRoot: 'assets/other' }; write(repo, `${D}/config.json`, config); assert.equal(cli(repo).state, 'conflict');
});
test('unsafe portable paths conflict, including missing directories matched by directory-only ignores', t => {
  const repo = fixture(t);
  for (const unsafe of ['../outside', 'safe/../assets', '/tmp/assets', 'C:\\assets', 'C:assets', 'https://example.invalid/assets', '.git/assets', '.asc/assets', 'build/assets', '.env/data', 'credentials/data', '.']) { setup(repo, { example: app({ assetRoot: unsafe }) }); assert.equal(cli(repo).state, 'conflict', unsafe); }
  write(repo, '.gitignore', 'future/\n'); setup(repo, { example: app({ assetRoot: 'future' }) }); assert.equal(cli(repo).state, 'conflict');
  symlinkSync('store-assets', path.join(repo, 'symbol')); setup(repo, { example: app({ assetRoot: 'symbol/new' }) }); assert.equal(cli(repo).state, 'conflict');
  mkdirSync(path.join(repo, 'nested')); git(path.join(repo, 'nested'), ['init', '-q']); setup(repo, { example: app({ assetRoot: 'nested/assets' }) }); assert.equal(cli(repo).state, 'conflict');
});
test('custom Git metadata directory is rejected', t => {
  const repo = fixture(t); rmSync(path.join(repo, '.git'), { recursive: true }); git(repo, ['init', '-q', '--separate-git-dir', path.join(repo, 'repository-data')]);
  setup(repo, { example: app({ assetRoot: 'repository-data/assets' }) }); assert.equal(cli(repo).state, 'conflict');
});
test('missing referenced files are incomplete; wrong file types and missing sourceRoot conflict/incomplete correctly', t => {
  const repo = fixture(t); setup(repo, { example: app({ templates: { screenshots: 'templates/main.json' }, capturePlan: 'captures/plan.json' }) }); assert.equal(cli(repo).state, 'incomplete');
  write(repo, 'templates/main.json', '{}'); write(repo, 'captures/plan.json', '{}'); assert.equal(cli(repo).state, 'ready');
  rmSync(path.join(repo, 'templates/main.json')); mkdirSync(path.join(repo, 'templates/main.json')); assert.equal(cli(repo).state, 'conflict');
  setup(repo, { example: app({ identity: { ...app().identity, sourceRoot: 'missing-source' } }) }); assert.equal(cli(repo).state, 'incomplete');
});
test('init preflight refuses known namespace conflicts before writing anything', t => {
  const repo = fixture(t); write(repo, `${D}/.gitignore`, 'wrong\n'); const before = snapshot(repo); assert.equal(cli(repo, 'init').state, 'conflict'); assert.deepEqual(snapshot(repo), before);
  rmSync(path.join(repo, D), { recursive: true }); write(repo, '.gitignore', `${D}/\n`); const ignoredBefore = snapshot(repo); assert.equal(cli(repo, 'init').state, 'conflict'); assert.deepEqual(snapshot(repo), ignoredBefore);
  rmSync(path.join(repo, '.gitignore')); write(repo, `${D}/runs/a/run.json`, '{}'); git(repo, ['add', '-f', `${D}/runs/a/run.json`]); const trackedBefore = snapshot(repo); assert.equal(cli(repo, 'init').state, 'conflict'); assert.deepEqual(snapshot(repo), trackedBefore);
});
test('tracked local, unsafe namespaces, and permissive local modes conflict', t => {
  const repo = fixture(t); setup(repo); git(repo, ['add', '-f', `${D}/local.json`]); assert.equal(cli(repo).state, 'conflict'); assert.equal(cli(repo, 'init').state, 'conflict');
  git(repo, ['rm', '--cached', '-f', `${D}/local.json`]); chmodSync(path.join(repo, D, 'local.json'), 0o640); assert.equal(cli(repo).state, 'conflict');
  rmSync(path.join(repo, D), { recursive: true }); symlinkSync('elsewhere', path.join(repo, D)); assert.equal(cli(repo, 'init').state, 'conflict'); assert.equal(cli(repo).state, 'conflict');
});
test('gitlink namespace is refused without writes', t => {
  const repo = fixture(t); write(repo, 'seed', 'x'); git(repo, ['add', 'seed']); const tree = git(repo, ['write-tree']).trim(); const commit = execFileSync('git', ['-C', repo, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit-tree', tree], { input: 'fixture\n', encoding: 'utf8' }).trim();
  git(repo, ['update-index', '--add', '--cacheinfo', `160000,${commit},${D}`]); const before = snapshot(repo); assert.equal(cli(repo, 'init').state, 'conflict'); assert.deepEqual(snapshot(repo), before);
});
test('CLI help and invalid options have the correct exit status', t => {
  const repo = fixture(t); const help = spawnSync(process.execPath, [script, '--help'], { encoding: 'utf8' }); assert.equal(help.status, 0); assert.match(help.stdout, /Offline/);
  const invalid = spawnSync(process.execPath, [script, 'doctor', '--repo', repo, '--unknown', 'DO_NOT_PRINT_ME'], { encoding: 'utf8' }); assert.equal(invalid.status, 1); assert.ok(!invalid.stdout.includes('DO_NOT_PRINT_ME'));
});
