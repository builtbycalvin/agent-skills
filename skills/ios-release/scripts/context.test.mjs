import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./context.mjs', import.meta.url));
const temporaryRepositories = [];

async function makeRepository() {
  const repo = await mkdtemp(path.join(os.tmpdir(), 'ios-release-context-'));
  temporaryRepositories.push(repo);
  execFileSync('git', ['init', '--quiet', repo]);
  return repo;
}

function run(repo, ...arguments_) {
  const result = spawnSync(process.execPath, [script, ...arguments_, '--repo', repo], {
    encoding: 'utf8',
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    json: JSON.parse(result.stdout),
  };
}

async function initialize(repo) {
  const result = run(repo, 'init');
  assert.equal(result.status, 0, result.stdout);
  return result;
}

async function writeContext(repo, value) {
  await mkdir(path.join(repo, '.ios-release'), { recursive: true });
  await writeFile(path.join(repo, '.ios-release/context.json'), `${JSON.stringify(value, null, 2)}\n`);
}

function readyApp(overrides = {}) {
  return {
    bundleId: 'com.example.app',
    appId: '123456789',
    platform: 'IOS',
    ascProfile: 'example',
    xcode: {
      project: 'Example.xcodeproj',
      scheme: 'Example',
      configuration: 'Release',
    },
    ...overrides,
  };
}

test.after(async () => {
  await Promise.all(temporaryRepositories.map((repo) => rm(repo, { recursive: true, force: true })));
});

test('init is idempotent and preserves existing context', async () => {
  const repo = await makeRepository();
  const first = await initialize(repo);
  assert.equal(first.json.state, 'initialized');
  assert.equal(first.json.contextCreated, true);
  assert.equal(first.json.excludeRuleAdded, true);
  const contextPath = path.join(repo, '.ios-release/context.json');
  await writeFile(contextPath, '{"schemaVersion":1,"apps":{"kept":{}}}\n');
  const second = run(repo, 'init');
  assert.equal(second.status, 0);
  assert.equal(second.json.state, 'initialized');
  assert.equal(second.json.contextCreated, false);
  assert.equal(second.json.excludeRuleAdded, false);
  assert.equal(await readFile(contextPath, 'utf8'), '{"schemaVersion":1,"apps":{"kept":{}}}\n');
  const exclude = await readFile(path.join(repo, '.git/info/exclude'), 'utf8');
  assert.equal(exclude.split('\n').filter((line) => line === '/.ios-release/').length, 1);
});

test('doctor enforces the local ignore rule', async () => {
  const repo = await makeRepository();
  await writeContext(repo, { schemaVersion: 1, apps: { app: readyApp() } });
  const result = run(repo, 'doctor');
  assert.equal(result.status, 1);
  assert.equal(result.json.state, 'conflict');
  assert.match(result.json.errors.join('\n'), /not ignored/);
});

test('doctor rejects tracked files under the local context directory', async () => {
  const repo = await makeRepository();
  await initialize(repo);
  await writeContext(repo, { schemaVersion: 1, apps: { app: readyApp() } });
  execFileSync('git', ['-C', repo, 'add', '--force', '.ios-release/context.json']);
  const result = run(repo, 'doctor');
  assert.equal(result.status, 1);
  assert.equal(result.json.state, 'conflict');
  assert.deepEqual(result.json.trackedFiles, ['.ios-release/context.json']);
  assert.match(result.json.errors.join('\n'), /tracked files are forbidden/);
});

test('doctor rejects secret-shaped keys and private-key material', async () => {
  const cases = [
    { schemaVersion: 1, apps: { app: { ...readyApp(), apiToken: 'value' } } },
    { schemaVersion: 1, apps: { app: { ...readyApp(), displayName: '-----BEGIN PRIVATE KEY-----' } } },
  ];
  for (const context of cases) {
    const repo = await makeRepository();
    await initialize(repo);
    await writeContext(repo, context);
    const result = run(repo, 'doctor');
    assert.equal(result.json.state, 'conflict');
    assert.match(result.json.errors.join('\n'), /secret-shaped|private-key/);
  }
});

test('doctor rejects credential and private-key path strings anywhere', async () => {
  const cases = [
    { location: 'displayName', value: 'AuthKey_ABC123.p8' },
    { location: 'ascProfile', value: 'credentials/signing.pem' },
    { location: 'bundleId', value: 'private.key' },
  ];
  for (const { location, value } of cases) {
    const repo = await makeRepository();
    await initialize(repo);
    await writeContext(repo, {
      schemaVersion: 1,
      apps: { app: readyApp({ [location]: value }) },
    });
    const result = run(repo, 'doctor');
    assert.equal(result.json.state, 'conflict');
    assert.match(result.json.errors.join('\n'), /credential or private-key paths are forbidden/);
  }
});

test('doctor rejects unknown fields', async () => {
  const repo = await makeRepository();
  await initialize(repo);
  await writeContext(repo, { schemaVersion: 1, apps: { app: readyApp({ owner: 'Calvin' }) } });
  const result = run(repo, 'doctor');
  assert.equal(result.json.state, 'conflict');
  assert.match(result.json.errors.join('\n'), /owner: unknown field/);
});

test('doctor rejects absolute paths and repository escapes', async () => {
  const cases = ['/tmp/Example.xcodeproj', '../Example.xcodeproj'];
  for (const project of cases) {
    const repo = await makeRepository();
    await initialize(repo);
    await writeContext(repo, { schemaVersion: 1, apps: { app: readyApp({ xcode: { project, scheme: 'Example', configuration: 'Release' } }) } });
    const result = run(repo, 'doctor');
    assert.equal(result.json.state, 'conflict');
    assert.match(result.json.errors.join('\n'), /absolute paths|escapes the repository/);
  }
});

test('doctor rejects malformed Xcode unions and invalid enums', async () => {
  const cases = [
    {
      app: readyApp({
        xcode: {
          project: 'Example.xcodeproj',
          workspace: 'Example.xcworkspace',
          scheme: 'Example',
          configuration: 'Release',
        },
      }),
      expected: /exactly one of project or workspace/,
    },
    { app: readyApp({ platform: 'MAC_OS' }), expected: /platform: expected IOS/ },
    { app: readyApp({ defaultIntent: 'release-now' }), expected: /invalid intent/ },
  ];
  for (const { app, expected } of cases) {
    const repo = await makeRepository();
    await initialize(repo);
    await writeContext(repo, { schemaVersion: 1, apps: { app } });
    const result = run(repo, 'doctor');
    assert.equal(result.json.state, 'conflict');
    assert.match(result.json.errors.join('\n'), expected);
  }
});

test('doctor rejects ambiguous multiple-app context', async () => {
  const repo = await makeRepository();
  await initialize(repo);
  await writeContext(repo, { schemaVersion: 1, apps: { one: readyApp(), two: readyApp({ bundleId: 'com.example.two' }) } });
  const result = run(repo, 'doctor');
  assert.equal(result.json.state, 'conflict');
  assert.match(result.json.errors.join('\n'), /defaultApp: required/);
});

test('doctor rejects collisions among app keys, display names, and aliases', async () => {
  const cases = [
    {
      one: readyApp(),
      two: readyApp({ bundleId: 'com.example.two', displayName: 'ONE' }),
      expected: /collides with app key one/,
    },
    {
      one: readyApp({ displayName: 'Shared Name' }),
      two: readyApp({ bundleId: 'com.example.two', aliases: ['shared name'] }),
      expected: /collides with display name "Shared Name" for one/,
    },
    {
      one: readyApp({ aliases: ['shared'] }),
      two: readyApp({ bundleId: 'com.example.two', aliases: ['Shared'] }),
      expected: /collides with alias "shared" for one/,
    },
  ];
  for (const { one, two, expected } of cases) {
    const repo = await makeRepository();
    await initialize(repo);
    await writeContext(repo, {
      schemaVersion: 1,
      defaultApp: 'one',
      apps: { one, two },
    });
    const result = run(repo, 'doctor');
    assert.equal(result.json.state, 'conflict');
    assert.match(result.json.errors.join('\n'), expected);
  }
});

test('doctor reports incomplete state with missing fields', async () => {
  const repo = await makeRepository();
  await initialize(repo);
  await writeContext(repo, { schemaVersion: 1, apps: { app: { displayName: 'Example' } } });
  const result = run(repo, 'doctor', '--app', 'app');
  assert.equal(result.status, 0);
  assert.equal(result.json.state, 'incomplete');
  assert.deepEqual(result.json.missing, [
    'apps.app.bundleId',
    'apps.app.appId',
    'apps.app.platform',
    'apps.app.ascProfile',
    'apps.app.xcode.project|workspace',
    'apps.app.xcode.scheme',
    'apps.app.xcode.configuration',
  ]);
});

test('doctor reports ready state for a complete selected app', async () => {
  const repo = await makeRepository();
  await initialize(repo);
  await writeContext(repo, {
    schemaVersion: 1,
    defaultApp: 'one',
    apps: {
      one: readyApp({ aliases: ['primary'], metadataDirectory: 'metadata' }),
      two: { displayName: 'Still configuring' },
    },
  });
  const result = run(repo, 'doctor', '--app', 'one');
  assert.equal(result.status, 0, result.stdout);
  assert.equal(result.json.state, 'ready');
  assert.deepEqual(result.json.errors, []);
  assert.deepEqual(result.json.missing, []);
});

test('doctor resolves a display name as an app selector', async () => {
  const repo = await makeRepository();
  await initialize(repo);
  await writeContext(repo, {
    schemaVersion: 1,
    defaultApp: 'one',
    apps: {
      one: readyApp({ displayName: 'Example App' }),
      two: { displayName: 'Still Configuring' },
    },
  });
  const result = run(repo, 'doctor', '--app', 'example app');
  assert.equal(result.status, 0, result.stdout);
  assert.equal(result.json.state, 'ready');
  assert.deepEqual(result.json.errors, []);
  assert.deepEqual(result.json.missing, []);
});
