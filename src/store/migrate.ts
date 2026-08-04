// Versioned config migration.
//
// Config changes must never require reinstalling Kavach, and must never touch
// rules.md / knowledge.md — those are user-owned.

import { CONFIG_SCHEMA, KAVACH_VERSION, type KavachConfig } from '../types.ts';

type Migration = (config: Record<string, any>) => Record<string, any>;

/** Keyed by the schema version each step upgrades *from*. */
const MIGRATIONS: Record<number, Migration> = {
  // schema 1 -> 2: notify gained onError + iconUrl; budget block introduced.
  1: (c) => ({
    ...c,
    schema: 2,
    budget: c.budget ?? {
      maxContextTokens: 60000,
      maxPerFileTokens: 6000,
      maxFiles: 25,
    },
    notify: {
      googleChat: c.notify?.googleChat ?? true,
      onError: c.notify?.onError ?? true,
      iconUrl:
        c.notify?.iconUrl ??
        'https://raw.githubusercontent.com/O-Thinkitive-M/kavach/main/assets/shield-128.png',
      reviewLog: c.notify?.reviewLog ?? false,
    },
  }),
};

export function migrateConfig(raw: Record<string, any>): {
  config: KavachConfig;
  changed: boolean;
} {
  let config = { ...raw };
  let changed = false;

  let version = typeof config.schema === 'number' ? config.schema : 1;
  while (version < CONFIG_SCHEMA) {
    const step = MIGRATIONS[version];
    if (!step) break;
    config = step(config);
    version = config.schema;
    changed = true;
  }

  if (config.kavachVersion !== KAVACH_VERSION) {
    config.kavachVersion = KAVACH_VERSION;
    changed = true;
  }

  // Compare by value: withDefaults always returns a fresh object, so reference
  // identity would report "changed" on every read and rewrite a committed file.
  const filled = withDefaults(config);
  return { config: filled, changed: changed || JSON.stringify(filled) !== JSON.stringify(config) };
}

/** Backfill any key a hand-edited config is missing, so callers can trust the shape. */
function withDefaults(c: Record<string, any>): KavachConfig {
  return {
    schema: CONFIG_SCHEMA,
    kavachVersion: KAVACH_VERSION,
    project: {
      name: c.project?.name ?? 'unknown',
      stack: c.project?.stack ?? [],
      language: c.project?.language ?? 'unknown',
      packageManager: c.project?.packageManager ?? 'unknown',
      testFramework: c.project?.testFramework ?? 'unknown',
      framework: c.project?.framework ?? 'none',
      monorepo: Boolean(c.project?.monorepo),
      // Optional, written by /kavach-init. Only carried through when present, so
      // a config that was never initialized stays clean.
      ...(c.project?.initialized ? { initialized: c.project.initialized } : {}),
      ...(c.project?.summary ? { summary: c.project.summary } : {}),
      ...(c.project?.focusAreas?.length ? { focusAreas: c.project.focusAreas } : {}),
    },
    review: {
      mode: c.review?.mode === 'deep' ? 'deep' : 'standard',
      maxComments: numberOr(c.review?.maxComments, 15),
      minConfidenceToComment: numberOr(c.review?.minConfidenceToComment, 0.5),
      minConfidenceForIssue: numberOr(c.review?.minConfidenceForIssue, 0.8),
      alwaysReviewers: c.review?.alwaysReviewers ?? [],
      neverReviewers: c.review?.neverReviewers ?? [],
    },
    budget: {
      maxContextTokens: numberOr(c.budget?.maxContextTokens, 60000),
      maxPerFileTokens: numberOr(c.budget?.maxPerFileTokens, 6000),
      maxFiles: numberOr(c.budget?.maxFiles, 25),
    },
    notify: {
      googleChat: c.notify?.googleChat ?? true,
      onError: c.notify?.onError ?? true,
      iconUrl:
        c.notify?.iconUrl ??
        'https://raw.githubusercontent.com/O-Thinkitive-M/kavach/main/assets/shield-128.png',
      reviewLog: c.notify?.reviewLog ?? false,
    },
    ignore: Array.isArray(c.ignore) ? c.ignore : [],
  };
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
