// `kavach publish --run <dir>` — the closing half of the autonomous loop.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { currentUser } from '../github/client.ts';
import { fetchReviewComments } from '../github/pr.ts';
import { postReview, type InlineComment } from '../github/publish.ts';
import { resolveFindings } from '../review/dedupe.ts';
import { renderComment } from '../review/policy.ts';
import { notifySuccess } from '../notify/chat.ts';
import { appendHistory, loadConfig, priorFingerprints } from '../store/config.ts';
import { c } from '../brand.ts';
import {
  KavachError,
  SEVERITIES,
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

  // Existing Kavach comments on this PR, so a re-run stays silent.
  let existingBodies: string[] = [];
  try {
    const me = await currentUser();
    const comments = await fetchReviewComments(pr);
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

  const comments: InlineComment[] = resolved.toPost.map((f) => ({
    path: f.path,
    line: f.line,
    side: 'RIGHT',
    body: renderComment(f, f.kind, f.reviewers) + `\n<!-- kavach:${f.fingerprint} -->`,
  }));

  const body = reviewBody(context, findingsFile.summary ?? '', resolved);

  if (opts.dryRun) {
    process.stderr.write(c.yellow('  dry run — nothing posted\n\n'));
    process.stdout.write(body + '\n\n');
    for (const cm of comments) {
      process.stdout.write(c.grey(`--- ${cm.path}:${cm.line}\n`) + cm.body + '\n\n');
    }
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
  });

  const all = [...resolved.toPost, ...resolved.overflow, ...resolved.unanchored];
  await notifySuccess(context, all, comments.length, findingsFile.summary ?? '', config.notify.iconUrl)
    .catch((err) => {
      // A webhook failure must not fail a review that already posted.
      process.stderr.write(c.yellow(`  Chat notification failed: ${err.message}\n`));
    });

  printSummary(all, comments.length, resolved.duplicates, resolved.dropped, reviewUrl);
}

function reviewBody(
  context: ReviewContext,
  summary: string,
  resolved: ReturnType<typeof resolveFindings>,
): string {
  const { pr, route, budget } = context;
  const lines: string[] = [];

  lines.push(`## Kavach review — ${route.reviewers.join(', ')}`);
  lines.push('');
  if (summary.trim()) lines.push(summary.trim());
  lines.push('');
  lines.push(
    `Reviewed ${budget.filesIncluded} of ${budget.filesIncluded + budget.filesSkipped} changed files` +
      `${budget.filesTruncated ? ` (${budget.filesTruncated} truncated to fit the token budget)` : ''}.`,
  );

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
    for (const f of resolved.overflow.slice(0, 15)) {
      lines.push(`- \`${f.path}:${f.line}\` — **${f.severity}** ${f.title}`);
    }
  }

  lines.push('');
  lines.push(`<sub>Kavach · ${pr.headSha.slice(0, 7)} · non-blocking review</sub>`);
  return lines.join('\n');
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
