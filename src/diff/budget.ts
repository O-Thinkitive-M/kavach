// Token budgeting.
//
// A real 37-file PR (next.js#96490) is 193k tokens of raw patch, and lockfiles were
// 0% of that bloat — it was legitimate large source files. So an ignore list alone
// does not save you: per-file truncation is mandatory.

import { commentableLines } from './parse.ts';
import { fileRelevance } from '../review/route.ts';
import type {
  BudgetResult,
  ContextFile,
  Hunk,
  KavachConfig,
  ReviewerName,
} from '../types.ts';

/**
 * Token estimate without a tokenizer dependency.
 *
 * bytes/4 is the usual rule of thumb for prose, but code tokenizes worse —
 * measured against cl100k on real patches, the true count runs ~13-18% higher
 * (punctuation, identifiers, indentation each split more than English words).
 * The correction keeps the cap honest rather than optimistic.
 */
const CODE_TOKEN_FACTOR = 1.15;

export function estimateTokens(text: string): number {
  return Math.ceil((text.length / 4) * CODE_TOKEN_FACTOR);
}

/**
 * Cost of a file *as Claude will read it* — the serialized JSON, not the raw
 * patch text. The per-line objects (`{"s":"+","new":19,"t":"…"}`) cost roughly
 * 2.3x the diff text they wrap, so budgeting on the patch alone overshoots the
 * cap by ~50% and silently blows the context window on large PRs.
 */
export function fileTokens(file: ContextFile): number {
  return estimateTokens(JSON.stringify(file));
}

const GENERATED = [
  /(^|\/)package-lock\.json$/,
  /(^|\/)yarn\.lock$/,
  /(^|\/)pnpm-lock\.yaml$/,
  /(^|\/)bun\.lockb?$/,
  /(^|\/)composer\.lock$/,
  /(^|\/)Cargo\.lock$/,
  /(^|\/)poetry\.lock$/,
  /(^|\/)go\.sum$/,
  /\.min\.(js|css)$/,
  /\.map$/,
  /\.snap$/,
  /\.pb\.go$/,
  /_pb2\.py$/,
  /(^|\/)__generated__\//,
  /\.generated\./,
  /(^|\/)dist\//,
  /(^|\/)build\//,
  /(^|\/)vendor\//,
];

/**
 * Minimal glob matcher: supports `**`, `*`, `?` and literal segments.
 * Built by scanning rather than chained replaces, so tokens cannot collide.
 */
export function matchesGlob(path: string, glob: string): boolean {
  let source = '';

  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i];

    if (ch === '*') {
      if (glob[i + 1] === '*') {
        if (glob[i + 2] === '/') {
          // `**/` matches zero or more directories, so `**/*.lock` also matches `c.lock`.
          source += '(?:[^/]*/)*';
          i += 2;
        } else {
          source += '.*';
          i += 1;
        }
      } else {
        source += '[^/]*';
      }
    } else if (ch === '?') {
      source += '[^/]';
    } else if ('.+^${}()|[]\\'.includes(ch)) {
      source += '\\' + ch;
    } else {
      source += ch;
    }
  }

  // Anchored, or matching a trailing path segment so `dist/**` catches nested dist/.
  return new RegExp(`^${source}$`).test(path) || new RegExp(`(?:^|/)${source}$`).test(path);
}

function isGenerated(path: string): boolean {
  return GENERATED.some((re) => re.test(path));
}

/** Truncate to whole hunks so line numbers stay valid. */
function truncateFile(file: ContextFile, maxTokens: number): ContextFile {
  const kept: Hunk[] = [];
  let used = 0;

  for (const hunk of file.hunks) {
    // Serialized cost, matching fileTokens — the patch text alone understates it.
    const cost = estimateTokens(JSON.stringify(hunk));
    if (used + cost > maxTokens && kept.length > 0) break;
    kept.push(hunk);
    used += cost;
    if (used >= maxTokens) break;
  }

  if (kept.length === file.hunks.length) return file;

  return {
    ...file,
    hunks: kept,
    truncated: true,
    commentableLines: commentableLines(kept),
  };
}

export function applyBudget(
  files: ContextFile[],
  config: KavachConfig,
  reviewers: ReviewerName[],
): { files: ContextFile[]; budget: BudgetResult } {
  const cap = config.budget.maxContextTokens;
  const perFile = config.budget.maxPerFileTokens;

  const marked = files.map((file) => {
    if (file.skipReason) return file;
    if (config.ignore.some((glob) => matchesGlob(file.path, glob))) {
      return { ...file, skipReason: 'ignored' as const };
    }
    if (isGenerated(file.path)) return { ...file, skipReason: 'generated' as const };
    // Nothing on the RIGHT side means nothing to comment on.
    if (file.status === 'removed') return { ...file, skipReason: 'deleted' as const };
    if (file.hunks.length === 0) {
      return { ...file, skipReason: (file.skipReason ?? 'rename-only') as const };
    }
    return file;
  });

  const candidates = marked.filter((f) => !f.skipReason);

  // Churn is damped: raw size ranges over three orders of magnitude while
  // relevance spans one, so multiplying them directly makes size the only real
  // factor — a 1290-line test helper would outrank a 5-line change to a route
  // handler. log2 flattens that so relevance decides among comparable files.
  const ranked = candidates
    .map((file) => ({
      file,
      score: Math.log2(2 + file.additions + file.deletions) * fileRelevance(file, reviewers),
    }))
    .sort((a, b) => b.score - a.score);

  const included = new Map<string, ContextFile>();
  let total = 0;
  let truncatedCount = 0;

  for (const { file } of ranked) {
    if (included.size >= config.budget.maxFiles) break;

    const capped = fileTokens(file) > perFile ? truncateFile(file, perFile) : file;
    const cost = fileTokens(capped);

    // Always admit the top-ranked file, even if it alone exceeds the cap —
    // reviewing the most relevant file matters more than a strict ceiling.
    if (total + cost > cap && included.size > 0) continue;

    if (capped.truncated) truncatedCount++;
    included.set(file.path, capped);
    total += cost;
  }

  const out = marked.map((file) => {
    if (file.skipReason) return { ...file, hunks: [], commentableLines: [] };
    const kept = included.get(file.path);
    if (kept) return kept;
    // Dropped for budget: keep the name so the summary can report it honestly.
    return { ...file, skipReason: 'budget' as const, hunks: [], commentableLines: [] };
  });

  return {
    files: out,
    budget: {
      totalTokens: total,
      filesIncluded: included.size,
      filesSkipped: out.length - included.size,
      filesTruncated: truncatedCount,
      cap,
    },
  };
}
