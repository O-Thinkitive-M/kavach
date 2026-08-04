// `kavach config` — optional tuning. Never required: Kavach configures itself.

import { unlinkSync } from 'node:fs';
import { loadConfig, storePath, writeConfig } from '../store/config.ts';
import { c } from '../brand.ts';
import { KavachError, REVIEWERS, type KavachConfig } from '../types.ts';

export interface ConfigOptions {
  root: string;
  show: boolean;
  set: string[];
  resetKnowledge: boolean;
}

export async function configCommand(opts: ConfigOptions): Promise<void> {
  const { config } = loadConfig(opts.root);

  if (opts.resetKnowledge) {
    for (const file of ['rules.md', 'knowledge.md', 'stack.md']) {
      try {
        unlinkSync(storePath(opts.root, file));
      } catch {
        // Already absent.
      }
    }
    process.stderr.write(c.yellow('  knowledge reset — regenerated on next run\n'));
  }

  if (opts.set.length > 0) {
    for (const pair of opts.set) {
      const eq = pair.indexOf('=');
      if (eq < 1) throw new KavachError('fetch', `Expected key=value, got "${pair}"`);
      setPath(config, pair.slice(0, eq), pair.slice(eq + 1));
    }
    writeConfig(opts.root, config);
    process.stderr.write(c.green(`  updated ${opts.set.length} setting(s)\n`));
  }

  if (opts.show || opts.set.length === 0) {
    process.stdout.write(JSON.stringify(config, null, 2) + '\n');
  }
}

/** Set a dotted path, coercing to the type already present. */
function setPath(config: KavachConfig, path: string, raw: string): void {
  const parts = path.split('.');
  let node: any = config;

  for (const part of parts.slice(0, -1)) {
    if (typeof node[part] !== 'object' || node[part] === null) {
      throw new KavachError('fetch', `Unknown config path "${path}"`);
    }
    node = node[part];
  }

  const leaf = parts[parts.length - 1];
  if (!(leaf in node)) throw new KavachError('fetch', `Unknown config key "${path}"`);

  const current = node[leaf];
  if (typeof current === 'number') {
    const value = Number(raw);
    if (!Number.isFinite(value)) throw new KavachError('fetch', `"${path}" expects a number`);
    node[leaf] = value;
  } else if (typeof current === 'boolean') {
    node[leaf] = raw === 'true' || raw === '1';
  } else if (Array.isArray(current)) {
    const values = raw.split(',').map((s) => s.trim()).filter(Boolean);
    // A misspelled reviewer would otherwise be stored and silently ignored,
    // leaving the user thinking they had excluded something.
    if (leaf === 'alwaysReviewers' || leaf === 'neverReviewers') {
      const unknown = values.filter((v) => !(REVIEWERS as string[]).includes(v));
      if (unknown.length > 0) {
        throw new KavachError(
          'fetch',
          `Unknown reviewer(s): ${unknown.join(', ')}. Valid: ${REVIEWERS.join(', ')}`,
        );
      }
    }
    node[leaf] = values;
  } else {
    node[leaf] = raw;
  }
}
