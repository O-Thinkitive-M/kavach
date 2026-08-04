// Minimal GitHub REST client. Native fetch, no Octokit.

import { KavachError, type Stage } from '../types.ts';

const API = 'https://api.github.com';

function token(): string {
  const t = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (!t) {
    throw new KavachError(
      'fetch',
      'GITHUB_TOKEN is not set. Export a token with `repo` scope and retry.',
    );
  }
  return t;
}

/** Never let a token reach a log or an error message. */
function redact(s: string): string {
  return s.replace(/gh[pousr]_[A-Za-z0-9]{16,}/g, 'gh?_***');
}

export interface RequestOpts {
  method?: string;
  body?: unknown;
  stage?: Stage;
}

export async function gh<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  const { method = 'GET', body, stage = 'fetch' } = opts;
  const url = path.startsWith('http') ? path : API + path;

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token()}`,
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
    throw new KavachError(stage, explain(res.status, path, text));
  }

  return (await res.json()) as T;
}

function explain(status: number, path: string, text: string): string {
  const detail = text.slice(0, 300);
  if (status === 401) return 'GitHub rejected the token (401). It may be expired or revoked.';
  if (status === 403 && /rate limit/i.test(text)) return 'GitHub rate limit exceeded (403).';
  if (status === 403) return `Token lacks permission for ${path} (403). Needs \`repo\` scope.`;
  if (status === 404) {
    return `Not found: ${path} (404). Private repo without access, or the PR does not exist.`;
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
export async function currentUser(): Promise<string> {
  const user = await gh<{ login: string }>('/user');
  return user.login;
}
