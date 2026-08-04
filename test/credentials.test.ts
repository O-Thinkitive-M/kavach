import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Redirect the credential store into a temp dir before importing the module.
const sandbox = mkdtempSync(join(tmpdir(), 'kavach-cred-'));
process.env.KAVACH_HOME = sandbox;

const {
  credentialsPath,
  credentialsStatus,
  loadCredentials,
  maskToken,
  maskWebhook,
  resolveChatWebhook,
  resolveGithubToken,
  saveCredentials,
  setChatWebhook,
  setGithubToken,
} = await import('../src/store/credentials.ts');

const savedEnv = { ...process.env };

beforeEach(() => {
  delete process.env.GITHUB_TOKEN;
  delete process.env.GH_TOKEN;
  delete process.env.GOOGLE_CHAT_WEBHOOK;
  delete process.env.KAVACH_CHAT_WEBHOOK;
  try {
    rmSync(credentialsPath());
  } catch {
    // Nothing stored yet.
  }
});

afterEach(() => {
  process.env = { ...savedEnv, KAVACH_HOME: sandbox };
});

test('returns null when nothing is configured, rather than throwing', () => {
  assert.equal(resolveGithubToken(), null);
  assert.equal(resolveChatWebhook(), null);
  assert.equal(credentialsStatus().hasToken, false);
  assert.equal(credentialsStatus().tokenSource, 'none');
});

test('environment variables win over stored credentials', () => {
  setGithubToken('ghp_stored0000000000000000000000000000');
  process.env.GITHUB_TOKEN = 'ghp_fromenv000000000000000000000000000';
  assert.equal(resolveGithubToken(), 'ghp_fromenv000000000000000000000000000');
  assert.equal(credentialsStatus().tokenSource, 'env');
});

test('GH_TOKEN is honored as well as GITHUB_TOKEN', () => {
  process.env.GH_TOKEN = 'ghp_ghtoken000000000000000000000000000';
  assert.equal(resolveGithubToken(), 'ghp_ghtoken000000000000000000000000000');
});

test('a stored token round-trips', () => {
  setGithubToken('ghp_abc0000000000000000000000000000000', undefined, 'octocat');
  assert.equal(resolveGithubToken(), 'ghp_abc0000000000000000000000000000000');
  assert.equal(loadCredentials().githubLogin, 'octocat');
});

test('the credentials file is written 0600 — not world readable', () => {
  setGithubToken('ghp_secret000000000000000000000000000');
  const mode = statSync(credentialsPath()).mode & 0o777;
  assert.equal(mode, 0o600, `mode was ${mode.toString(8)}`);
});

test('an owner-specific token beats the default for that owner only', () => {
  setGithubToken('ghp_default00000000000000000000000000');
  setGithubToken('ghp_acmeorg00000000000000000000000000', 'AcmeCorp');

  assert.equal(resolveGithubToken('acmecorp'), 'ghp_acmeorg00000000000000000000000000');
  // Owner lookup is case-insensitive, since GitHub owners are.
  assert.equal(resolveGithubToken('ACMECORP'), 'ghp_acmeorg00000000000000000000000000');
  // A different owner still falls back to the default.
  assert.equal(resolveGithubToken('someone-else'), 'ghp_default00000000000000000000000000');
});

test('the first token stored also becomes the default', () => {
  setGithubToken('ghp_first0000000000000000000000000000', 'FirstOrg', 'octocat');
  assert.equal(resolveGithubToken('unrelated-org'), 'ghp_first0000000000000000000000000000');
});

test('storing a second org token does not overwrite the default', () => {
  setGithubToken('ghp_first0000000000000000000000000000', 'FirstOrg');
  setGithubToken('ghp_second000000000000000000000000000', 'SecondOrg');

  assert.equal(resolveGithubToken('secondorg'), 'ghp_second000000000000000000000000000');
  assert.equal(resolveGithubToken('firstorg'), 'ghp_first0000000000000000000000000000');
  assert.equal(loadCredentials().githubToken, 'ghp_first0000000000000000000000000000');
});

test('the webhook round-trips and env still wins', () => {
  setChatWebhook('https://chat.googleapis.com/v1/spaces/AAA/messages?key=k&token=t');
  assert.match(resolveChatWebhook() ?? '', /spaces\/AAA/);

  process.env.GOOGLE_CHAT_WEBHOOK = 'https://chat.googleapis.com/v1/spaces/ENV/messages';
  assert.match(resolveChatWebhook() ?? '', /spaces\/ENV/);
});

test('a corrupt credentials file degrades to empty instead of crashing', () => {
  saveCredentials({ schema: 1, githubToken: 'ghp_x00000000000000000000000000000000' });
  writeFileSync(credentialsPath(), '{ not json');
  assert.equal(resolveGithubToken(), null);
});

test('masking never reveals a usable secret', () => {
  const token = 'ghp_1234567890abcdefghijklmnopqrstuvwx';
  const masked = maskToken(token);
  assert.ok(!masked.includes('1234567890abcdef'));
  assert.match(masked, /…/);
  assert.equal(maskToken('short'), '***');

  const webhook = 'https://chat.googleapis.com/v1/spaces/AAQApn5o/messages?key=SECRETKEY&token=SECRETTOKEN';
  const maskedHook = maskWebhook(webhook);
  assert.ok(!maskedHook.includes('SECRETKEY'));
  assert.ok(!maskedHook.includes('SECRETTOKEN'));
  assert.match(maskedHook, /AAQApn5o/);
});

test('status reports where the token came from', () => {
  setGithubToken('ghp_default00000000000000000000000000');
  assert.equal(credentialsStatus().tokenSource, 'default');

  setGithubToken('ghp_scoped000000000000000000000000000', 'MyOrg');
  assert.equal(credentialsStatus('myorg').tokenSource, 'owner');
});

test('the stored file contains no unexpected keys', () => {
  setGithubToken('ghp_abc0000000000000000000000000000000', undefined, 'octocat');
  setChatWebhook('https://chat.googleapis.com/v1/spaces/AAA/messages');
  const stored = JSON.parse(readFileSync(credentialsPath(), 'utf8'));
  assert.deepEqual(
    Object.keys(stored).sort(),
    ['githubLogin', 'githubToken', 'googleChatWebhook', 'schema'],
  );
});

process.on('exit', () => rmSync(sandbox, { recursive: true, force: true }));
