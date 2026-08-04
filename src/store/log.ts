// Day-wise review log: .pr-architect/logs/YYYY-MM-DD.md
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
  summary: string;
  reviewUrl: string;
  dryRun: boolean;
  at?: Date;
}

export function appendLog(root: string, entry: LogEntry): string {
  const at = entry.at ?? new Date();
  const path = logPath(root, at);
  mkdirSync(logsDir(root), { recursive: true });

  const header = `# Kavach review log — ${dayStamp(at)}\n`;
  const existing = existsSync(path) ? readFileSync(path, 'utf8') : header;

  writeFileSync(path, `${existing.trimEnd()}\n\n${renderEntry(entry, at)}`);
  return path;
}

function renderEntry(entry: LogEntry, at: Date): string {
  const { context, findings, posted, summary, reviewUrl, dryRun } = entry;
  const { pr, route, budget } = context;

  const time = at.toTimeString().slice(0, 5);
  const active = findings.filter((f) => f.kind !== 'dropped');

  const counts = SEVERITIES.map((s) => ({
    severity: s,
    n: active.filter((f) => f.severity === s).length,
  })).filter((c) => c.n > 0);

  const lines: string[] = [];

  lines.push(`## ${time} · [#${pr.number} ${pr.title}](${pr.url})`);
  lines.push('');
  lines.push(`- **Repo**: \`${pr.owner}/${pr.repo}\` · branch \`${pr.branch}\` · by @${pr.author}`);
  lines.push(`- **Reviewers**: ${route.reviewers.join(', ')} (${route.mode})`);
  lines.push(
    `- **Files**: ${budget.filesIncluded} of ${budget.filesIncluded + budget.filesSkipped} reviewed` +
      `${budget.filesTruncated ? `, ${budget.filesTruncated} truncated` : ''}` +
      ` · ${Math.round(budget.totalTokens / 1000)}k tokens`,
  );
  lines.push(
    `- **Findings**: ${counts.length ? counts.map((c) => `${c.severity} ${c.n}`).join(' · ') : 'none'}`,
  );
  lines.push(
    `- **Comments posted**: ${posted}${dryRun ? ' _(dry run — nothing sent)_' : ''}` +
      `${reviewUrl && !dryRun ? ` · [view review](${reviewUrl})` : ''}`,
  );

  if (summary.trim()) {
    lines.push('');
    lines.push(`> ${summary.trim().replace(/\n+/g, ' ').slice(0, 400)}`);
  }

  if (active.length > 0) {
    lines.push('');
    lines.push('| Severity | File | Finding | Posted as |');
    lines.push('|---|---|---|---|');
    for (const f of active.slice(0, 25)) {
      lines.push(
        `| ${f.severity} | \`${f.path}:${f.line}\` | ${escapeCell(f.title)} | ${f.kind} |`,
      );
    }
    if (active.length > 25) {
      lines.push(`| … | | _${active.length - 25} more_ | |`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

/** Pipes and newlines would break the markdown table. */
function escapeCell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\n/g, ' ').slice(0, 80);
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
