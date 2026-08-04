import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// Sandbox the user store before importing anything that resolves it, so tests
// never write into the developer's real ~/.kavach.
const home = mkdtempSync(join(tmpdir(), 'kavach-home-'));
process.env.KAVACH_HOME = home;

const { init } = await import('../src/commands/init.ts');
const { appendLog, dayStamp, listLogDays, logPath, readLog } = await import('../src/store/log.ts');
const { loadConfig, loadKnowledge } = await import('../src/store/config.ts');
const { migrateConfig } = await import('../src/store/migrate.ts');
import type { ResolvedFinding, ReviewContext } from '../src/types.ts';

let root: string;
const created: string[] = [];

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'kavach-init-'));
  created.push(root);
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({
      name: 'acme-health',
      dependencies: { next: '^14', react: '^18' },
      devDependencies: { typescript: '^5', vitest: '^1' },
    }),
  );
  writeFileSync(join(root, 'tsconfig.json'), '{}');
  writeFileSync(join(root, 'pnpm-lock.yaml'), '');
});

const base = { root, detect: false, reset: false, status: false };

// ---------- init ----------

test('init records the answers and they survive a config reload', async () => {
  await init({
    ...base,
    root,
    summary: 'Patient scheduling API',
    focus: 'auth, PHI handling',
  });

  const { config } = loadConfig(root);
  assert.equal(config.project.summary, 'Patient scheduling API');
  assert.deepEqual(config.project.focusAreas, ['auth', 'PHI handling']);
  assert.ok(config.project.initialized);
});

test('migration does not drop the init fields', () => {
  // Regression: withDefaults() rebuilt `project` from a fixed key list, which
  // silently discarded summary/focusAreas/initialized on every load.
  const { config } = migrateConfig({
    schema: 2,
    project: {
      name: 'x',
      summary: 'a summary',
      focusAreas: ['auth'],
      initialized: '2026-08-04T00:00:00.000Z',
    },
  });
  assert.equal(config.project.summary, 'a summary');
  assert.deepEqual(config.project.focusAreas, ['auth']);
  assert.equal(config.project.initialized, '2026-08-04T00:00:00.000Z');
});

test('a never-initialized config carries no init keys', () => {
  const { config } = migrateConfig({ schema: 2, project: { name: 'x' } });
  assert.equal('summary' in config.project, false);
  assert.equal('initialized' in config.project, false);
});

test('init picks up the detected stack without being told', async () => {
  await init({ ...base, root });
  const { config } = loadConfig(root);
  assert.equal(config.project.language, 'typescript');
  assert.equal(config.project.framework, 'next');
  assert.equal(config.project.packageManager, 'pnpm');
  assert.equal(config.project.testFramework, 'vitest');
});

test('rules are appended, never overwritten', async () => {
  await init({ ...base, root, rules: 'First rule' });
  await init({ ...base, root, rules: 'Second rule' });

  // Rules live in the user store now, not in the repository.
  const rules = loadKnowledge(root).rules;
  assert.match(rules, /- First rule/);
  assert.match(rules, /- Second rule/);
  // The template placeholder goes away once real rules exist.
  assert.doesNotMatch(rules, /\(none yet\)/);
});

test('multi-line rules become separate bullets', async () => {
  await init({ ...base, root, rules: 'Rule one\nRule two\nRule three' });
  const rules = loadKnowledge(root).rules;
  assert.equal((rules.match(/^- Rule/gm) ?? []).length, 3);
});

test('strictness maps onto the thresholds that control noise', async () => {
  await init({ ...base, root, strictness: 'strict' });
  let { config } = loadConfig(root);
  assert.equal(config.review.mode, 'deep');
  assert.equal(config.review.maxComments, 25);

  await init({ ...base, root, strictness: 'lenient' });
  ({ config } = loadConfig(root));
  assert.equal(config.review.maxComments, 8);
  assert.equal(config.review.minConfidenceForIssue, 0.9);
});

test('re-running init preserves earlier answers', async () => {
  await init({ ...base, root, summary: 'Original summary', focus: 'auth' });
  await init({ ...base, root, strictness: 'lenient' });

  const { config } = loadConfig(root);
  assert.equal(config.project.summary, 'Original summary');
  assert.deepEqual(config.project.focusAreas, ['auth']);
});

test('--reset clears the previous answers', async () => {
  await init({ ...base, root, summary: 'Old', focus: 'auth' });
  await init({ ...base, root, reset: true });

  const { config } = loadConfig(root);
  assert.equal(config.project.summary, undefined);
  // An empty focus list is omitted rather than stored as [].
  assert.ok(!config.project.focusAreas?.length);
});

test('the review log is OFF unless the project opts in', async () => {
  await init({ ...base, root });
  assert.equal(loadConfig(root).config.notify.reviewLog, false);

  await init({ ...base, root, logs: 'true' });
  assert.equal(loadConfig(root).config.notify.reviewLog, true);

  await init({ ...base, root, logs: 'false' });
  assert.equal(loadConfig(root).config.notify.reviewLog, false);
});

test('an older config without the flag defaults to logging off', () => {
  const { config } = migrateConfig({ schema: 2, notify: { googleChat: true } });
  assert.equal(config.notify.reviewLog, false);
});

test('migration preserves an opted-in log setting', () => {
  const { config } = migrateConfig({ schema: 1, notify: { reviewLog: true } });
  assert.equal(config.notify.reviewLog, true);
});

// ---------- day-wise log ----------

function context(number: number): ReviewContext {
  return {
    kavachVersion: '1.0.0',
    schema: 1,
    pr: {
      owner: 'acme',
      repo: 'api',
      number,
      title: `PR ${number}`,
      body: '',
      author: 'dev',
      branch: 'feature',
      baseRef: 'main',
      headSha: 'abc1234',
      baseSha: 'def5678',
      url: `https://github.com/acme/api/pull/${number}`,
      additions: 10,
      deletions: 2,
      changedFiles: 3,
      draft: false,
    },
    route: { reviewers: ['security'], mode: 'standard', reasons: { security: 'auth paths' } },
    budget: { totalTokens: 4000, filesIncluded: 3, filesSkipped: 0, filesTruncated: 0, cap: 60000 },
    files: [],
    priorFindings: [],
    knowledge: { rules: '', stack: '', conventions: '' },
  };
}

function finding(over: Partial<ResolvedFinding> = {}): ResolvedFinding {
  return {
    reviewer: 'security',
    path: 'src/a.ts',
    line: 4,
    severity: 'High',
    confidence: 0.9,
    verified: true,
    title: 'SQL injection',
    body: 'concatenated input',
    kind: 'issue',
    fingerprint: 'abc123',
    reviewers: ['security'],
    ...over,
  };
}

test('a review is written to a file named for today', () => {
  const path = appendLog(root, {
    context: context(1),
    findings: [finding()],
    posted: 1,
    reviewUrl: 'https://github.com/acme/api/pull/1#review',
    dryRun: false,
  });

  assert.equal(path, logPath(root));
  assert.match(path, /\d{4}-\d{2}-\d{2}\.md$/);

  const log = readFileSync(path, 'utf8');
  assert.match(log, new RegExp(`Kavach — ${dayStamp()}`));
  assert.match(log, /#1 PR 1/);
  assert.match(log, /SQL injection/);
  // Compact codes: H1 = one High; `H/I` = High severity, posted as an Issue.
  assert.match(log, /H1/);
  assert.match(log, /`H\/I`/);
});

test('a second review that day appends rather than replacing', () => {
  appendLog(root, {
    context: context(1),
    findings: [finding()],
    posted: 1,
    reviewUrl: '',
    dryRun: false,
  });
  appendLog(root, {
    context: context(2),
    findings: [],
    posted: 0,
    reviewUrl: '',
    dryRun: false,
  });

  const log = readFileSync(logPath(root), 'utf8');
  assert.equal((log.match(/^### /gm) ?? []).length, 2);
  assert.match(log, /#1 PR 1/);
  assert.match(log, /#2 PR 2/);
  // Only one header and one legend, however many reviews land that day.
  assert.equal((log.match(/^# Kavach —/gm) ?? []).length, 1);
  assert.equal((log.match(/severity C\/H\/M\/L\/S/g) ?? []).length, 1);
});

test('a different day gets its own file', () => {
  const yesterday = new Date(Date.now() - 86_400_000);
  appendLog(root, {
    context: context(1),
    findings: [],
    posted: 0,
    reviewUrl: '',
    dryRun: false,
    at: yesterday,
  });
  appendLog(root, {
    context: context(2),
    findings: [],
    posted: 0,
    reviewUrl: '',
    dryRun: false,
  });

  const days = listLogDays(root);
  assert.equal(days.length, 2);
  // Newest first.
  assert.equal(days[0], dayStamp());
  assert.equal(days[1], dayStamp(yesterday));
});

test('a dry run is logged and labelled as such', () => {
  appendLog(root, {
    context: context(1),
    findings: [finding()],
    posted: 1,
    reviewUrl: '',
    dryRun: true,
  });
  assert.match(readFileSync(logPath(root), 'utf8'), /dry-run/);
});

test('a review with no findings still appears in the log', () => {
  appendLog(root, {
    context: context(9),
    findings: [],
    posted: 0,
    reviewUrl: '',
    dryRun: false,
  });
  const log = readFileSync(logPath(root), 'utf8');
  assert.match(log, /#9 PR 9/);
  assert.match(log, /clean/);
});

test('dropped findings are excluded from the log counts', () => {
  appendLog(root, {
    context: context(1),
    findings: [finding(), finding({ kind: 'dropped', severity: 'Low', title: 'noise' })],
    posted: 1,
    reviewUrl: '',
    dryRun: false,
  });
  const log = readFileSync(logPath(root), 'utf8');
  assert.doesNotMatch(log, /noise/);
  assert.match(log, /H1/);
});

test('a finding line stays on one line however long the title', () => {
  appendLog(root, {
    context: context(1),
    findings: [finding({ title: 'x'.repeat(200) })],
    posted: 1,
    reviewUrl: '',
    dryRun: false,
  });
  const log = readFileSync(logPath(root), 'utf8');
  const findingLines = log.split('\n').filter((l) => l.startsWith('- `'));
  assert.equal(findingLines.length, 1);
  assert.ok(findingLines[0].length < 200, 'title should be trimmed');
});

test('reading a day with no log returns null instead of throwing', () => {
  assert.equal(readLog(root, '1999-01-01'), null);
  assert.deepEqual(listLogDays(root), []);
});

test('unrelated files in the logs dir are ignored', () => {
  mkdirSync(join(root, '.pr-architect', 'logs'), { recursive: true });
  writeFileSync(join(root, '.pr-architect', 'logs', 'notes.md'), 'scratch');
  appendLog(root, {
    context: context(1),
    findings: [],
    posted: 0,
    reviewUrl: '',
    dryRun: false,
  });
  assert.deepEqual(listLogDays(root), [dayStamp()]);
});

process.on('exit', () => {
  try {
    rmSync(root, { recursive: true, force: true });
  } catch {
    // Already gone.
  }
});

process.on('exit', () => {
  rmSync(home, { recursive: true, force: true });
  for (const dir of created) rmSync(dir, { recursive: true, force: true });
});
