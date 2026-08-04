// .pr-architect/ store. Directory name is inherited from the original spec and
// kept for migration safety even though the brand is Kavach.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { detectConfig } from '../detect.ts';
import { migrateConfig } from './migrate.ts';
import type {
  HistoryEntry,
  KavachConfig,
  KnowledgeBundle,
  PriorFinding,
} from '../types.ts';

export const STORE_DIR = '.pr-architect';

export function storePath(root: string, ...parts: string[]): string {
  return join(root, STORE_DIR, ...parts);
}

export function ensureStore(root: string): void {
  mkdirSync(storePath(root, 'runs'), { recursive: true });
}

/**
 * Load config, or detect and write one on first run. This is what makes Kavach
 * zero-config: a repo it has never seen still reviews without asking anything.
 */
export function loadConfig(root: string): { config: KavachConfig; created: boolean } {
  const path = storePath(root, 'config.json');

  if (existsSync(path)) {
    try {
      const raw = JSON.parse(readFileSync(path, 'utf8'));
      const { config, changed } = migrateConfig(raw);
      if (changed) writeConfig(root, config);
      return { config, created: false };
    } catch {
      // A corrupt config must not block a review; regenerate it.
    }
  }

  const config = detectConfig(root);
  ensureStore(root);
  writeConfig(root, config);
  seedKnowledge(root, config);
  return { config, created: true };
}

export function writeConfig(root: string, config: KavachConfig): void {
  ensureStore(root);
  writeFileSync(storePath(root, 'config.json'), JSON.stringify(config, null, 2) + '\n');
}

/**
 * rules.md and knowledge.md are user-owned: written once with a template, then
 * never touched again by Kavach. Only an explicit --reset-knowledge clears them.
 */
function seedKnowledge(root: string, config: KavachConfig): void {
  const { project } = config;

  writeIfMissing(
    storePath(root, 'stack.md'),
    `# Stack — ${project.name}

| Field | Value |
|---|---|
| Language | ${project.language} |
| Framework | ${project.framework} |
| Package manager | ${project.packageManager} |
| Test framework | ${project.testFramework} |
| Monorepo | ${project.monorepo} |
| Stack | ${project.stack.join(', ') || 'n/a'} |

Detected automatically by Kavach. Edit freely — this file is never overwritten.
`,
  );

  writeIfMissing(
    storePath(root, 'rules.md'),
    `# Project rules

Domain rules and conventions Kavach should enforce when reviewing.
Anything written here is passed to every reviewer.

- (none yet)
`,
  );

  writeIfMissing(
    storePath(root, 'knowledge.md'),
    `# Project knowledge

Long-lived context about this codebase: architecture decisions, known
gotchas, areas under active refactor.

- (none yet)
`,
  );
}

function writeIfMissing(path: string, content: string): void {
  if (!existsSync(path)) writeFileSync(path, content);
}

export function loadKnowledge(root: string): KnowledgeBundle {
  return {
    rules: readIfExists(storePath(root, 'rules.md')),
    stack: readIfExists(storePath(root, 'stack.md')),
    conventions: readIfExists(storePath(root, 'knowledge.md')),
  };
}

function readIfExists(path: string): string {
  try {
    // Cap each file so a long rules.md cannot crowd out the diff.
    return readFileSync(path, 'utf8').slice(0, 4000);
  } catch {
    return '';
  }
}

export function loadHistory(root: string): HistoryEntry[] {
  try {
    return JSON.parse(readFileSync(storePath(root, 'history.json'), 'utf8'));
  } catch {
    return [];
  }
}

export function appendHistory(root: string, entry: HistoryEntry): void {
  const history = loadHistory(root);
  history.push(entry);
  // Keep the file small; old PRs stop mattering for dedupe.
  const trimmed = history.slice(-200);
  ensureStore(root);
  writeFileSync(storePath(root, 'history.json'), JSON.stringify(trimmed, null, 2) + '\n');
}

/** Fingerprints already posted for this PR, across previous runs. */
export function priorFingerprints(root: string, pr: number): Set<string> {
  const set = new Set<string>();
  for (const entry of loadHistory(root)) {
    if (entry.pr === pr) for (const fp of entry.fingerprints) set.add(fp);
  }
  return set;
}

/**
 * What was already reported on this PR, so Claude can avoid restating it.
 * Capped: on a long-running PR the list would otherwise grow unbounded.
 */
export function priorReported(root: string, pr: number, limit = 30): PriorFinding[] {
  const seen = new Set<string>();
  const out: PriorFinding[] = [];
  for (const entry of loadHistory(root).reverse()) {
    if (entry.pr !== pr) continue;
    for (const f of entry.reported ?? []) {
      if (seen.has(f.fingerprint)) continue;
      seen.add(f.fingerprint);
      out.push(f);
      if (out.length >= limit) return out;
    }
  }
  return out;
}
