#!/usr/bin/env node
// Kavach CLI. Deterministic work only — Claude Code is the reasoning engine.

import { parseArgs } from 'node:util';
import { run } from './commands/run.ts';
import { publish } from './commands/publish.ts';
import { configCommand } from './commands/config.ts';
import { setup } from './commands/setup.ts';
import { init } from './commands/init.ts';
import { logCommand } from './commands/log.ts';
import { notifyError } from './notify/chat.ts';
import { banner, c } from './brand.ts';
import { KavachError, NeedsCredentialError, type Stage } from './types.ts';

const USAGE = `kavach — autonomous PR review

  kavach run <pr-url> [--deep] [--root <dir>]
      Fetch, parse, route and budget a PR. Writes context.json.

  kavach publish --run <dir> [--dry-run]
      Dedupe, apply confidence policy, post inline comments, send Chat card.

  kavach setup [--token <t>] [--webhook <url>] [--repo owner/repo] [--status]
      Store and verify credentials. Runs once per user.

  kavach init [--detect] [--summary <s>] [--focus a,b] [--rules <text>] [--reset]
      Set up a project. Runs once per folder; re-run to update.

  kavach log [--show] [--day YYYY-MM-DD] [--list]
      Read the day-wise review log.

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
      token: { type: 'string' },
      webhook: { type: 'string' },
      repo: { type: 'string' },
      owner: { type: 'string' },
      status: { type: 'boolean', default: false },
      'test-chat': { type: 'boolean', default: false },
      detect: { type: 'boolean', default: false },
      reset: { type: 'boolean', default: false },
      summary: { type: 'string' },
      focus: { type: 'string' },
      stack: { type: 'string' },
      rules: { type: 'string' },
      'max-comments': { type: 'string' },
      strictness: { type: 'string' },
      day: { type: 'string' },
      list: { type: 'boolean', default: false },
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

    case 'setup':
      await setup({
        token: values.token,
        webhook: values.webhook,
        repo: values.repo,
        owner: values.owner,
        status: values.status,
        testChat: values['test-chat'],
      });
      return 0;

    case 'init':
      await init({
        root,
        detect: values.detect,
        reset: values.reset,
        summary: values.summary,
        focus: values.focus,
        stack: values.stack,
        rules: values.rules,
        maxComments: values['max-comments'],
        strictness: values.strictness,
        status: values.status,
      });
      return 0;

    case 'log':
      logCommand({ root, day: values.day, list: values.list });
      return 0;

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
    // A missing credential is recoverable, not a failure: emit a machine-readable
    // marker so the skill knows to ask the user once, then resume. Never sent to
    // Chat — there may be no webhook configured yet, and it is not an incident.
    if (err instanceof NeedsCredentialError) {
      process.stdout.write(
        `KAVACH_NEEDS=${err.kind}\n` + (err.owner ? `KAVACH_OWNER=${err.owner}\n` : ''),
      );
      process.stderr.write('\n' + c.yellow('  Kavach needs credentials: ') + err.message + '\n\n');
      process.exit(2);
    }

    const stage: Stage = err instanceof KavachError ? err.stage : 'fetch';
    const message = err instanceof Error ? err.message : String(err);

    process.stderr.write('\n' + c.red('  Kavach failed') + c.grey(` at ${stage}: `) + message + '\n');

    // Fail loud: the same webhook that carries successes carries failures, so a
    // run never dies silently.
    const target = process.argv.find((a) => a.includes('/pull/')) ?? '(no PR URL)';
    await notifyError(stage, message, target).catch(() => {});

    process.exit(1);
  });
