// `kavach run <pr-url>` — everything deterministic that must happen before Claude
// reads anything: detect, fetch, parse, route, budget, write context.json.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePrUrl, setActiveOwner } from '../github/client.ts';
import { fetchFiles, fetchPr } from '../github/pr.ts';
import { applyBudget } from '../diff/budget.ts';
import { routeReviewers } from '../review/route.ts';
import { loadConfig, loadKnowledge, priorReported, storePath } from '../store/config.ts';
import { banner, c } from '../brand.ts';
import {
  CONTEXT_SCHEMA,
  KAVACH_VERSION,
  type ContextFile,
  type KavachConfig,
  type KnowledgeBundle,
  type ReviewContext,
  type ReviewMode,
} from '../types.ts';

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export interface RunOptions {
  url: string;
  root: string;
  deep: boolean;
}

/**
 * Fold what /kavach-init recorded into the knowledge bundle, so every reviewer
 * sees what the project is and which areas the team flagged as high-risk.
 */
function withProjectContext(
  knowledge: KnowledgeBundle,
  config: KavachConfig,
  files: ContextFile[],
): KnowledgeBundle {
  const { summary, focusAreas } = config.project;
  const mismatch = stackMismatch(config, files);

  if (!summary && !focusAreas?.length && !mismatch) return knowledge;

  const preamble = [
    summary ? `Project: ${summary}` : '',
    focusAreas?.length
      ? `Treat these areas as high-risk; be more thorough there: ${focusAreas.join(', ')}.`
      : '',
    mismatch,
  ]
    .filter(Boolean)
    .join('\n');

  return { ...knowledge, rules: `${preamble}\n\n${knowledge.rules}`.trim() };
}

/**
 * The project is configured for one stack but the PR changes another — a Python
 * service in a mostly-React monorepo, or a repo whose detection was wrong.
 * Silence here produces confident nonsense, so say it plainly and let Claude
 * fall back to language-general review.
 */
export function stackMismatch(config: KavachConfig, files: ContextFile[]): string {
  const reviewable = files.filter((f) => !f.skipReason && f.hunks.length > 0);
  if (reviewable.length === 0) return '';

  const declared = config.project.language;
  if (!declared || declared === 'unknown') return '';

  const languages = new Set(reviewable.map((f) => f.language));
  const familiar = LANGUAGE_FAMILIES[declared] ?? new Set([declared]);
  const foreign = [...languages].filter((l) => !familiar.has(l) && !NEUTRAL.has(l));

  // Only worth saying when the PR is *mostly* unfamiliar, not when it merely
  // touches one config file.
  const foreignFiles = reviewable.filter((f) => foreign.includes(f.language)).length;
  if (foreignFiles / reviewable.length < 0.6) return '';

  return (
    `Note: this project is configured as ${declared}` +
    `${config.project.framework !== 'none' ? ` / ${config.project.framework}` : ''}, ` +
    `but this PR is mostly ${[...new Set(foreign)].join(', ')}. ` +
    'Review it on general engineering merit — correctness, security, clarity — and ' +
    'do not apply framework-specific rules that may not hold here. Lower your ' +
    'confidence on anything that depends on stack conventions you cannot verify.'
  );
}

/** Languages that travel together and should not be flagged as foreign. */
const LANGUAGE_FAMILIES: Record<string, Set<string>> = {
  typescript: new Set(['typescript', 'tsx', 'javascript', 'jsx']),
  javascript: new Set(['javascript', 'jsx', 'typescript', 'tsx']),
  python: new Set(['python']),
  go: new Set(['go']),
  java: new Set(['java', 'kotlin']),
  ruby: new Set(['ruby']),
  php: new Set(['php']),
  rust: new Set(['rust']),
};

/** Config, docs and styles appear in every stack; never a mismatch signal. */
const NEUTRAL = new Set([
  'json',
  'yaml',
  'markdown',
  'css',
  'scss',
  'html',
  'shell',
  'sql',
  'terraform',
  'unknown',
]);

export async function run(opts: RunOptions): Promise<ReviewContext> {
  process.stderr.write(banner() + '\n\n');

  const ref = parsePrUrl(opts.url);
  // Selects an owner-scoped token when one is stored, so work and personal
  // accounts can coexist on the same machine.
  setActiveOwner(ref.owner);

  const { config, created } = loadConfig(opts.root);

  if (created) {
    process.stderr.write(
      c.grey(`  configured ${config.project.name} · ${config.project.language}`) +
        c.grey(` · ${config.project.framework}\n`),
    );
  }

  const mode: ReviewMode = opts.deep ? 'deep' : config.review.mode;

  const [pr, rawFiles] = await Promise.all([fetchPr(ref), fetchFiles(ref)]);

  const route = routeReviewers(rawFiles, config, mode);
  const { files, budget } = applyBudget(rawFiles, config, route.reviewers);

  // What Kavach already said on this PR, so Claude does not restate it.
  const prior = priorReported(opts.root, pr.number);

  const context: ReviewContext = {
    kavachVersion: KAVACH_VERSION,
    schema: CONTEXT_SCHEMA,
    pr,
    route,
    budget,
    files,
    priorFindings: prior,
    knowledge: withProjectContext(loadKnowledge(opts.root), config, files),
  };

  const runDir = storePath(opts.root, 'runs', `${pr.number}-${pr.headSha.slice(0, 7)}`);
  mkdirSync(runDir, { recursive: true });
  writeFileSync(join(runDir, 'context.json'), JSON.stringify(context));

  process.stderr.write(
    c.grey(
      `  PR #${pr.number} · ${pr.changedFiles} files · ` +
        `${budget.filesIncluded} reviewed, ${budget.filesSkipped} skipped\n\n`,
    ),
  );

  // Machine-readable tail: the skill reads these instead of grepping.
  const reviewerPaths = route.reviewers
    .map((r) => join(PLUGIN_ROOT, 'skills', 'reviewers', `${r}.md`))
    .join(',');

  process.stdout.write(
    [
      `KAVACH_CONTEXT=${join(runDir, 'context.json')}`,
      `KAVACH_FINDINGS=${join(runDir, 'findings.json')}`,
      `KAVACH_RUN=${runDir}`,
      `KAVACH_ROUTE=${route.reviewers.join(',')}`,
      `KAVACH_REVIEWERS=${reviewerPaths}`,
      `KAVACH_BUDGET=files:${budget.filesIncluded}/${files.length} ` +
        `tokens:${budget.totalTokens} truncated:${budget.filesTruncated}`,
      '',
    ].join('\n'),
  );

  return context;
}
