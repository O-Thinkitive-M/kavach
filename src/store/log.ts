// Day-wise review log, stored per user at ~/.kavach/projects/<key>/logs/.
//
// One file per day, appended to after every publish. A running record of what
// Kavach reviewed on this project — readable by a human, not a machine format.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { storePath } from './config.ts';
import { SEVERITIES, type ResolvedFinding, type ReviewContext } from '../types.ts';

export function logsDir(root: string): string {
  return storePath(root, 'logs');
}

/** Local date, not UTC — the log should match the reviewer's own calendar. */
export function dayStamp(at = new Date()): string {
  const y = at.getFullYear();
  const m = String(at.getMonth() + 1).padStart(2, '0');
  const d = String(at.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function logPath(root: string, at = new Date()): string {
  return join(logsDir(root), `${dayStamp(at)}.md`);
}

export interface LogEntry {
  context: ReviewContext;
  findings: ResolvedFinding[];
  posted: number;
  reviewUrl: string;
  dryRun: boolean;
  at?: Date;
}

export function appendLog(root: string, entry: LogEntry): string {
  const at = entry.at ?? new Date();
  const path = logPath(root, at);
  mkdirSync(logsDir(root), { recursive: true });

  // Legend once per file, not once per entry.
  const header =
    `# Kavach — ${dayStamp(at)}\n\n` +
    `<sub>severity C/H/M/L/S · kind I=issue Q=question S=suggestion</sub>\n`;
  const existing = existsSync(path) ? readFileSync(path, 'utf8') : header;

  writeFileSync(path, `${existing.trimEnd()}\n\n${renderEntry(entry, at)}`);
  return path;
}

/** Single letter per severity, so a finding line stays short. */
const SEV_CODE: Record<string, string> = {
  Critical: 'C',
  High: 'H',
  Medium: 'M',
  Low: 'L',
  Suggestion: 'S',
};

/** Single letter per kind: Issue / Suggestion / Question. */
const KIND_CODE: Record<string, string> = {
  issue: 'I',
  suggestion: 'S',
  question: 'Q',
};

/**
 * One entry, deliberately compact: a header line, a stats line, and one line per
 * finding. This file is read by humans and occasionally re-read by Claude, so
 * every byte is context budget — no tables, no prose, no repeated field labels.
 */
function renderEntry(entry: LogEntry, at: Date): string {
  const { context, findings, posted, reviewUrl, dryRun } = entry;
  const { pr, route, budget } = context;

  const time = at.toTimeString().slice(0, 5);
  const active = findings.filter((f) => f.kind !== 'dropped');

  const counts = SEVERITIES.map((s) => {
    const n = active.filter((f) => f.severity === s).length;
    return n ? `${SEV_CODE[s]}${n}` : '';
  })
    .filter(Boolean)
    .join(' ');

  const lines: string[] = [];

  // Header carries the link, so the PR number and title cost nothing extra.
  lines.push(`### ${time} [#${pr.number} ${trim(pr.title, 70)}](${pr.url}) @${pr.author}`);

  const skipped = budget.filesSkipped ? `/${budget.filesIncluded + budget.filesSkipped}` : '';
  lines.push(
    `${route.reviewers.join(',')} · ${budget.filesIncluded}${skipped} files · ` +
      `${counts || 'clean'} · ${posted} posted` +
      (dryRun ? ' · dry-run' : '') +
      (reviewUrl && !dryRun ? ` · [review](${reviewUrl})` : ''),
  );

  for (const f of active.slice(0, MAX_LOGGED_FINDINGS)) {
    // e.g. `H/I src/api.ts:34 Unparameterized SQL query`
    lines.push(
      `- \`${SEV_CODE[f.severity]}/${KIND_CODE[f.kind] ?? '?'}\` ` +
        `${f.path}:${f.line} — ${trim(f.title, 70)}`,
    );
  }
  if (active.length > MAX_LOGGED_FINDINGS) {
    lines.push(`- _+${active.length - MAX_LOGGED_FINDINGS} more_`);
  }

  lines.push('');
  return lines.join('\n');
}

const MAX_LOGGED_FINDINGS = 20;

function trim(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? clean.slice(0, max - 1) + '…' : clean;
}

/** Reads back a day's log. Used by `kavach log --show`. */
export function readLog(root: string, day?: string): string | null {
  const path = join(logsDir(root), `${day ?? dayStamp()}.md`);
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

/** Every day that has a log, newest first. */
export function listLogDays(root: string): string[] {
  try {
    return readdirSync(logsDir(root))
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
      .map((f) => f.replace(/\.md$/, ''))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}
