// `kavach setup` — store and verify credentials. Runs once per user, not per repo.
//
// A token is verified against the real API *before* it is written, so a wrong or
// read-only token is caught here rather than halfway through a review.

import { verifyAccess, setActiveOwner } from '../github/client.ts';
import {
  credentialsPath,
  credentialsStatus,
  loadCredentials,
  maskToken,
  maskWebhook,
  resolveChatWebhook,
  resolveGithubToken,
  setChatWebhook,
  setGithubToken,
} from '../store/credentials.ts';
import { banner, c } from '../brand.ts';
import { KavachError } from '../types.ts';

export interface SetupOptions {
  token?: string;
  webhook?: string;
  /** owner/repo to verify the token against. */
  repo?: string;
  /** Store the token only for this owner, not as the default. */
  owner?: string;
  status: boolean;
  testChat: boolean;
}

export async function setup(opts: SetupOptions): Promise<void> {
  process.stderr.write(banner('setup') + '\n\n');

  if (opts.status) {
    printStatus(opts.owner);
    return;
  }

  if (opts.token) {
    const [owner, repo] = (opts.repo ?? '').split('/');

    if (owner && repo) {
      setActiveOwner(owner);
      const access = await verifyAccess(owner, repo, opts.token);

      process.stderr.write(
        `  ${c.green('✓')} token belongs to ${c.bold(access.login)}\n` +
          `  ${c.green('✓')} can read ${access.repoFullName}` +
          `${access.private ? c.grey(' (private)') : ''}\n`,
      );

      if (!access.canWrite) {
        // Not fatal: reviewing read-only still produces a Chat summary, and the
        // user may intend that. Say so plainly rather than silently degrading.
        process.stderr.write(
          `  ${c.yellow('!')} this token cannot post comments to ${access.repoFullName}.\n` +
            `    Reviews will still run and notify Chat, but nothing will be posted inline.\n`,
        );
      }

      setGithubToken(opts.token, opts.owner ?? owner, access.login);
      process.stderr.write(
        `  ${c.green('✓')} stored for ${c.bold(opts.owner ?? owner)} in ${credentialsPath()}\n`,
      );
    } else {
      // No repo to check against — still confirm the token is live and whose it is.
      const { currentUser } = await import('../github/client.ts');
      const login = await currentUser(opts.token);
      setGithubToken(opts.token, opts.owner, login);
      process.stderr.write(
        `  ${c.green('✓')} token belongs to ${c.bold(login)}, stored in ${credentialsPath()}\n`,
      );
    }
  }

  if (opts.webhook) {
    if (!/^https:\/\/chat\.googleapis\.com\//.test(opts.webhook)) {
      throw new KavachError(
        'fetch',
        'That does not look like a Google Chat webhook. Expected https://chat.googleapis.com/v1/spaces/...',
      );
    }
    setChatWebhook(opts.webhook);
    process.stderr.write(`  ${c.green('✓')} Chat webhook stored (${maskWebhook(opts.webhook)})\n`);
  }

  if (opts.testChat) {
    const url = resolveChatWebhook();
    if (!url) throw new KavachError('fetch', 'No Chat webhook configured to test.');

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify({ text: 'Kavach is connected. PR reviews will arrive here.' }),
    });

    if (!res.ok) throw new KavachError('fetch', `Chat webhook returned ${res.status}.`);
    process.stderr.write(`  ${c.green('✓')} test message sent to Chat\n`);
  }

  if (!opts.token && !opts.webhook && !opts.testChat) {
    printStatus(opts.owner);
    return;
  }

  process.stderr.write('\n' + c.grey('  Setup complete. Paste a PR URL to review.\n\n'));
}

function printStatus(owner?: string): void {
  const status = credentialsStatus(owner);
  const creds = loadCredentials();
  const token = resolveGithubToken(owner);
  const webhook = resolveChatWebhook();

  const sourceLabel = {
    env: 'from environment',
    owner: `stored for ${owner}`,
    default: 'stored default',
    none: '',
  }[status.tokenSource];

  process.stderr.write(
    `  GitHub token   ${token ? c.green(maskToken(token)) : c.red('not configured')}` +
      `${token ? c.grey(`  ${sourceLabel}`) : ''}\n` +
      `${creds.githubLogin ? c.grey(`                 account: ${creds.githubLogin}\n`) : ''}` +
      `  Chat webhook   ${webhook ? c.green(maskWebhook(webhook)) : c.yellow('not configured')}\n` +
      `  Stored at      ${c.grey(status.path)}\n`,
  );

  const owners = Object.keys(creds.githubTokensByOwner ?? {});
  if (owners.length > 0) {
    process.stderr.write(c.grey(`  Per-org tokens ${owners.join(', ')}\n`));
  }

  if (!token) {
    process.stderr.write(
      '\n' +
        c.grey('  Kavach needs a GitHub token with `repo` scope.\n') +
        c.grey('  Create one at https://github.com/settings/tokens/new?scopes=repo\n') +
        c.grey('  Then: kavach setup --token <token> --repo owner/repo\n'),
    );
  }
  process.stderr.write('\n');
}
