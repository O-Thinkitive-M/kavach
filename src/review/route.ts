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
  [/\b(password|secret|token|jwt|apiKey|api_key|crypto|hash|encrypt)\b/i, 'security', 'credential handling'],
  [/\b(eval|innerHTML|dangerouslySetInnerHTML|exec|child_process)\b/, 'security', 'dangerous APIs'],
  [/\b(SELECT|INSERT|UPDATE|DELETE)\b.*\b(FROM|INTO|SET)\b/i, 'security', 'raw SQL'],
  [/for\s*\(.*\)\s*\{[^}]*await|\.map\(.*await/s, 'performance', 'await inside a loop'],
  [/\b(useMemo|useCallback|memo|lazy|Suspense)\b/, 'performance', 'memoization APIs'],
  [/\baria-|role=|tabIndex|alt=/, 'accessibility', 'ARIA/semantic attributes'],
  [/<div[^>]*onClick|<span[^>]*onClick/, 'accessibility', 'click handlers on non-interactive elements'],
  [/\b(describe|it|test|expect)\s*\(/, 'testing', 'test blocks'],
  [/\b(interface|type|enum|generic|extends|implements)\b/, 'typescript', 'type declarations'],
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

    const added = addedLines(file.hunks)
      .map((l) => l.t)
      .join('\n');
    for (const [pattern, reviewer, why] of CONTENT_SIGNALS) {
      if (pattern.test(added)) bump(reviewer, 3, why);
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

/** Relevance multiplier used by the budget to rank files. */
export function fileRelevance(file: ContextFile, selected: ReviewerName[]): number {
  const ext = file.path.split('.').pop()?.toLowerCase() ?? '';
  const forExt = EXT_REVIEWERS[ext] ?? [];
  const overlap = forExt.filter((r) => selected.includes(r)).length;

  let score = 1 + overlap;
  for (const [pattern, reviewer] of PATH_SIGNALS) {
    if (selected.includes(reviewer) && pattern.test(file.path)) score += 1;
  }
  return score;
}
