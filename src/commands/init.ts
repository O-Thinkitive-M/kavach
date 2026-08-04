// `kavach init` — one-time project setup.
//
// Run once per project folder. Detection fills in everything mechanical, so the
// interview is short: the user confirms the stack and states what the project is
// and what matters in review. Re-running updates; --reset replaces outright.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { detectConfig } from '../detect.ts';
import { loadConfig, storePath, writeConfig, ensureStore } from '../store/config.ts';
import { banner, c } from '../brand.ts';
import { REVIEWERS, type KavachConfig } from '../types.ts';

export interface InitOptions {
  root: string;
  /** Print detected values as JSON and exit — the skill reads this to pre-fill. */
  detect: boolean;
  /** Discard existing project answers before applying new ones. */
  reset: boolean;
  summary?: string;
  focus?: string;
  stack?: string;
  rules?: string;
  maxComments?: string;
  strictness?: string;
  status: boolean;
}

export async function init(opts: InitOptions): Promise<void> {
  if (opts.detect) {
    // Machine-readable: no banner, no colour, stdout only.
    const detected = detectConfig(opts.root);
    const existing = existsSync(storePath(opts.root, 'config.json'))
      ? loadConfig(opts.root).config
      : null;

    process.stdout.write(
      JSON.stringify(
        {
          detected: detected.project,
          alreadyInitialized: Boolean(existing?.project.initialized),
          existing: existing?.project.initialized
            ? {
                summary: existing.project.summary ?? '',
                focusAreas: existing.project.focusAreas ?? [],
                initialized: existing.project.initialized,
              }
            : null,
          availableReviewers: REVIEWERS,
        },
        null,
        2,
      ) + '\n',
    );
    return;
  }

  process.stderr.write(banner('project setup') + '\n\n');

  if (opts.status) {
    printStatus(opts.root);
    return;
  }

  const { config } = loadConfig(opts.root);

  if (opts.reset) {
    delete config.project.summary;
    delete config.project.focusAreas;
    config.review.alwaysReviewers = ['security'];
    config.review.neverReviewers = [];
    process.stderr.write(c.yellow('  previous project answers cleared\n'));
  }

  // Re-detect so a stack change (added TypeScript, switched to pnpm) is picked
  // up on re-init without the user restating it.
  const detected = detectConfig(opts.root);
  config.project = {
    ...config.project,
    ...detected.project,
    // Preserve the user's own answers over anything detection produced.
    summary: opts.summary ?? config.project.summary,
    focusAreas: opts.focus
      ? splitList(opts.focus)
      : (config.project.focusAreas ?? []),
    initialized: new Date().toISOString(),
  };

  if (opts.stack) config.project.stack = splitList(opts.stack);

  if (opts.strictness) {
    applyStrictness(config, opts.strictness);
  }

  if (opts.maxComments) {
    const n = Number(opts.maxComments);
    if (Number.isFinite(n) && n > 0) config.review.maxComments = Math.floor(n);
  }

  writeConfig(opts.root, config);

  if (opts.rules?.trim()) {
    appendRules(opts.root, opts.rules.trim());
  }

  printSummary(config, opts.root);
}

/** Maps a plain word onto the confidence thresholds that actually control noise. */
function applyStrictness(config: KavachConfig, level: string): void {
  const normalized = level.toLowerCase();
  if (normalized.startsWith('len') || normalized.startsWith('light')) {
    config.review.minConfidenceForIssue = 0.9;
    config.review.minConfidenceToComment = 0.7;
    config.review.maxComments = 8;
  } else if (normalized.startsWith('str') || normalized.startsWith('thor')) {
    config.review.minConfidenceForIssue = 0.75;
    config.review.minConfidenceToComment = 0.4;
    config.review.maxComments = 25;
    config.review.mode = 'deep';
  } else {
    config.review.minConfidenceForIssue = 0.8;
    config.review.minConfidenceToComment = 0.5;
    config.review.maxComments = 15;
    config.review.mode = 'standard';
  }
}

/** Rules are user-owned; init appends rather than overwriting what is there. */
function appendRules(root: string, rules: string): void {
  ensureStore(root);
  const path = storePath(root, 'rules.md');
  const lines = rules
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => (l.startsWith('-') ? l : `- ${l}`));

  let existing = '';
  try {
    existing = readFileSync(path, 'utf8');
  } catch {
    existing = '# Project rules\n\nRules Kavach enforces on every review.\n';
  }

  // Drop the placeholder the template ships with once real rules exist.
  const cleaned = existing.replace(/^- \(none yet\)$/m, '').trimEnd();
  writeFileSync(path, `${cleaned}\n${lines.join('\n')}\n`);
}

function splitList(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function printStatus(root: string): void {
  const path = storePath(root, 'config.json');
  if (!existsSync(path)) {
    process.stderr.write(
      c.yellow('  This project has not been set up yet.\n') +
        c.grey('  Run /kavach-init to configure it, or just paste a PR URL —\n') +
        c.grey('  Kavach will detect the stack automatically.\n\n'),
    );
    return;
  }
  printSummary(loadConfig(root).config, root);
}

function printSummary(config: KavachConfig, root: string): void {
  const p = config.project;
  const when = p.initialized ? new Date(p.initialized).toLocaleDateString() : 'not yet';

  process.stderr.write(
    `  ${c.bold(p.name)}\n` +
      c.grey(`  ${p.language} · ${p.framework} · ${p.packageManager} · ${p.testFramework}`) +
      c.grey(p.monorepo ? ' · monorepo\n' : '\n') +
      (p.summary ? c.grey(`  "${p.summary.slice(0, 90)}"\n`) : '') +
      (p.focusAreas?.length ? c.grey(`  focus: ${p.focusAreas.join(', ')}\n`) : '') +
      c.grey(`  review: max ${config.review.maxComments} comments · ${config.review.mode}\n`) +
      c.grey(`  set up: ${when}\n`) +
      c.grey(`  stored: ${storePath(root, 'config.json')}\n\n`),
  );
}
