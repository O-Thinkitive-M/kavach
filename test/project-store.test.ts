import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Point the user store at a sandbox before importing anything that reads it.
const home = mkdtempSync(join(tmpdir(), 'kavach-home-'));
process.env.KAVACH_HOME = home;

const { projectKey, projectDir, projectPath } = await import('../src/store/project.ts');
const { loadConfig, writeConfig, loadKnowledge } = await import('../src/store/config.ts');
const { init } = await import('../src/commands/init.ts');

function repo(remote?: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'kavach-repo-'));
  execFileSync('git', ['init', '-q', dir]);
  if (remote) execFileSync('git', ['-C', dir, 'remote', 'add', 'origin', remote]);
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'fixture' }));
  return dir;
}

const cleanup: string[] = [];
beforeEach(() => {
  rmSync(join(home, 'projects'), { recursive: true, force: true });
});

// ---------- nothing is written into the repository ----------

test('a review writes nothing into the project folder', async () => {
  const dir = repo('https://github.com/acme/api.git');
  cleanup.push(dir);

  await init({
    root: dir,
    detect: false,
    reset: false,
    status: false,
    summary: 'Payments API',
    rules: 'Money is integer cents',
    logs: 'true',
  });

  const entries = readdirSync(dir).filter((e) => e !== '.git');
  assert.deepEqual(entries, ['package.json'], `repo was polluted: ${entries.join(', ')}`);
  assert.equal(existsSync(join(dir, '.pr-architect')), false);
});

test('state lands under the user home instead', async () => {
  const dir = repo('https://github.com/acme/api.git');
  cleanup.push(dir);
  await init({ root: dir, detect: false, reset: false, status: false, summary: 'X' });

  assert.ok(projectDir(dir).startsWith(home), 'must live under KAVACH_HOME');
  assert.ok(existsSync(projectPath(dir, 'config.json')));
  assert.ok(existsSync(projectPath(dir, 'rules.md')));
});

// ---------- project identity ----------

test('the key is derived from the git remote, not the folder path', () => {
  const a = repo('https://github.com/acme/api.git');
  const b = repo('https://github.com/acme/api.git');
  cleanup.push(a, b);
  // Two different checkouts of one repo share settings.
  assert.equal(projectKey(a), projectKey(b));
});

test('different repos never share a key', () => {
  const a = repo('https://github.com/acme/api.git');
  const b = repo('https://github.com/acme/web.git');
  cleanup.push(a, b);
  assert.notEqual(projectKey(a), projectKey(b));
});

test('ssh and https remotes for one repo resolve to the same project', () => {
  // Switching a remote between protocols must not orphan the user's settings.
  const https = repo('https://github.com/acme/api.git');
  const ssh = repo('git@github.com:acme/api.git');
  const noSuffix = repo('https://github.com/acme/api');
  const cased = repo('https://github.com/ACME/API.git');
  cleanup.push(https, ssh, noSuffix, cased);

  assert.equal(projectKey(https), projectKey(ssh));
  assert.equal(projectKey(https), projectKey(noSuffix));
  assert.equal(projectKey(https), projectKey(cased), 'owner/repo case should not matter');
  assert.match(projectKey(https), /^acme-api-/);
});

test('a non-git folder still gets a stable key', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kavach-plain-'));
  cleanup.push(dir);
  assert.equal(projectKey(dir), projectKey(dir));
  assert.ok(projectKey(dir).length > 0);
});

test('the key is filesystem-safe and human-readable', () => {
  const dir = repo('https://github.com/acme-corp/my.weird repo.git');
  cleanup.push(dir);
  const key = projectKey(dir);
  assert.doesNotMatch(key, /[/\\:\s]/, `key must be a safe path segment: ${key}`);
  assert.match(key, /acme-corp/);
});

// ---------- isolation between projects ----------

test('two projects keep entirely separate settings', async () => {
  const a = repo('https://github.com/acme/api.git');
  const b = repo('https://github.com/acme/web.git');
  cleanup.push(a, b);

  await init({ root: a, detect: false, reset: false, status: false, summary: 'API', strictness: 'strict' });
  await init({ root: b, detect: false, reset: false, status: false, summary: 'Web', strictness: 'lenient' });

  const ca = loadConfig(a).config;
  const cb = loadConfig(b).config;

  assert.equal(ca.project.summary, 'API');
  assert.equal(cb.project.summary, 'Web');
  assert.equal(ca.review.maxComments, 25);
  assert.equal(cb.review.maxComments, 8);
});

test('rules do not leak between projects', async () => {
  const a = repo('https://github.com/acme/api.git');
  const b = repo('https://github.com/acme/web.git');
  cleanup.push(a, b);

  await init({ root: a, detect: false, reset: false, status: false, rules: 'Money is integer cents' });
  await init({ root: b, detect: false, reset: false, status: false, rules: 'Prefer server components' });

  assert.match(loadKnowledge(a).rules, /integer cents/);
  assert.doesNotMatch(loadKnowledge(a).rules, /server components/);
  assert.match(loadKnowledge(b).rules, /server components/);
});

// ---------- migration off the old in-repo store ----------

test('an existing .pr-architect/ is migrated once, and the originals stay put', () => {
  const dir = repo('https://github.com/acme/legacy.git');
  cleanup.push(dir);

  mkdirSync(join(dir, '.pr-architect'), { recursive: true });
  writeFileSync(
    join(dir, '.pr-architect', 'config.json'),
    JSON.stringify({
      schema: 2,
      project: { name: 'legacy', summary: 'An older project' },
      review: { maxComments: 22 },
    }),
  );
  writeFileSync(join(dir, '.pr-architect', 'rules.md'), '# Project rules\n\n- Never log PII\n');

  const { config } = loadConfig(dir);
  assert.equal(config.project.summary, 'An older project', 'settings should carry over');
  assert.equal(config.review.maxComments, 22);
  assert.match(loadKnowledge(dir).rules, /Never log PII/);

  // Kavach does not delete files inside someone's repository.
  assert.ok(existsSync(join(dir, '.pr-architect', 'config.json')));
});

test('migration does not overwrite settings the user already has', async () => {
  const dir = repo('https://github.com/acme/legacy2.git');
  cleanup.push(dir);

  await init({ root: dir, detect: false, reset: false, status: false, summary: 'Current answer' });

  mkdirSync(join(dir, '.pr-architect'), { recursive: true });
  writeFileSync(
    join(dir, '.pr-architect', 'config.json'),
    JSON.stringify({ schema: 2, project: { name: 'x', summary: 'Stale answer' } }),
  );

  assert.equal(loadConfig(dir).config.project.summary, 'Current answer');
});

test('a project with no legacy store is unaffected', () => {
  const dir = repo('https://github.com/acme/fresh.git');
  cleanup.push(dir);
  const { config, created } = loadConfig(dir);
  assert.equal(created, true);
  assert.ok(config.project.name);
});

// ---------- config round-trips ----------

test('a written config is read back from the user store', () => {
  const dir = repo('https://github.com/acme/roundtrip.git');
  cleanup.push(dir);

  const { config } = loadConfig(dir);
  config.review.maxComments = 7;
  writeConfig(dir, config);

  assert.equal(loadConfig(dir).config.review.maxComments, 7);
  assert.equal(
    JSON.parse(readFileSync(projectPath(dir, 'config.json'), 'utf8')).review.maxComments,
    7,
  );
});

process.on('exit', () => {
  rmSync(home, { recursive: true, force: true });
  for (const dir of cleanup) rmSync(dir, { recursive: true, force: true });
});
