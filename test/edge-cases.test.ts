import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stackMismatch } from '../src/commands/run.ts';
import { routeReviewers } from '../src/review/route.ts';
import { applyBudget } from '../src/diff/budget.ts';
import { resolveFindings } from '../src/review/dedupe.ts';
import { renderComment } from '../src/review/policy.ts';
import { parsePatch, commentableLines } from '../src/diff/parse.ts';
import { migrateConfig } from '../src/store/migrate.ts';
import type { ContextFile, Finding, KavachConfig } from '../src/types.ts';

const config: KavachConfig = migrateConfig({}).config;

function file(path: string, language: string, patch = '@@ -1,1 +1,2 @@\n+const a = 1;'): ContextFile {
  const hunks = parsePatch(patch);
  return {
    path,
    status: 'modified',
    additions: 1,
    deletions: 0,
    language,
    truncated: false,
    skipReason: null,
    hunks,
    commentableLines: commentableLines(hunks),
  };
}

// ---------- PR is not for this tech stack ----------

const nextConfig = migrateConfig({
  project: { language: 'typescript', framework: 'next' },
}).config;

test('a foreign-language PR warns the reviewer', () => {
  const warning = stackMismatch(nextConfig, [
    file('api/views.py', 'python'),
    file('api/models.py', 'python'),
  ]);
  assert.match(warning, /configured as typescript/);
  assert.match(warning, /mostly python/);
  assert.match(warning, /general engineering merit/);
});

test('a same-family PR does not warn', () => {
  // .ts and .tsx and .js are all one family — warning here would be noise.
  assert.equal(stackMismatch(nextConfig, [file('a.ts', 'typescript'), file('b.tsx', 'tsx')]), '');
  assert.equal(stackMismatch(nextConfig, [file('legacy.js', 'javascript')]), '');
});

test('one stray script in an otherwise familiar PR does not warn', () => {
  const warning = stackMismatch(nextConfig, [
    file('a.ts', 'typescript'),
    file('b.tsx', 'tsx'),
    file('scripts/deploy.py', 'python'),
  ]);
  assert.equal(warning, '', 'a single foreign file should not trigger the warning');
});

test('config and docs are never treated as a foreign stack', () => {
  const warning = stackMismatch(nextConfig, [
    file('.github/ci.yml', 'yaml'),
    file('README.md', 'markdown'),
    file('data.json', 'json'),
  ]);
  assert.equal(warning, '');
});

test('an unconfigured project never warns', () => {
  const unknown = migrateConfig({ project: { language: 'unknown' } }).config;
  assert.equal(stackMismatch(unknown, [file('a.py', 'python')]), '');
});

test('an unfamiliar stack still routes to something reviewable', () => {
  const route = routeReviewers([file('LEDGER.CBL', 'cbl')], nextConfig);
  assert.ok(route.reviewers.length >= 2, 'must always pick reviewers');
  assert.ok(route.reviewers.includes('architecture'), 'architecture applies to any language');
});

// ---------- too many comments ----------

const manyLines: ContextFile = {
  path: 'src/a.ts',
  status: 'modified',
  additions: 200,
  deletions: 0,
  language: 'typescript',
  truncated: false,
  skipReason: null,
  hunks: [
    {
      header: '@@ -1,1 +1,200 @@',
      lines: Array.from({ length: 200 }, (_, i) => ({
        s: '+' as const,
        new: i + 1,
        t: `const x${i} = ${i};`,
      })),
    },
  ],
  commentableLines: Array.from({ length: 200 }, (_, i) => i + 1),
};

function findings(count: number, severity: Finding['severity']): Finding[] {
  return Array.from({ length: count }, (_, i) => ({
    reviewer: 'security',
    path: 'src/a.ts',
    line: i + 1,
    severity,
    confidence: 0.95,
    verified: true,
    title: `${severity} finding ${i}`,
    body: 'details',
  }));
}

function resolve(list: Finding[], cfg = config) {
  return resolveFindings({
    findings: list,
    files: [manyLines],
    config: cfg,
    priorFingerprints: new Set(),
    existingBodies: [],
  });
}

test('40 Critical findings are all posted despite a cap of 15', () => {
  const out = resolve(findings(40, 'Critical'));
  assert.equal(out.toPost.length, 40);
  assert.equal(out.overflow.length, 0);
  assert.ok(out.exceededCap);
});

test('a flood of Low findings is still capped', () => {
  const out = resolve(findings(100, 'Low'));
  assert.equal(out.toPost.length, config.review.maxComments);
  assert.equal(out.overflow.length, 100 - config.review.maxComments);
  assert.equal(out.exceededCap, false);
});

test('serious findings displace minor ones rather than competing with them', () => {
  const out = resolve([...findings(10, 'High'), ...findings(100, 'Low')]);
  assert.equal(out.toPost.filter((f) => f.severity === 'High').length, 10);
  assert.ok(out.overflow.every((f) => f.severity === 'Low'));
});

test('a maxComments of 0 still posts Critical findings', () => {
  // Someone silencing Kavach entirely should not lose a Critical security bug.
  const silent = migrateConfig({ review: { maxComments: 0 } }).config;
  const out = resolve(findings(3, 'Critical'), silent);
  assert.equal(out.toPost.length, 3);
});

test('a huge comment body is truncated rather than 422-ing the review', () => {
  const body = renderComment(
    {
      reviewer: 'security',
      path: 'a.ts',
      line: 1,
      severity: 'High',
      confidence: 0.9,
      verified: true,
      title: 'x'.repeat(500),
      body: 'y'.repeat(50_000),
      suggestion: 'z'.repeat(50_000),
    },
    'issue',
    ['security'],
  );
  // policy.ts caps title and body; the suggestion block is the only unbounded
  // part, and publish.ts caps the total before sending.
  assert.ok(body.length < 65_536, `comment was ${body.length} chars`);
});

// ---------- nothing to review ----------

test('an empty PR produces no crash and no reviewers panic', () => {
  const route = routeReviewers([], config);
  assert.ok(route.reviewers.length >= 2);

  const { files: out, budget } = applyBudget([], config, route.reviewers);
  assert.deepEqual(out, []);
  assert.equal(budget.filesIncluded, 0);
  assert.equal(budget.totalTokens, 0);
});

test('a PR of only generated files reports zero reviewable', () => {
  const generated = [
    file('package-lock.json', 'json'),
    file('dist/bundle.min.js', 'javascript'),
  ];
  const { budget } = applyBudget(generated, config, ['typescript']);
  assert.equal(budget.filesIncluded, 0);
  assert.equal(budget.filesSkipped, 2);
});

test('a binary-only PR does not crash', () => {
  const binary: ContextFile = {
    ...file('logo.png', 'png', ''),
    skipReason: 'binary',
    hunks: [],
    commentableLines: [],
  };
  const route = routeReviewers([binary], config);
  assert.ok(route.reviewers.length >= 2);
  const { budget } = applyBudget([binary], config, route.reviewers);
  assert.equal(budget.filesIncluded, 0);
});

test('findings on a file that was skipped are demoted, never posted', () => {
  const skipped: ContextFile = { ...file('a.ts', 'typescript'), skipReason: 'budget', hunks: [], commentableLines: [] };
  const out = resolveFindings({
    findings: findings(3, 'Critical'),
    files: [skipped],
    config,
    priorFingerprints: new Set(),
    existingBodies: [],
  });
  assert.equal(out.toPost.length, 0, 'cannot anchor to a file with no diff');
  assert.equal(out.unanchored.length, 3);
});
