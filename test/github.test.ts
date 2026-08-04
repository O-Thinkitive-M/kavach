import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePrUrl } from '../src/github/client.ts';
import { languageOf } from '../src/github/pr.ts';
import { KavachError } from '../src/types.ts';

// ---------- parsePrUrl: the entry point for every review ----------

test('parses a normal PR URL', () => {
  assert.deepEqual(parsePrUrl('https://github.com/acme/api/pull/42'), {
    owner: 'acme',
    repo: 'api',
    number: 42,
  });
});

test('tolerates the noise around a pasted URL', () => {
  const variants = [
    '  https://github.com/acme/api/pull/42  ',
    'http://github.com/acme/api/pull/42',
    'https://www.github.com/acme/api/pull/42',
    'https://github.com/acme/api/pull/42/files',
    'https://github.com/acme/api/pull/42#discussion_r123',
    'https://github.com/acme/api/pull/42?w=1',
  ];
  for (const input of variants) {
    const parsed = parsePrUrl(input);
    assert.equal(parsed.number, 42, `failed on ${input}`);
    assert.equal(parsed.repo, 'api', `failed on ${input}`);
  }
});

test('accepts the API URL and the owner/repo#n shorthand', () => {
  assert.deepEqual(parsePrUrl('https://api.github.com/repos/acme/api/pulls/7'), {
    owner: 'acme',
    repo: 'api',
    number: 7,
  });
  assert.deepEqual(parsePrUrl('acme/api#7'), { owner: 'acme', repo: 'api', number: 7 });
});

test('handles owner and repo names with dots and dashes', () => {
  assert.deepEqual(parsePrUrl('https://github.com/my-org/my.repo.js/pull/9'), {
    owner: 'my-org',
    repo: 'my.repo.js',
    number: 9,
  });
});

test('rejects things that are not PR URLs, with a helpful message', () => {
  const bad = [
    'not-a-url',
    '',
    'https://github.com/acme/api',
    'https://github.com/acme/api/issues/42',
    'https://gitlab.com/acme/api/pull/42',
  ];
  for (const input of bad) {
    assert.throws(
      () => parsePrUrl(input),
      (err: unknown) => err instanceof KavachError && /github\.com\/owner\/repo\/pull/.test((err as Error).message),
      `should have rejected ${JSON.stringify(input)}`,
    );
  }
});

test('a rejected input does not echo unbounded text back', () => {
  try {
    parsePrUrl('x'.repeat(5000));
    assert.fail('should have thrown');
  } catch (err) {
    assert.ok((err as Error).message.length < 300);
  }
});

// ---------- redact: a security control, so it gets a test ----------
//
// redact() is module-private, so exercise it through the public error path that
// callers actually see.

test('tokens never survive into an error message', async () => {
  const realFetch = globalThis.fetch;
  const token = 'ghp_' + 'a1b2c3d4e5f6g7h8'.repeat(2);

  globalThis.fetch = (async () =>
    new Response(`{"message":"Bad credentials for ${token}"}`, { status: 500 })) as typeof fetch;

  try {
    const { gh } = await import('../src/github/client.ts');
    await gh('/repos/acme/api', { token });
    assert.fail('should have thrown');
  } catch (err) {
    const message = (err as Error).message;
    assert.ok(!message.includes(token), 'raw token leaked into the error');
    assert.match(message, /gh\?_\*\*\*/);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('fine-grained tokens are redacted too', async () => {
  const realFetch = globalThis.fetch;
  const token = 'github_pat_' + 'A1b2C3d4E5f6G7h8I9j0K1'.repeat(2);

  globalThis.fetch = (async () =>
    new Response(`{"message":"nope ${token}"}`, { status: 500 })) as typeof fetch;

  try {
    const { gh } = await import('../src/github/client.ts');
    await gh('/repos/acme/api', { token });
    assert.fail('should have thrown');
  } catch (err) {
    assert.ok(!(err as Error).message.includes(token), 'raw PAT leaked');
  } finally {
    globalThis.fetch = realFetch;
  }
});

// ---------- language detection ----------

test('maps extensions to languages, and degrades gracefully', () => {
  assert.equal(languageOf('src/a.tsx'), 'tsx');
  assert.equal(languageOf('src/a.ts'), 'typescript');
  assert.equal(languageOf('main.go'), 'go');
  assert.equal(languageOf('app/models.py'), 'python');
  // Unknown extensions fall through to the extension itself rather than throwing.
  assert.equal(languageOf('Makefile'), 'makefile');
  assert.equal(languageOf('weird.xyz'), 'xyz');
});
