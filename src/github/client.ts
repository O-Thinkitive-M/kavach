// Minimal GitHub REST client. Native fetch, no Octokit.

import { resolveGithubToken } from '../store/credentials.ts';
import { KavachError, NeedsCredentialError, type Stage } from '../types.ts';

const API = 'https://api.github.com';

/** Owner of the repo currently being reviewed, so the right token is selected. */
let activeOwner: string | undefined;

export function setActiveOwner(owner: string | undefined): void {
  activeOwner = owner;
}

function token(owner = activeOwner): string {
  const t = resolveGithubToken(owner);
  if (!t) {
    throw new NeedsCredentialError(
      'github-token',
      'No GitHub token available. Kavach needs one to read the PR and post comments.',
      owner,
    );
  }
  return t;
}

/** Never let a token reach a log or an error message. */
function redact(s: string): string {
  return s.replace(/gh[pousr]_[A-Za-z0-9]{16,}/g, 'gh?_***').replace(/github_pat_[A-Za-z0-9_]{20,}/g, 'github_pat_***');
}

export interface RequestOpts {
  method?: string;
  body?: unknown;
  stage?: Stage;
  /** Override the token, used by setup to verify a token before storing it. */
  token?: string;
}

export async function gh<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  const { method = 'GET', body, stage = 'fetch' } = opts;
  const url = path.startsWith('http') ? path : API + path;
  const auth = opts.token ?? token();

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${auth}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'kavach',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new KavachError(stage, `Network error calling GitHub: ${redact(String(err))}`);
  }

  if (!res.ok) {
    const text = redact(await res.text().catch(() => ''));

    // 401/403/404 on a repo path usually means "wrong token", not "broken repo".
    // Surfacing it as recoverable lets the skill ask for a token that covers the
    // owner instead of failing a review the user could still get.
    if (res.status === 401 || res.status === 404 || isPermission(res.status, text)) {
      throw new NeedsCredentialError('github-token', explain(res.status, path, text), activeOwner);
    }

    throw new KavachError(stage, explain(res.status, path, text));
  }

  return (await res.json()) as T;
}

function isPermission(status: number, text: string): boolean {
  return status === 403 && !/rate limit/i.test(text);
}

function explain(status: number, path: string, text: string): string {
  const detail = text.slice(0, 300);
  if (status === 401) return 'GitHub rejected the token (401) — it may be expired or revoked.';
  if (status === 403 && /rate limit/i.test(text)) return 'GitHub rate limit exceeded (403).';
  if (status === 403) return `Token lacks permission for ${path} (403). It needs \`repo\` scope.`;
  if (status === 404) {
    return `Cannot see ${path} (404). Either the PR does not exist, or the token has no access to this repository.`;
  }
  if (status === 422) return `GitHub rejected the request (422): ${detail}`;
  return `GitHub returned ${status} for ${path}: ${detail}`;
}

/** Paginate a list endpoint. Caps pages so a huge PR cannot stall a run. */
export async function ghPaged<T>(path: string, maxPages = 10): Promise<T[]> {
  const out: T[] = [];
  const sep = path.includes('?') ? '&' : '?';
  for (let page = 1; page <= maxPages; page++) {
    const batch = await gh<T[]>(`${path}${sep}per_page=100&page=${page}`);
    out.push(...batch);
    if (batch.length < 100) break;
  }
  return out;
}

export interface ParsedPrUrl {
  owner: string;
  repo: string;
  number: number;
}

/** Accepts a full PR URL, an api.github.com URL, or `owner/repo#123`. */
export function parsePrUrl(input: string): ParsedPrUrl {
  const raw = input.trim();

  const web = /github\.com\/([^/\s]+)\/([^/\s]+)\/pull\/(\d+)/.exec(raw);
  if (web) return { owner: web[1], repo: web[2], number: Number(web[3]) };

  const api = /api\.github\.com\/repos\/([^/\s]+)\/([^/\s]+)\/pulls\/(\d+)/.exec(raw);
  if (api) return { owner: api[1], repo: api[2], number: Number(api[3]) };

  const short = /^([^/\s]+)\/([^/#\s]+)#(\d+)$/.exec(raw);
  if (short) return { owner: short[1], repo: short[2], number: Number(short[3]) };

  throw new KavachError(
    'fetch',
    `Could not read a PR from "${raw.slice(0, 120)}". Expected https://github.com/owner/repo/pull/123`,
  );
}

/** Login of the authenticated user — used to recognize Kavach's own prior comments. */
export async function currentUser(explicitToken?: string): Promise<string> {
  const user = await gh<{ login: string }>('/user', { token: explicitToken });
  return user.login;
}

export interface RepoAccess {
  login: string;
  canWrite: boolean;
  repoFullName: string;
  private: boolean;
}

/**
 * Confirm a token can actually see the repo and post a review, before it is
 * stored. Catches a read-only or wrong-account token at setup instead of
 * halfway through a review.
 */
export async function verifyAccess(
  owner: string,
  repo: string,
  explicitToken?: string,
): Promise<RepoAccess> {
  const login = await currentUser(explicitToken);
  const info = await gh<{
    full_name: string;
    private: boolean;
    permissions?: { push?: boolean; pull?: boolean; admin?: boolean };
  }>(`/repos/${owner}/${repo}`, { token: explicitToken });

  return {
    login,
    // No `permissions` block means an unauthenticated-equivalent view; treat as
    // read-only rather than assuming success.
    canWrite: Boolean(info.permissions?.push || info.permissions?.admin),
    repoFullName: info.full_name,
    private: info.private,
  };
}
