import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routeReviewers, fileRelevance } from '../src/review/route.ts';
import { applyBudget, matchesGlob, estimateTokens, fileTokens } from '../src/diff/budget.ts';
import { resolveFindings, fingerprint } from '../src/review/dedupe.ts';
import { classify, renderComment, higherSeverity } from '../src/review/policy.ts';
import { migrateConfig } from '../src/store/migrate.ts';
import { parsePatch, commentableLines } from '../src/diff/parse.ts';
import { detectConfig } from '../src/detect.ts';
import type { ContextFile, Finding, KavachConfig } from '../src/types.ts';

const config: KavachConfig = migrateConfig({}).config;

function file(path: string, patch: string, extra: Partial<ContextFile> = {}): ContextFile {
  const hunks = parsePatch(patch);
  return {
    path,
    status: 'modified',
    additions: hunks.flatMap((h) => h.lines).filter((l) => l.s === '+').length,
    deletions: hunks.flatMap((h) => h.lines).filter((l) => l.s === '-').length,
    language: path.split('.').pop() ?? '',
    truncated: false,
    skipReason: null,
    hunks,
    commentableLines: commentableLines(hunks),
    ...extra,
  };
}

const REACT_PATCH = `@@ -1,3 +1,6 @@
 import React from 'react';
+useEffect(() => {
+  setCount(1);
+}, []);`;

// ---------- routing ----------

test('routes .tsx with hooks to react and typescript', () => {
  const route = routeReviewers([file('src/App.tsx', REACT_PATCH)], config);
  assert.ok(route.reviewers.includes('react'));
  assert.ok(route.reviewers.length >= 2 && route.reviewers.length <= 4);
});

test('routes auth paths to security', () => {
  const route = routeReviewers([file('src/auth/login.ts', REACT_PATCH)], config);
  assert.ok(route.reviewers.includes('security'));
});

test('heavy deletions pull in business-logic', () => {
  const deletions = Array.from({ length: 25 }, (_, i) => `-  const removed${i} = compute();`).join('\n');
  const route = routeReviewers([file('src/checkout.go', `@@ -1,30 +1,1 @@\n${deletions}\n+ok`)], config);
  assert.ok(route.reviewers.includes('business-logic'));
});

test('never selects more than 4 reviewers in standard mode', () => {
  const files = [
    file('src/a.tsx', REACT_PATCH),
    file('src/auth/b.ts', '@@ -1,1 +1,2 @@\n+const password = getSecret();'),
    file('src/c.test.ts', '@@ -1,1 +1,2 @@\n+it("works", () => {});'),
    file('src/ui/d.tsx', '@@ -1,1 +1,2 @@\n+<div onClick={go} aria-hidden />'),
    file('db/queries/e.sql', '@@ -1,1 +1,2 @@\n+SELECT * FROM users;'),
  ];
  assert.ok(routeReviewers(files, config).reviewers.length <= 4);
});

test('deep mode allows up to 6', () => {
  const files = [
    file('src/a.tsx', REACT_PATCH),
    file('src/auth/b.ts', '@@ -1,1 +1,2 @@\n+const jwt = sign(x);'),
    file('src/c.test.ts', '@@ -1,1 +1,2 @@\n+expect(1).toBe(1);'),
    file('src/ui/d.tsx', '@@ -1,1 +1,2 @@\n+<div onClick={go} />'),
  ];
  assert.ok(routeReviewers(files, config, 'deep').reviewers.length <= 6);
});

test('always keeps at least 2 reviewers even for an unknown stack', () => {
  const route = routeReviewers([file('README.txt', '@@ -1,1 +1,2 @@\n+hello')], config);
  assert.ok(route.reviewers.length >= 2);
});

test('neverReviewers is respected', () => {
  const custom = { ...config, review: { ...config.review, alwaysReviewers: [], neverReviewers: ['react'] } };
  const route = routeReviewers([file('src/App.tsx', REACT_PATCH)], custom);
  assert.ok(!route.reviewers.includes('react'));
});

test('alwaysReviewers forces inclusion', () => {
  const custom = { ...config, review: { ...config.review, alwaysReviewers: ['accessibility'] } };
  const route = routeReviewers([file('main.go', '@@ -1,1 +1,2 @@\n+func main() {}')], custom);
  assert.ok(route.reviewers.includes('accessibility'));
});

test('every selected reviewer carries a reason', () => {
  const route = routeReviewers([file('src/App.tsx', REACT_PATCH)], config);
  for (const r of route.reviewers) assert.ok(route.reasons[r]?.length > 0, `${r} has no reason`);
});

test('prose does not trigger code-shaped reviewers', () => {
  // Regression: /(SELECT|UPDATE).*(FROM|SET)/i matched "We UPDATE the docs from
  // time to time", routing a docs-only PR to the SQL-injection reviewer.
  const noSecurity = { ...config, review: { ...config.review, alwaysReviewers: [] } };
  const docs = file(
    'README.md',
    '@@ -1,1 +1,3 @@\n+You can SELECT a plan FROM the pricing page.\n+We UPDATE the docs from time to time.',
  );
  assert.ok(!routeReviewers([docs], noSecurity).reviewers.includes('security'));
});

test('real SQL in source still triggers security', () => {
  const noSecurity = { ...config, review: { ...config.review, alwaysReviewers: [] } };
  const code = file(
    'src/db.ts',
    '@@ -1,1 +1,2 @@\n+const rows = await db.query(`SELECT id FROM users WHERE name = ${name}`);',
  );
  assert.ok(routeReviewers([code], noSecurity).reviewers.includes('security'));
});

test('a signal split across distant lines does not match', () => {
  // Regression: added lines were joined with \n and matched with `.*`, so a
  // SELECT on line 1 paired with a FROM hundreds of lines later.
  const noSecurity = { ...config, review: { ...config.review, alwaysReviewers: [] } };
  const patch =
    '@@ -1,1 +1,5 @@\n+const SELECT = 1;\n+const a = 2;\n+const b = 3;\n+// pull FROM the queue';
  assert.ok(!routeReviewers([file('src/a.ts', patch)], noSecurity).reviewers.includes('security'));
});

// ---------- budget ----------

test('production source outranks a much larger test helper', () => {
  // Regression: score was churn x relevance, and churn spans three orders of
  // magnitude — so on a real 37-file PR every application source file was
  // dropped and Claude saw only test helpers.
  const helper = file(
    'test/e2e/big-suite.util.ts',
    `@@ -1,1 +1,400 @@\n${Array.from({ length: 400 }, (_, i) => `+  const line${i} = ${i};`).join('\n')}`,
  );
  const source = file('src/server/handler.ts', '@@ -1,1 +1,3 @@\n+const x = compute();\n+return x;');

  const tight = { ...config, budget: { ...config.budget, maxContextTokens: 3000 } };
  const { files: out } = applyBudget([helper, source], tight, ['typescript', 'testing']);

  const kept = out.find((f) => f.path === source.path);
  assert.equal(kept?.skipReason, null, 'source file was dropped in favour of a test helper');
});

test('relevance ranks source above tests above fixtures', () => {
  const source = file('src/api/handler.ts', '@@ -1,1 +1,2 @@\n+const a = 1;');
  const spec = file('src/api/handler.test.ts', '@@ -1,1 +1,2 @@\n+expect(a).toBe(1);');
  const fixture = file('test/fixtures/data.util.ts', '@@ -1,1 +1,2 @@\n+export const d = 1;');

  const rSource = fileRelevance(source, ['typescript', 'testing']);
  const rSpec = fileRelevance(spec, ['typescript', 'testing']);
  const rFixture = fileRelevance(fixture, ['typescript', 'testing']);

  assert.ok(rSource > rSpec, `source ${rSource} should beat spec ${rSpec}`);
  assert.ok(rSpec > rFixture, `spec ${rSpec} should beat fixture ${rFixture}`);
});

test('the budget measures the JSON Claude reads, not the raw patch', () => {
  // Regression: costing hunksToPatch() understated the real payload by ~50%,
  // because the per-line JSON objects cost ~2.3x the text they wrap.
  const f = file(
    'src/a.ts',
    `@@ -1,1 +1,50 @@\n${Array.from({ length: 50 }, (_, i) => `+const x${i} = ${i};`).join('\n')}`,
  );
  const reported = fileTokens(f);
  const serialized = JSON.stringify(f).length / 4;
  const patchOnly = JSON.stringify(f.hunks.flatMap((h) => h.lines).map((l) => l.t)).length / 4;

  // Must cost the serialized form, which is far larger than the text alone...
  assert.ok(reported > patchOnly * 1.5, `${reported} should exceed raw text cost ${patchOnly}`);
  // ...and land within the correction factor of plain bytes/4, never under it.
  assert.ok(reported >= serialized, 'estimate must not undercount what is written');
  assert.ok(reported <= serialized * 1.25, `${reported} unreasonably above ${serialized}`);
});

test('lockfiles and generated files are dropped', () => {
  const files = [
    file('package-lock.json', '@@ -1,1 +1,2 @@\n+{"a":1}'),
    file('dist/bundle.min.js', '@@ -1,1 +1,2 @@\n+var a=1;'),
    file('src/real.ts', '@@ -1,1 +1,2 @@\n+const x = 1;'),
  ];
  const { files: out } = applyBudget(files, config, ['typescript']);
  assert.equal(out.find((f) => f.path === 'package-lock.json')?.skipReason, 'generated');
  assert.equal(out.find((f) => f.path === 'dist/bundle.min.js')?.skipReason, 'generated');
  assert.equal(out.find((f) => f.path === 'src/real.ts')?.skipReason, null);
});

test('deleted files are skipped — nothing to comment on', () => {
  const files = [file('src/gone.ts', '@@ -1,3 +0,0 @@\n-a\n-b\n-c', { status: 'removed' })];
  assert.equal(applyBudget(files, config, ['typescript']).files[0].skipReason, 'deleted');
});

test('a huge single file is truncated to whole hunks, not dropped', () => {
  const hunks = Array.from(
    { length: 60 },
    (_, i) => `@@ -${i * 20 + 1},5 +${i * 20 + 1},6 @@\n+${'x'.repeat(600)}`,
  ).join('\n');
  const { files: out, budget } = applyBudget([file('src/big.ts', hunks)], config, ['typescript']);
  assert.equal(out[0].truncated, true);
  assert.equal(budget.filesTruncated, 1);
  // Truncation keeps whole hunks, so remaining lines still have valid numbers.
  assert.ok(out[0].commentableLines.length > 0);
  assert.ok(out[0].commentableLines.every((n) => Number.isInteger(n) && n > 0));
});

test('total stays within the cap and reports honestly', () => {
  const files = Array.from({ length: 40 }, (_, i) =>
    file(`src/f${i}.ts`, `@@ -1,5 +1,6 @@\n+${'y'.repeat(4000)}`),
  );
  const { budget } = applyBudget(files, config, ['typescript']);
  assert.ok(budget.totalTokens <= config.budget.maxContextTokens, `${budget.totalTokens} over cap`);
  assert.equal(budget.filesIncluded + budget.filesSkipped, 40);
});

test('skipped files keep their name for honest reporting', () => {
  const files = Array.from({ length: 40 }, (_, i) =>
    file(`src/f${i}.ts`, `@@ -1,5 +1,6 @@\n+${'y'.repeat(4000)}`),
  );
  const { files: out } = applyBudget(files, config, ['typescript']);
  const skipped = out.filter((f) => f.skipReason === 'budget');
  assert.ok(skipped.length > 0);
  assert.ok(skipped.every((f) => f.path.length > 0 && f.hunks.length === 0));
});

test('matchesGlob handles ** and nested paths', () => {
  assert.ok(matchesGlob('a/b/c.lock', '**/*.lock'));
  assert.ok(matchesGlob('dist/x/y.js', 'dist/**'));
  assert.ok(matchesGlob('x.min.js', '**/*.min.js'));
  assert.ok(!matchesGlob('src/index.ts', 'dist/**'));
});

test('estimateTokens scales with length', () => {
  assert.ok(estimateTokens('x'.repeat(4000)) >= 900);
});

// ---------- policy ----------

function finding(over: Partial<Finding> = {}): Finding {
  return {
    reviewer: 'typescript',
    path: 'src/a.ts',
    line: 2,
    severity: 'High',
    confidence: 0.9,
    verified: true,
    title: 'Null deref',
    body: 'value may be null',
    ...over,
  };
}

test('confidence maps to issue / suggestion / question / dropped', () => {
  assert.equal(classify(finding({ confidence: 0.95, verified: true }), config), 'issue');
  assert.equal(classify(finding({ confidence: 0.95, verified: false }), config), 'suggestion');
  assert.equal(classify(finding({ confidence: 0.65 }), config), 'question');
  assert.equal(classify(finding({ confidence: 0.2 }), config), 'dropped');
});

test('out-of-range confidence is clamped, not trusted', () => {
  assert.equal(classify(finding({ confidence: 5 }), config), 'issue');
  assert.equal(classify(finding({ confidence: -1 }), config), 'dropped');
  assert.equal(classify(finding({ confidence: NaN }), config), 'dropped');
});

test('questions actually read as questions', () => {
  const body = renderComment(finding({ confidence: 0.6 }), 'question', ['react']);
  assert.match(body, /Question/);
  assert.match(body, /\?/);
});

test('issues are labelled with severity and never phrased as questions', () => {
  const body = renderComment(finding(), 'issue', ['typescript']);
  assert.match(body, /Kavach · High/);
  assert.doesNotMatch(body, /Can you confirm/);
});

test('long titles and bodies are truncated', () => {
  const body = renderComment(
    finding({ title: 'T'.repeat(200), body: 'B'.repeat(2000) }),
    'issue',
    ['typescript'],
  );
  assert.ok(body.length < 900, `body was ${body.length} chars`);
  assert.match(body, /…/);
});

test('regressionOf is surfaced for business-logic findings', () => {
  const body = renderComment(
    finding({ reviewer: 'business-logic', regressionOf: 'returned early when empty' }),
    'issue',
    ['business-logic'],
  );
  assert.match(body, /Previous behavior/);
});

test('higherSeverity prefers the more severe', () => {
  assert.equal(higherSeverity('Medium', 'Critical'), 'Critical');
  assert.equal(higherSeverity('Low', 'Suggestion'), 'Low');
});

// ---------- dedupe ----------

const files = [file('src/a.ts', '@@ -1,2 +1,3 @@\n const a = 1;\n+const b = risky();')];

function resolve(findings: Finding[], prior = new Set<string>(), existing: string[] = []) {
  return resolveFindings({ findings, files, config, priorFingerprints: prior, existingBodies: existing });
}

test('a finding on a commentable line is posted', () => {
  const out = resolve([finding({ path: 'src/a.ts', line: 2 })]);
  assert.equal(out.toPost.length, 1);
});

test('the same finding from two reviewers collapses into one comment', () => {
  const out = resolve([
    finding({ path: 'src/a.ts', line: 2, reviewer: 'typescript' }),
    finding({ path: 'src/a.ts', line: 2, reviewer: 'security', severity: 'Critical' }),
  ]);
  assert.equal(out.toPost.length, 1);
  assert.equal(out.toPost[0].reviewers.length, 2);
  // Merging keeps the more severe classification.
  assert.equal(out.toPost[0].severity, 'Critical');
});

test('a fingerprint already posted is not reposted', () => {
  const f = finding({ path: 'src/a.ts', line: 2 });
  const fp = fingerprint(f, 'const b = risky();');
  assert.equal(resolve([f], new Set([fp])).toPost.length, 0);
});

test('a small line shift does not cause a repost', () => {
  // Same finding, same code, drifted a few lines by an edit above it.
  const before = fingerprint(finding({ line: 2 }), 'const b = risky();');
  const after = fingerprint(finding({ line: 7 }), 'const b = risky();');
  assert.equal(before, after);
});

test('two defects far apart on identical code stay separate', () => {
  // `return null;` and `}` recur constantly. Without a line component these
  // collapse into one and the second finding is silently dropped.
  const first = fingerprint(finding({ line: 10 }), 'return null;');
  const second = fingerprint(finding({ line: 90 }), 'return null;');
  assert.notEqual(first, second);
});

test('an existing comment body containing the fingerprint suppresses a repost', () => {
  const f = finding({ path: 'src/a.ts', line: 2 });
  const fp = fingerprint(f, 'const b = risky();');
  assert.equal(resolve([f], new Set(), [`old comment <!-- kavach:${fp} -->`]).toPost.length, 0);
});

test('a line outside the diff is demoted, never posted', () => {
  const out = resolve([finding({ path: 'src/a.ts', line: 999 })]);
  assert.equal(out.toPost.length, 0);
  assert.equal(out.unanchored.length, 1);
});

test('maxComments caps ordinary findings and the rest overflow', () => {
  const many = Array.from({ length: 30 }, (_, i) =>
    finding({ path: 'src/a.ts', line: 2, title: `Issue ${i}`, severity: 'Medium' }),
  );
  const out = resolve(many);
  assert.equal(out.toPost.length, config.review.maxComments);
  assert.ok(out.overflow.length > 0);
  assert.equal(out.exceededCap, false);
});

test('Critical and High findings are never hidden by the cap', () => {
  // A PR with 40 Critical issues must not post 15 and bury 25 in a summary
  // that is itself truncated — those findings would vanish entirely.
  const criticals = Array.from({ length: 40 }, (_, i) =>
    finding({ path: 'src/a.ts', line: 2, title: `Critical ${i}`, severity: 'Critical' }),
  );
  const out = resolve(criticals);

  assert.equal(out.toPost.length, 40, 'every Critical should be posted');
  assert.equal(out.overflow.filter((f) => f.severity === 'Critical').length, 0);
  assert.ok(out.exceededCap, 'should flag that the cap was deliberately exceeded');
});

test('serious findings take the inline slots ahead of minor ones', () => {
  const mixed = [
    ...Array.from({ length: 5 }, (_, i) =>
      finding({ path: 'src/a.ts', line: 2, title: `High ${i}`, severity: 'High' }),
    ),
    ...Array.from({ length: 40 }, (_, i) =>
      finding({ path: 'src/a.ts', line: 2, title: `Low ${i}`, severity: 'Low' }),
    ),
  ];
  const out = resolve(mixed);

  assert.equal(out.toPost.filter((f) => f.severity === 'High').length, 5);
  assert.equal(out.toPost.length, config.review.maxComments);
  // Overflow is only ever the less serious material.
  assert.ok(out.overflow.every((f) => f.severity === 'Low'));
});

test('findings are ordered most severe first', () => {
  const out = resolve([
    finding({ path: 'src/a.ts', line: 2, severity: 'Low', title: 'low' }),
    finding({ path: 'src/a.ts', line: 2, severity: 'Critical', title: 'crit' }),
  ]);
  assert.equal(out.toPost[0].severity, 'Critical');
});

test('low-confidence findings are dropped and counted', () => {
  const out = resolve([finding({ path: 'src/a.ts', line: 2, confidence: 0.1 })]);
  assert.equal(out.toPost.length, 0);
  assert.equal(out.dropped, 1);
});

// ---------- config migration ----------

test('schema 1 migrates to 2 and preserves user settings', () => {
  const { config: out, changed } = migrateConfig({
    schema: 1,
    review: { maxComments: 99, alwaysReviewers: ['security'] },
    ignore: ['custom/**'],
  });
  assert.equal(out.schema, 2);
  assert.equal(changed, true);
  assert.equal(out.review.maxComments, 99);
  assert.deepEqual(out.ignore, ['custom/**']);
  assert.equal(out.notify.onError, true);
  assert.ok(out.budget.maxContextTokens > 0);
});

test('a hand-edited partial config is backfilled rather than rejected', () => {
  const { config: out } = migrateConfig({ schema: 2, review: { maxComments: 3 } });
  assert.equal(out.review.maxComments, 3);
  assert.equal(out.review.minConfidenceForIssue, 0.8);
  assert.ok(Array.isArray(out.ignore));
});

// ---------- detection ----------

test('detects this repo without asking anything', () => {
  const detected = detectConfig(process.cwd());
  assert.equal(detected.schema, 2);
  assert.ok(detected.ignore.length > 0);
  assert.ok(detected.review.maxComments > 0);
});
