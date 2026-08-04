// `kavach publish --run <dir>` — the closing half of the autonomous loop.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { currentUser, setActiveOwner } from '../github/client.ts';
import { fetchReviewComments } from '../github/pr.ts';
import { postReview, type InlineComment } from '../github/publish.ts';
import { resolveFindings } from '../review/dedupe.ts';
import { renderComment } from '../review/policy.ts';
import { notifySuccess } from '../notify/chat.ts';
import { appendHistory, loadConfig, priorFingerprints } from '../store/config.ts';
import { appendLog, type LogEntry } from '../store/log.ts';
import { c } from '../brand.ts';
import {
  KavachError,
  SEVERITIES,
  type KavachConfig,
  type FindingsFile,
  type ResolvedFinding,
  type ReviewContext,
} from '../types.ts';

export interface PublishOptions {
  runDir: string;
  root: string;
  dryRun: boolean;
}

export async function publish(opts: PublishOptions): Promise<void> {
  const context = readJson<ReviewContext>(join(opts.runDir, 'context.json'), 'context.json');
  const findingsFile = readJson<FindingsFile>(join(opts.runDir, 'findings.json'), 'findings.json');

  const { config } = loadConfig(opts.root);
  const { pr } = context;
  setActiveOwner(pr.owner);

  // Existing Kavach comments on this PR, so a re-run stays silent.
  let existingBodies: string[] = [];
  try {
    // Independent requests: serially these cost ~830ms, overlapped ~430ms.
    const [me, comments] = await Promise.all([currentUser(), fetchReviewComments(pr)]);
    existingBodies = comments.filter((cm) => cm.user?.login === me).map((cm) => cm.body);
  } catch {
    // Not fatal — dedupe still has history.json to work from.
  }

  const resolved = resolveFindings({
    findings: findingsFile.findings ?? [],
    files: context.files,
    config,
    priorFingerprints: priorFingerprints(opts.root, pr.number),
    existingBodies,
  });

  const comments: InlineComment[] = resolved.toPost.map((f) => {
    const marker = `\n<!-- kavach:${f.fingerprint} -->`;
    const rendered = renderComment(f, f.kind, f.reviewers);
    // A single comment has the same 65536 limit as the review body, and one
    // oversized comment 422s the whole review.
    const capped =
      rendered.length + marker.length > COMMENT_LIMIT
        ? rendered.slice(0, COMMENT_LIMIT - marker.length - 2) + '…'
        : rendered;
    return { path: f.path, line: f.line, side: 'RIGHT' as const, body: capped + marker };
  });

  const body = reviewBody(context, findingsFile.summary ?? '', resolved, config);

  const allFindings = [...resolved.toPost, ...resolved.overflow, ...resolved.unanchored];

  if (opts.dryRun) {
    process.stderr.write(c.yellow('  dry run — nothing posted\n\n'));
    process.stdout.write(body + '\n\n');
    for (const cm of comments) {
      process.stdout.write(c.grey(`--- ${cm.path}:${cm.line}\n`) + cm.body + '\n\n');
    }
    // Logged even on a dry run, marked as such, so the day's record is complete.
    logReview(opts.root, config, {
      context,
      findings: allFindings,
      posted: comments.length,
      reviewUrl: pr.url,
      dryRun: true,
    });
    return;
  }

  let reviewUrl = pr.url;
  if (comments.length > 0 || body.trim()) {
    const review = await postReview(pr, body, comments);
    reviewUrl = review.html_url;
  }

  appendHistory(opts.root, {
    pr: pr.number,
    headSha: pr.headSha,
    at: new Date().toISOString(),
    fingerprints: resolved.toPost.map((f) => f.fingerprint),
    reported: resolved.toPost.map((f) => ({
      fingerprint: f.fingerprint,
      path: f.path,
      line: f.line,
      title: f.title,
    })),
  });

  logReview(opts.root, config, {
    context,
    findings: allFindings,
    posted: comments.length,
    reviewUrl,
    dryRun: false,
  });

  if (config.notify.googleChat) {
    await notifySuccess(
      context,
      allFindings,
      comments.length,
      findingsFile.summary ?? '',
      config.notify.iconUrl,
    ).catch((err) => {
      // A webhook failure must not fail a review that already posted.
      process.stderr.write(c.yellow(`  Chat notification failed: ${err.message}\n`));
    });
  }

  printSummary(allFindings, comments.length, resolved.duplicates, resolved.dropped, reviewUrl);
}

/**
 * Write the day-wise log, if this project opted in. Opt-in by design: most
 * projects do not want extra files appearing in their tree.
 */
function logReview(root: string, config: KavachConfig, entry: Omit<LogEntry, 'at'>): void {
  if (!config.notify.reviewLog) return;
  try {
    const path = appendLog(root, entry);
    process.stderr.write(c.grey(`  logged to ${path}\n\n`));
  } catch (err) {
    // A log write must never fail a review that already posted.
    process.stderr.write(c.yellow(`  could not write review log: ${(err as Error).message}\n`));
  }
}

const COMMENT_LIMIT = 65536;
const OVERFLOW_LISTED = 25;

function reviewBody(
  context: ReviewContext,
  summary: string,
  resolved: ReturnType<typeof resolveFindings>,
  config: KavachConfig,
): string {
  const { pr, route, budget } = context;
  const lines: string[] = [];

  lines.push(`## Kavach review — ${route.reviewers.join(', ')}`);
  lines.push('');

  // State the obvious up front: a review on a merged PR cannot change anything,
  // and a reader should not have to work out why comments appeared there.
  if (pr.state === 'merged') {
    lines.push('_This pull request is already merged; these comments are for the record._');
    lines.push('');
  } else if (pr.state === 'closed') {
    lines.push('_This pull request is closed._');
    lines.push('');
  } else if (pr.draft) {
    lines.push('_Draft pull request — reviewed as work in progress._');
    lines.push('');
  }

  if (summary.trim()) lines.push(summary.trim());
  lines.push('');
  if (budget.filesIncluded === 0) {
    lines.push(
      'No reviewable files in this pull request — everything changed is generated, ' +
        'binary, or excluded by this project\'s ignore rules.',
    );
  } else {
    lines.push(
      `Reviewed ${budget.filesIncluded} of ${budget.filesIncluded + budget.filesSkipped} changed files` +
        `${budget.filesTruncated ? ` (${budget.filesTruncated} truncated to fit the token budget)` : ''}.`,
    );
  }

  if (resolved.unanchored.length > 0) {
    lines.push('');
    lines.push('### Findings outside the diff');
    for (const f of resolved.unanchored.slice(0, 10)) {
      lines.push(`- \`${f.path}\` — **${f.severity}** ${f.title}`);
    }
  }

  if (resolved.overflow.length > 0) {
    lines.push('');
    lines.push(`### ${resolved.overflow.length} further finding(s) not posted inline`);
    lines.push('');
    lines.push(
      `The inline comment cap is ${config.review.maxComments}. ` +
        'Raise it with `/kavach-config review.maxComments=N` to see these on the diff.',
    );
    lines.push('');
    const shown = resolved.overflow.slice(0, OVERFLOW_LISTED);
    for (const f of shown) {
      lines.push(`- \`${f.path}:${f.line}\` — **${f.severity}** ${f.title}`);
    }
    if (resolved.overflow.length > shown.length) {
      lines.push(`- _and ${resolved.overflow.length - shown.length} more, all Medium or below_`);
    }
  }

  if (resolved.exceededCap) {
    lines.push('');
    lines.push(
      `> Posted ${resolved.toPost.length} comments, above the cap of ${config.review.maxComments}: ` +
        'Critical and High findings are always shown rather than hidden in this summary.',
    );
  }

  lines.push('');
  lines.push(`<sub>Kavach · ${pr.headSha.slice(0, 7)} · non-blocking review</sub>`);

  return capBody(lines.join('\n'));
}

/**
 * GitHub rejects a review whose body exceeds 65536 characters with a 422, which
 * would fail the entire publish — every inline comment included. Truncating is
 * always better than losing the review.
 */
const GITHUB_BODY_LIMIT = 65536;

function capBody(body: string): string {
  if (body.length <= GITHUB_BODY_LIMIT) return body;

  const notice = '\n\n_…summary truncated to fit GitHub\'s size limit._';
  return body.slice(0, GITHUB_BODY_LIMIT - notice.length) + notice;
}

function printSummary(
  all: ResolvedFinding[],
  posted: number,
  duplicates: number,
  dropped: number,
  url: string,
): void {
  const counts = SEVERITIES.map((s) => `${s} ${all.filter((f) => f.severity === s).length}`);
  process.stderr.write(
    '\n  ' +
      c.bold('Kavach') +
      c.grey(` — ${counts.join(' · ')}\n`) +
      c.grey(`  posted ${posted} inline · ${duplicates} deduped · ${dropped} below confidence\n`) +
      c.grey(`  ${url}\n\n`),
  );
}

function readJson<T>(path: string, label: string): T {
  if (!existsSync(path)) {
    throw new KavachError('publish', `Missing ${label} at ${path}. Run \`kavach run <pr-url>\` first.`);
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch (err) {
    throw new KavachError('publish', `${label} is not valid JSON: ${(err as Error).message}`);
  }
}
