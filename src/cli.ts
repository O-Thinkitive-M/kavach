#!/usr/bin/env node
// Kavach CLI. Deterministic work only — Claude Code is the reasoning engine.

import { parseArgs } from 'node:util';
import { run } from './commands/run.ts';
import { publish } from './commands/publish.ts';
import { configCommand } from './commands/config.ts';
import { notifyError } from './notify/chat.ts';
import { banner, c } from './brand.ts';
import { KavachError, type Stage } from './types.ts';

const USAGE = `${'kavach'} — autonomous PR review

  kavach run <pr-url> [--deep] [--root <dir>]
      Fetch, parse, route and budget a PR. Writes context.json.

  kavach publish --run <dir> [--dry-run]
      Dedupe, apply confidence policy, post inline comments, send Chat card.

  kavach config [--show] [--set key=value] [--reset-knowledge]
      Inspect or tune .pr-architect/config.json.
`;

async function main(): Promise<number> {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: {
      deep: { type: 'boolean', default: false },
      root: { type: 'string' },
      run: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      show: { type: 'boolean', default: false },
      set: { type: 'string', multiple: true },
      'reset-knowledge': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });

  const command = positionals[0];
  const root = values.root ?? process.cwd();

  if (values.help || !command) {
    process.stderr.write(banner() + '\n\n' + USAGE);
    return command ? 0 : 1;
  }

  switch (command) {
    case 'run': {
      const url = positionals[1];
      if (!url) throw new KavachError('fetch', 'Usage: kavach run <pr-url>');
      await run({ url, root, deep: values.deep });
      return 0;
    }

    case 'publish': {
      if (!values.run) throw new KavachError('publish', 'Usage: kavach publish --run <dir>');
      await publish({ runDir: values.run, root, dryRun: values['dry-run'] });
      return 0;
    }

    case 'config':
      await configCommand({
        root,
        show: values.show,
        set: values.set ?? [],
        resetKnowledge: values['reset-knowledge'],
      });
      return 0;

    default:
      process.stderr.write(`Unknown command "${command}".\n\n${USAGE}`);
      return 1;
  }
}

main()
  .then((code) => process.exit(code))
  .catch(async (err) => {
    const stage: Stage = err instanceof KavachError ? err.stage : 'fetch';
    const message = err instanceof Error ? err.message : String(err);

    process.stderr.write('\n' + c.red('  Kavach failed') + c.grey(` at ${stage}: `) + message + '\n');

    // Fail loud: the same webhook that carries successes carries failures, so a
    // run never dies silently.
    const target = process.argv.find((a) => a.includes('/pull/')) ?? '(no PR URL)';
    await notifyError(stage, message, target).catch(() => {});

    process.exit(1);
  });
