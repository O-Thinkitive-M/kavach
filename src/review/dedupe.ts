// Anti-spam. The comment policy is "never spam": merge duplicates, drop anything
// already posted, cap the total.

import { createHash } from 'node:crypto';
import { classify, bySeverityThenConfidence, higherSeverity } from './policy.ts';
import type {
  ContextFile,
  Finding,
  KavachConfig,
  ResolvedFinding,
  Severity,
} from '../types.ts';

/**
 * Fingerprint deliberately excludes two things:
 *
 * - the raw line number, so a rebase that shifts lines does not repost; the
 *   nearest code line is used instead, and that moves with the code.
 * - the severity, so the same defect reported by two reviewers at different
 *   severities still collapses into one comment instead of two.
 */
export function fingerprint(finding: Finding, nearestCodeLine: string): string {
  const normalizedTitle = finding.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  const code = nearestCodeLine.replace(/\s+/g, ' ').trim();
  // A coarse line bucket, not the exact line: drift of a few lines after a
  // rebase still matches, but two genuine defects 40 lines apart on identical
  // code text (`return null;`, `}`) no longer collapse into one.
  const bucket = Math.floor(finding.line / LINE_BUCKET);
  return createHash('sha256')
    .update([finding.path, normalizedTitle, code, String(bucket)].join('\u0000'))
    .digest('hex')
    .slice(0, 16);
}

const LINE_BUCKET = 25;

function codeAt(file: ContextFile | undefined, line: number): string {
  if (!file) return '';
  for (const hunk of file.hunks) {
    for (const l of hunk.lines) {
      if (l.new === line) return l.t;
    }
  }
  return '';
}

export interface ResolveInput {
  findings: Finding[];
  files: ContextFile[];
  config: KavachConfig;
  /** Fingerprints posted in previous runs of this PR. */
  priorFingerprints: Set<string>;
  /** Bodies of existing review comments authored by Kavach. */
  existingBodies: string[];
}

export interface ResolveResult {
  /** Findings to post inline, already capped and ordered. */
  toPost: ResolvedFinding[];
  /** Survived policy but did not fit the cap — summarized in the review body. */
  overflow: ResolvedFinding[];
  /** Valid but not attachable to a diff line — moved to the review body. */
  unanchored: ResolvedFinding[];
  dropped: number;
  duplicates: number;
  /** True when Critical/High findings pushed the count past maxComments. */
  exceededCap: boolean;
}

export function resolveFindings(input: ResolveInput): ResolveResult {
  const { findings, files, config, priorFingerprints, existingBodies } = input;
  const byPath = new Map(files.map((f) => [f.path, f]));

  const merged = new Map<string, ResolvedFinding>();
  let dropped = 0;
  let duplicates = 0;

  for (const finding of findings) {
    const kind = classify(finding, config);
    if (kind === 'dropped') {
      dropped++;
      continue;
    }

    const file = byPath.get(finding.path);
    const fp = fingerprint(finding, codeAt(file, finding.line));

    // Already posted in an earlier run, or already visible on the PR.
    if (priorFingerprints.has(fp) || existingBodies.some((b) => b.includes(fp))) {
      duplicates++;
      continue;
    }

    const existing = merged.get(fp);
    if (existing) {
      // Same finding from two reviewers: keep one comment, credit both.
      duplicates++;
      existing.severity = higherSeverity(existing.severity, finding.severity);
      existing.confidence = Math.max(existing.confidence, finding.confidence);
      existing.verified = existing.verified || finding.verified;
      if (!existing.reviewers.includes(String(finding.reviewer))) {
        existing.reviewers.push(String(finding.reviewer));
      }
      existing.kind = classify(existing, config);
      continue;
    }

    merged.set(fp, {
      ...finding,
      kind,
      fingerprint: fp,
      reviewers: [String(finding.reviewer)],
    });
  }

  const survivors = [...merged.values()].sort(bySeverityThenConfidence);

  // A line outside the diff makes GitHub 422 the entire review, so those findings
  // are relocated to the summary body rather than risking the whole publish.
  const anchored: ResolvedFinding[] = [];
  const unanchored: ResolvedFinding[] = [];
  for (const finding of survivors) {
    const file = byPath.get(finding.path);
    if (file && file.commentableLines.includes(finding.line)) anchored.push(finding);
    else unanchored.push(finding);
  }

  // The cap exists to stop comment spam, not to hide serious defects. Critical
  // and High findings are always posted inline, even past the cap — otherwise a
  // PR with 40 Critical issues posts 15 and buries the other 25 in a summary
  // that is itself truncated, losing them entirely.
  const mustPost = anchored.filter((f) => ALWAYS_POST.has(f.severity));
  const rest = anchored.filter((f) => !ALWAYS_POST.has(f.severity));

  const room = Math.max(0, config.review.maxComments - mustPost.length);
  const toPost = [...mustPost, ...rest.slice(0, room)].sort(bySeverityThenConfidence);

  return {
    toPost,
    overflow: rest.slice(room),
    unanchored,
    dropped,
    duplicates,
    /** True when serious findings pushed the count past the configured cap. */
    exceededCap: toPost.length > config.review.maxComments,
  };
}

const ALWAYS_POST = new Set<Severity>(['Critical', 'High']);
