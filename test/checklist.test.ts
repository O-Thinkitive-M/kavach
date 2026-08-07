import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const home = mkdtempSync(join(tmpdir(), 'kavach-home-'));
process.env.KAVACH_HOME = home;

const { checklist } = await import('../src/commands/checklist.ts');
const { init } = await import('../src/commands/init.ts');

const created: string[] = [];

function repo(remote: string, pkg?: Record<string, unknown>, extra: string[] = []): string {
  const dir = mkdtempSync(join(tmpdir(), 'kavach-cl-'));
  created.push(dir);
  execFileSync('git', ['init', '-q', dir]);
  execFileSync('git', ['-C', dir, 'remote', 'add', 'origin', remote]);
  if (pkg) writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg));
  for (const f of extra) writeFileSync(join(dir, f), '');
  return dir;
}

const NEXT_PKG = {
  name: 'shop',
  dependencies: { next: '^14', react: '^18' },
  devDependencies: { typescript: '^5', vitest: '^1' },
};

beforeEach(() => {
  rmSync(join(home, 'projects'), { recursive: true, force: true });
});

function read(dir: string, file = 'REVIEW-CHECKLIST.md'): string {
  return readFileSync(join(dir, file), 'utf8');
}

// ---------- content ----------

test('project rules appear before the generic criteria', async () => {
  const dir = repo('https://github.com/acme/shop.git', NEXT_PKG, ['tsconfig.json']);
  await init({
    root: dir,
    detect: false,
    reset: false,
    status: false,
    summary: 'Storefront for an e-commerce platform',
    focus: 'payments, auth',
    rules: 'Money is integer cents, never floats\nEvery API route calls requireAuth() first',
  });
  await checklist({ root: dir, force: false, print: false });

  const md = read(dir);
  assert.match(md, /Money is integer cents/);
  assert.match(md, /requireAuth/);
  assert.match(md, /Storefront for an e-commerce platform/);
  assert.match(md, /\*\*payments\*\*/);

  // The project's own rules must come first — they are what a generic
  // checklist cannot know.
  assert.ok(
    md.indexOf('Money is integer cents') < md.indexOf('What every PR is checked against'),
    'project rules should precede the generic sections',
  );
});

test('the template placeholder never leaks into the checklist', async () => {
  const dir = repo('https://github.com/acme/bare.git', { name: 'bare' });
  await init({ root: dir, detect: false, reset: false, status: false });
  await checklist({ root: dir, force: false, print: false });

  assert.doesNotMatch(read(dir), /\(none yet\)/);
});

test('checklist items are real, actionable lines from the rubrics', async () => {
  const dir = repo('https://github.com/acme/shop.git', NEXT_PKG, ['tsconfig.json']);
  await checklist({ root: dir, force: false, print: false });

  const md = read(dir);
  assert.match(md, /- \[ \] \*\*Injection\*\*/);
  assert.match(md, /- \[ \] \*\*Hook rules\*\*/);
  // Rubric items span multiple lines in the source; they must be joined, not
  // truncated at the first newline.
  assert.match(md, /StrictMode double-invocation.*runs effects twice/s);
});

test('it says reviews never block a merge', async () => {
  const dir = repo('https://github.com/acme/shop.git', NEXT_PKG);
  await checklist({ root: dir, force: false, print: false });
  assert.match(read(dir), /never block a merge/i);
});

// ---------- stack relevance ----------

test('a React project gets React and accessibility sections', async () => {
  const dir = repo('https://github.com/acme/shop.git', NEXT_PKG, ['tsconfig.json']);
  await checklist({ root: dir, force: false, print: false });

  const md = read(dir);
  assert.match(md, /### React/);
  assert.match(md, /### Accessibility/);
  assert.match(md, /### TypeScript/);
});

test('a Go service is not handed a React checklist', async () => {
  const dir = repo('https://github.com/acme/svc.git');
  writeFileSync(join(dir, 'go.mod'), 'module acme/svc\n');
  await checklist({ root: dir, force: false, print: false });

  const md = read(dir);
  assert.doesNotMatch(md, /### React/);
  assert.doesNotMatch(md, /### TypeScript/);
  assert.doesNotMatch(md, /### Accessibility/);
  // The universal ones still apply.
  assert.match(md, /### Security/);
  assert.match(md, /### Behaviour and regressions/);
});

test('neverReviewers is honoured', async () => {
  const dir = repo('https://github.com/acme/shop.git', NEXT_PKG, ['tsconfig.json']);
  const { loadConfig, writeConfig } = await import('../src/store/config.ts');
  const { config } = loadConfig(dir);
  config.review.neverReviewers = ['accessibility'];
  writeConfig(dir, config);

  await checklist({ root: dir, force: false, print: false });
  assert.doesNotMatch(read(dir), /### Accessibility/);
});

// ---------- writing behaviour ----------

test('--print writes nothing to disk', async () => {
  const dir = repo('https://github.com/acme/shop.git', NEXT_PKG);
  await checklist({ root: dir, force: false, print: true });

  assert.equal(existsSync(join(dir, 'REVIEW-CHECKLIST.md')), false);
});

test('a hand-written file is not clobbered without --force', async () => {
  const dir = repo('https://github.com/acme/shop.git', NEXT_PKG);
  writeFileSync(join(dir, 'REVIEW-CHECKLIST.md'), '# Mine, written by hand\n');

  await checklist({ root: dir, force: false, print: false });
  assert.match(read(dir), /Mine, written by hand/);

  await checklist({ root: dir, force: true, print: false });
  assert.doesNotMatch(read(dir), /Mine, written by hand/);
});

test('regenerating over a Kavach-generated file needs no --force', async () => {
  const dir = repo('https://github.com/acme/shop.git', NEXT_PKG);
  await checklist({ root: dir, force: false, print: false });
  await checklist({ root: dir, force: false, print: false });

  assert.match(read(dir), /generated by kavach/);
});

test('--out writes to the requested path only', async () => {
  const dir = repo('https://github.com/acme/shop.git', NEXT_PKG);
  await checklist({ root: dir, out: 'docs-review.md', force: false, print: false });

  assert.ok(existsSync(join(dir, 'docs-review.md')));
  assert.equal(existsSync(join(dir, 'REVIEW-CHECKLIST.md')), false);
});

test('checklist is the only file added to the repo', async () => {
  const dir = repo('https://github.com/acme/shop.git', NEXT_PKG);
  await checklist({ root: dir, force: false, print: false });

  const entries = readdirSync(dir).filter((e) => e !== '.git').sort();
  assert.deepEqual(entries, ['REVIEW-CHECKLIST.md', 'package.json']);
});

// ---------- CLAUDE.md pointer ----------

test('an existing CLAUDE.md gets a pointer, exactly once', async () => {
  const dir = repo('https://github.com/acme/shop.git', NEXT_PKG);
  writeFileSync(join(dir, 'CLAUDE.md'), '# Shop\n\nA storefront.\n');

  await checklist({ root: dir, force: true, print: false });
  await checklist({ root: dir, force: true, print: false });

  const claude = read(dir, 'CLAUDE.md');
  assert.equal((claude.match(/REVIEW-CHECKLIST\.md/g) ?? []).length, 2, 'link text + href, once');
  assert.match(claude, /A storefront\./, 'existing content must be preserved');
});

test('no CLAUDE.md is created where none existed', async () => {
  const dir = repo('https://github.com/acme/shop.git', NEXT_PKG);
  await checklist({ root: dir, force: false, print: false });

  assert.equal(existsSync(join(dir, 'CLAUDE.md')), false);
});

test('the pointer references a custom --out path', async () => {
  const dir = repo('https://github.com/acme/shop.git', NEXT_PKG);
  writeFileSync(join(dir, 'CLAUDE.md'), '# Shop\n');
  await checklist({ root: dir, out: 'docs-review.md', force: false, print: false });

  assert.match(read(dir, 'CLAUDE.md'), /docs-review\.md/);
});

process.on('exit', () => {
  rmSync(home, { recursive: true, force: true });
  for (const dir of created) rmSync(dir, { recursive: true, force: true });
});
