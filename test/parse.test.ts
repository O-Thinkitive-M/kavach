import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parsePatch,
  commentableLines,
  removedLines,
  addedLines,
  hunksToPatch,
} from '../src/diff/parse.ts';

// Shape captured from a real GitHub /pulls/{n}/files response.
const SIMPLE = `@@ -16,7 +16,8 @@ export function greet(name) {
 function greet(name) {
-  return "hi " + name;
+  const trimmed = name.trim();
+  return \`hi \${trimmed}\`;
 }
 `;

test('parses hunk header and assigns correct line numbers', () => {
  const hunks = parsePatch(SIMPLE);
  assert.equal(hunks.length, 1);

  const lines = hunks[0].lines;
  // Context starts at old 16 / new 16.
  assert.deepEqual(lines[0], { s: 'C', old: 16, new: 16, t: 'function greet(name) {' });
  // Removed line consumes an old number only.
  assert.deepEqual(lines[1], { s: '-', old: 17, t: '  return "hi " + name;' });
  // Added lines consume new numbers only, continuing from 17.
  assert.equal(lines[2].s, '+');
  assert.equal(lines[2].new, 17);
  assert.equal(lines[3].new, 18);
  // Trailing context: old advanced past the removal, new past both additions.
  assert.deepEqual(lines[4], { s: 'C', old: 18, new: 19, t: '}' });
});

test('commentableLines returns added RIGHT-side lines only', () => {
  assert.deepEqual(commentableLines(parsePatch(SIMPLE)), [17, 18]);
});

test('the prototyped case still yields [19, 20]', () => {
  const patch = `@@ -16,7 +16,8 @@
 a
 b
 c
-old
+new1
+new2
 d`;
  assert.deepEqual(commentableLines(parsePatch(patch)), [19, 20]);
});

test('handles multiple hunks with independent numbering', () => {
  const patch = `@@ -1,3 +1,4 @@
 a
+b
 c
@@ -40,3 +41,4 @@
 x
+y
 z`;
  const hunks = parsePatch(patch);
  assert.equal(hunks.length, 2);
  assert.deepEqual(commentableLines(hunks), [2, 42]);
});

test('ignores "\\ No newline at end of file"', () => {
  const patch = `@@ -1,2 +1,2 @@
 keep
-old
\\ No newline at end of file
+new
\\ No newline at end of file`;
  const hunks = parsePatch(patch);
  const kinds = hunks[0].lines.map((l) => l.s);
  assert.deepEqual(kinds, ['C', '-', '+']);
  assert.deepEqual(commentableLines(hunks), [2]);
});

test('pure addition file starts at line 1', () => {
  const patch = `@@ -0,0 +1,3 @@
+one
+two
+three`;
  assert.deepEqual(commentableLines(parsePatch(patch)), [1, 2, 3]);
});

test('pure deletion has no commentable lines', () => {
  const patch = `@@ -1,3 +0,0 @@
-one
-two
-three`;
  const hunks = parsePatch(patch);
  assert.deepEqual(commentableLines(hunks), []);
  assert.equal(removedLines(hunks).length, 3);
});

test('single-line hunk header without counts parses', () => {
  const patch = `@@ -5 +5 @@
-old
+new`;
  assert.deepEqual(commentableLines(parsePatch(patch)), [5]);
});

test('empty line inside hunk counts as context and keeps numbering aligned', () => {
  const patch = `@@ -1,4 +1,5 @@
 a

+inserted
 b`;
  const hunks = parsePatch(patch);
  // The blank line is context at old 2 / new 2, so the addition lands on new 3.
  assert.deepEqual(commentableLines(hunks), [3]);
});

test('binary and empty patches yield no hunks rather than throwing', () => {
  assert.deepEqual(parsePatch(undefined), []);
  assert.deepEqual(parsePatch(null), []);
  assert.deepEqual(parsePatch(''), []);
  // GitHub omits `patch` for binary files; a stray preamble must not crash.
  assert.deepEqual(parsePatch('Binary files a/logo.png and b/logo.png differ'), []);
});

test('addedLines returns only additions', () => {
  const added = addedLines(parsePatch(SIMPLE));
  assert.equal(added.length, 2);
  assert.ok(added.every((l) => l.s === '+'));
});

test('hunksToPatch round-trips the line content', () => {
  const patch = `@@ -1,3 +1,3 @@
 a
-b
+c`;
  assert.equal(hunksToPatch(parsePatch(patch)), patch);
});
