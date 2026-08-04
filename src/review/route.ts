// Adaptive reviewer routing.
//
// Running all 8 reviewers on every PR is slow and token-heavy. Scoring is pure and
// deterministic so routing is unit-testable and debuggable without an LLM.

import { addedLines, removedLines } from '../diff/parse.ts';
import {
  REVIEWERS,
  type ContextFile,
  type KavachConfig,
  type ReviewMode,
  type ReviewerName,
  type RouteResult,
} from '../types.ts';

const EXT_REVIEWERS: Record<string, ReviewerName[]> = {
  tsx: ['react', 'typescript'],
  jsx: ['react'],
  ts: ['typescript'],
  mts: ['typescript'],
  cts: ['typescript'],
  js: ['architecture'],
  mjs: ['architecture'],
  vue: ['react', 'accessibility'],
  svelte: ['react', 'accessibility'],
  css: ['accessibility'],
  scss: ['accessibility'],
  html: ['accessibility'],
  py: ['architecture', 'business-logic'],
  go: ['architecture', 'business-logic'],
  java: ['architecture', 'business-logic'],
  kt: ['architecture', 'business-logic'],
  rb: ['architecture', 'business-logic'],
  php: ['architecture', 'business-logic'],
  rs: ['architecture', 'performance'],
  cs: ['architecture', 'business-logic'],
  sql: ['performance', 'business-logic'],
  tf: ['security'],
  yml: ['security'],
  yaml: ['security'],
};

/** Files whose content is prose or data, where code regexes only misfire. */
const PROSE_EXT = new Set(['md', 'mdx', 'txt', 'rst', 'json', 'yaml', 'yml', 'lock', 'csv', 'svg']);

const PATH_SIGNALS: Array<[RegExp, ReviewerName, string]> = [
  [/(^|\/)(auth|login|session|oauth|token)/i, 'security', 'auth-related paths'],
  [/(^|\/)(api|routes?|controllers?|handlers?)\//i, 'security', 'API surface'],
  [/(^|\/)middleware/i, 'security', 'middleware'],
  [/\.env|secrets?|credential/i, 'security', 'secret-adjacent files'],
  [/(^|\/)migrations?\//i, 'business-logic', 'database migrations'],
  [/(^|\/)(models?|entities|schema)\//i, 'business-logic', 'data models'],
  [/(^|\/)(tests?|spec|__tests__)\//i, 'testing', 'test files'],
  [/\.(test|spec)\./i, 'testing', 'test files'],
  [/(^|\/)(components?|ui|views?|pages?)\//i, 'accessibility', 'UI components'],
  [/(^|\/)(hooks?)\//i, 'react', 'hooks'],
  [/(^|\/)(queries|db|database|repository)\//i, 'performance', 'data-access code'],
];

const CONTENT_SIGNALS: Array<[RegExp, ReviewerName, string]> = [
  [/\buse(Effect|State|Memo|Callback|Ref|Context|Reducer)\b/, 'react', 'React hooks'],
  [/\b(useLayoutEffect|StrictMode|createPortal)\b/, 'react', 'React lifecycle APIs'],
  // Anchored to code shapes (assignment, property, call) so ordinary prose like
  // "a token of appreciation" does not route a docs PR to the security reviewer.
  [
    /\b(password|secret|apiKey|api_key|jwt|accessToken|refreshToken)\s*[:=]|\.(password|secret|token)\b|\bcrypto\.|\bbcrypt\b/,
    'security',
    'credential handling',
  ],
  [/\b(eval|innerHTML|dangerouslySetInnerHTML|child_process)\b|\bexec\s*\(/, 'security', 'dangerous APIs'],
  // Case-sensitive and same-line: real SQL is uppercase by convention, and the
  // case-insensitive version matched "We UPDATE the docs from time to time".
  [/\b(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM)\b[^\n]*\b(FROM|INTO|SET|WHERE|VALUES)\b/, 'security', 'raw SQL'],
  [/for\s*\(.*\)\s*\{[^}]*await|\.map\(.*await/s, 'performance', 'await inside a loop'],
  [/\b(useMemo|useCallback|memo|lazy|Suspense)\b/, 'performance', 'memoization APIs'],
  [/\baria-|role=|tabIndex|alt=/, 'accessibility', 'ARIA/semantic attributes'],
  [/<div[^>]*onClick|<span[^>]*onClick/, 'accessibility', 'click handlers on non-interactive elements'],
  [/^\s*(describe|it|test|expect)\s*\(|\bexpect\([^)]*\)\.\w/, 'testing', 'test blocks'],
  // Declaration shapes, not the English words "type" or "generic".
  [
    /\b(interface\s+[A-Z]|type\s+[A-Z]\w*\s*=|enum\s+[A-Z]|extends\s+[A-Z]|implements\s+[A-Z])/,
    'typescript',
    'type declarations',
  ],
  [/\bas any\b|\b: any\b|@ts-ignore|@ts-expect-error/, 'typescript', 'type escapes'],
];

export function routeReviewers(
  files: ContextFile[],
  config: KavachConfig,
  mode: ReviewMode = 'standard',
): RouteResult {
  const scores = new Map<ReviewerName, number>();
  const reasons = new Map<ReviewerName, Set<string>>();

  const bump = (reviewer: ReviewerName, points: number, why: string) => {
    scores.set(reviewer, (scores.get(reviewer) ?? 0) + points);
    if (!reasons.has(reviewer)) reasons.set(reviewer, new Set());
    reasons.get(reviewer)!.add(why);
  };

  const reviewable = files.filter((f) => f.skipReason !== 'ignored' && f.hunks.length > 0);
  const extCounts = new Map<string, number>();

  for (const file of reviewable) {
    const ext = file.path.split('.').pop()?.toLowerCase() ?? '';
    extCounts.set(ext, (extCounts.get(ext) ?? 0) + 1);

    for (const [pattern, reviewer, why] of PATH_SIGNALS) {
      if (pattern.test(file.path)) bump(reviewer, 3, why);
    }

    // Content signals describe code shapes, so running them over markdown or
    // JSON produces confident nonsense — a docs-only PR was routing to the
    // SQL-injection reviewer.
    if (!PROSE_EXT.has(ext)) {
      const added = addedLines(file.hunks).map((l) => l.t);
      for (const [pattern, reviewer, why] of CONTENT_SIGNALS) {
        // Per line: a `.*` across joined lines matched a SELECT on line 1
        // against a FROM 400 lines later.
        if (added.some((line) => pattern.test(line))) bump(reviewer, 3, why);
      }
    }

    // Substantial deletions are the strongest regression signal we have.
    const removed = removedLines(file.hunks).filter((l) => l.t.trim().length > 3);
    if (removed.length > 20) {
      bump('business-logic', 4, `${removed.length} lines removed from ${file.path}`);
    }
  }

  // Log-damped so a 200-file PR does not select every reviewer.
  for (const [ext, count] of extCounts) {
    for (const reviewer of EXT_REVIEWERS[ext] ?? []) {
      bump(reviewer, 2 * (1 + Math.log10(count)), `${count} .${ext} file${count > 1 ? 's' : ''}`);
    }
  }

  for (const forced of config.review.alwaysReviewers) {
    if (isReviewer(forced)) bump(forced, 100, 'always-on in config');
  }

  const excluded = new Set(config.review.neverReviewers);
  const limit = mode === 'deep' ? 6 : 4;

  const ranked = [...scores.entries()]
    .filter(([reviewer]) => !excluded.has(reviewer))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([reviewer]) => reviewer);

  const selected = ranked.slice(0, limit);

  // Always review something: architecture applies to any stack.
  for (const fallback of ['architecture', 'business-logic'] as ReviewerName[]) {
    if (selected.length >= 2) break;
    if (!selected.includes(fallback) && !excluded.has(fallback)) {
      selected.push(fallback);
      if (!reasons.has(fallback)) reasons.set(fallback, new Set(['default coverage']));
    }
  }

  return {
    reviewers: selected,
    mode,
    reasons: Object.fromEntries(
      selected.map((r) => [r, [...(reasons.get(r) ?? ['default coverage'])].slice(0, 3).join('; ')]),
    ),
  };
}

function isReviewer(name: string): name is ReviewerName {
  return (REVIEWERS as string[]).includes(name);
}

/** Test fixtures and helpers: real files, but the last thing a reviewer needs. */
const LOW_VALUE_PATH = /(^|\/)(__(tests?|mocks?|fixtures?|snapshots?)__|fixtures?|mocks?|e2e)\//i;
const HELPER_FILE = /\.(util|helper|fixture|mock|stub)\.[jt]sx?$/i;
const TEST_FILE = /\.(test|spec)\.[jt]sx?$|(^|\/)(tests?|specs?)\//i;

/**
 * Relevance multiplier used by the budget to rank files.
 *
 * The spread matters as much as the ordering: the budget multiplies this by a
 * damped churn term, so a narrow 1–3 range would let a large test helper outrank
 * a small change to production code. Application source must win.
 */
export function fileRelevance(file: ContextFile, selected: ReviewerName[]): number {
  const ext = file.path.split('.').pop()?.toLowerCase() ?? '';
  const forExt = EXT_REVIEWERS[ext] ?? [];
  const overlap = forExt.filter((r) => selected.includes(r)).length;

  let score = 2 + overlap * 2;
  for (const [pattern, reviewer] of PATH_SIGNALS) {
    if (selected.includes(reviewer) && pattern.test(file.path)) score += 2;
  }

  // Docs and data carry little review value relative to their size.
  if (['md', 'mdx', 'txt', 'json', 'yaml', 'yml', 'lock'].includes(ext)) score *= 0.4;

  // Test code is worth reviewing, but a bug in production code is worth more.
  // Applied even when the `testing` reviewer ran, otherwise a test-heavy PR
  // crowds out the source files those tests exercise.
  if (HELPER_FILE.test(file.path)) score *= 0.2;
  else if (TEST_FILE.test(file.path) || LOW_VALUE_PATH.test(file.path)) score *= 0.35;
  else score *= 1.5; // production code

  return Math.max(0.2, score);
}
