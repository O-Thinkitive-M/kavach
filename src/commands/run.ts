// `kavach run <pr-url>` — everything deterministic that must happen before Claude
// reads anything: detect, fetch, parse, route, budget, write context.json.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePrUrl, setActiveOwner } from '../github/client.ts';
import { fetchFiles, fetchPr } from '../github/pr.ts';
import { applyBudget } from '../diff/budget.ts';
import { routeReviewers } from '../review/route.ts';
import { loadConfig, loadKnowledge, priorFingerprints, storePath } from '../store/config.ts';
import { banner, c } from '../brand.ts';
import {
  CONTEXT_SCHEMA,
  KAVACH_VERSION,
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
): KnowledgeBundle {
  const { summary, focusAreas } = config.project;
  if (!summary && !focusAreas?.length) return knowledge;

  const preamble = [
    summary ? `Project: ${summary}` : '',
    focusAreas?.length
      ? `Treat these areas as high-risk; be more thorough there: ${focusAreas.join(', ')}.`
      : '',
  ]
    .filter(Boolean)
    .join('\n');

  return { ...knowledge, rules: `${preamble}\n\n${knowledge.rules}`.trim() };
}

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

  const prior = priorFingerprints(opts.root, pr.number);

  const context: ReviewContext = {
    kavachVersion: KAVACH_VERSION,
    schema: CONTEXT_SCHEMA,
    pr,
    route,
    budget,
    files,
    priorFindings: [...prior].map((fingerprint) => ({ fingerprint, path: '', line: 0 })),
    knowledge: withProjectContext(loadKnowledge(opts.root), config),
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
