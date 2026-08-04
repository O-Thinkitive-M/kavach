// Unified-diff parser.
//
// The only thing that matters here is that `new` line numbers are exactly right:
// GitHub rejects the whole review if a comment points at a line that is not in the
// diff, so `commentableLines` is precomputed and publish validates against it.

import type { DiffLine, Hunk } from '../types.ts';

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

/**
 * Parse a GitHub `patch` string (the per-file body, no `diff --git` preamble).
 * Unparseable input yields no hunks rather than throwing — one malformed file
 * must not abort a review.
 */
export function parsePatch(patch: string | undefined | null): Hunk[] {
  if (!patch) return [];

  const hunks: Hunk[] = [];
  let current: Hunk | null = null;
  let oldLine = 0;
  let newLine = 0;

  for (const raw of patch.split('\n')) {
    const header = HUNK_HEADER.exec(raw);
    if (header) {
      current = { header: raw, lines: [] };
      hunks.push(current);
      oldLine = Number(header[1]);
      newLine = Number(header[3]);
      continue;
    }

    if (!current) continue;

    // "\ No newline at end of file" annotates the previous line; it is not a line.
    if (raw.startsWith('\\')) continue;

    const marker = raw[0];
    const text = raw.slice(1);

    if (marker === '+') {
      current.lines.push({ s: '+', new: newLine, t: text });
      newLine++;
    } else if (marker === '-') {
      current.lines.push({ s: '-', old: oldLine, t: text });
      oldLine++;
    } else if (marker === ' ') {
      current.lines.push({ s: 'C', old: oldLine, new: newLine, t: text });
      oldLine++;
      newLine++;
    } else if (raw === '') {
      // A bare empty line inside a hunk is an empty context line whose single
      // leading space was stripped in transit. Treat it as context so the line
      // numbers on both sides stay aligned with the real file.
      current.lines.push({ s: 'C', old: oldLine, new: newLine, t: '' });
      oldLine++;
      newLine++;
    }
    // Anything else (e.g. "diff --git", "index ", "+++") is preamble noise: skip.
  }

  return hunks;
}

/**
 * RIGHT-side lines a review comment may attach to.
 *
 * Added lines only. Context lines are technically commentable on GitHub, but
 * commenting on an unchanged line is almost always noise from a PR reviewer, and
 * restricting to `+` keeps findings anchored to what the PR actually changed.
 */
export function commentableLines(hunks: Hunk[]): number[] {
  const lines: number[] = [];
  for (const hunk of hunks) {
    for (const line of hunk.lines) {
      if (line.s === '+' && line.new !== undefined) lines.push(line.new);
    }
  }
  return lines;
}

/** Removed lines, used by the business-logic reviewer to compare old vs new behavior. */
export function removedLines(hunks: Hunk[]): DiffLine[] {
  return hunks.flatMap((h) => h.lines.filter((l) => l.s === '-'));
}

/** Added lines, used by content-based routing signals. */
export function addedLines(hunks: Hunk[]): DiffLine[] {
  return hunks.flatMap((h) => h.lines.filter((l) => l.s === '+'));
}

/** Serialize hunks back to a patch string. Used to measure real token cost. */
export function hunksToPatch(hunks: Hunk[]): string {
  const out: string[] = [];
  for (const hunk of hunks) {
    out.push(hunk.header);
    for (const line of hunk.lines) {
      out.push((line.s === 'C' ? ' ' : line.s) + line.t);
    }
  }
  return out.join('\n');
}
