// Confidence policy. Claude proposes, the CLI disposes.
//
// The rule from the spec: never present an uncertain finding as a defect. Only
// high-confidence verified findings are stated as Issues; everything softer is
// phrased as a Suggestion or an open Question.

import type { Finding, FindingKind, KavachConfig, Severity } from '../types.ts';

export function classify(finding: Finding, config: KavachConfig): FindingKind {
  const { minConfidenceToComment, minConfidenceForIssue } = config.review;
  const confidence = clamp(finding.confidence);

  if (confidence < minConfidenceToComment) return 'dropped';
  if (confidence >= minConfidenceForIssue) return finding.verified ? 'issue' : 'suggestion';
  return 'question';
}

function clamp(n: unknown): number {
  const value = typeof n === 'number' && Number.isFinite(n) ? n : 0;
  return Math.min(1, Math.max(0, value));
}

const TITLE_MAX = 60;
const BODY_MAX = 400;

/**
 * Render a comment body. Terse by construction: no preamble, no praise sandwich,
 * no restating the diff — that is where the token savings actually live.
 */
export function renderComment(
  finding: Finding,
  kind: FindingKind,
  reviewers: string[],
): string {
  const label = reviewers.length > 1 ? reviewers.join(' + ') : reviewers[0] ?? finding.reviewer;
  const body = truncate(finding.body.trim(), BODY_MAX);
  const lines: string[] = [];

  if (kind === 'issue') {
    lines.push(`**Kavach · ${finding.severity}** — ${truncate(finding.title, TITLE_MAX)}`);
    lines.push('');
    lines.push(body);
  } else if (kind === 'suggestion') {
    lines.push(`**Kavach · Suggestion** — ${truncate(finding.title, TITLE_MAX)}`);
    lines.push('');
    lines.push(`Consider: ${body}`);
  } else {
    lines.push(`**Kavach · Question** — ${truncate(finding.title, TITLE_MAX)}`);
    lines.push('');
    lines.push(asQuestion(body));
  }

  if (finding.regressionOf) {
    lines.push('');
    lines.push(`_Previous behavior:_ ${truncate(finding.regressionOf, 200)}`);
  }

  if (finding.suggestion) {
    lines.push('');
    lines.push('```suggestion');
    lines.push(finding.suggestion.replace(/```/g, '⁣```'));
    lines.push('```');
  }

  lines.push('');
  lines.push(`<sub>${label}</sub>`);

  return lines.join('\n');
}

/** Uncertain findings must read as genuine questions, not softened accusations. */
function asQuestion(body: string): string {
  const trimmed = body.trim();
  if (trimmed.endsWith('?')) return trimmed;
  return `${trimmed}\n\nCan you confirm this is intentional?`;
}

function truncate(s: string, max: number): string {
  const clean = s.replace(/\s+/g, ' ').trim();
  return clean.length > max ? clean.slice(0, max - 1) + '…' : clean;
}

const ORDER: Record<Severity, number> = {
  Critical: 0,
  High: 1,
  Medium: 2,
  Low: 3,
  Suggestion: 4,
};

export function bySeverityThenConfidence(a: Finding, b: Finding): number {
  const severity = ORDER[a.severity] - ORDER[b.severity];
  return severity !== 0 ? severity : b.confidence - a.confidence;
}

export function higherSeverity(a: Severity, b: Severity): Severity {
  return ORDER[a] <= ORDER[b] ? a : b;
}
