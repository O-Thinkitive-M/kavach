// Fetch PR metadata and changed files, normalized into Kavach's shapes.

import { gh, ghPaged, type ParsedPrUrl } from './client.ts';
import { parsePatch, commentableLines } from '../diff/parse.ts';
import { KavachError, type ContextFile, type FileStatus, type PrMeta } from '../types.ts';

interface ApiPr {
  number: number;
  title: string;
  body: string | null;
  draft?: boolean;
  user: { login: string } | null;
  head: { ref: string; sha: string };
  base: { ref: string; sha: string };
  html_url: string;
  additions: number;
  deletions: number;
  changed_files: number;
}

interface ApiFile {
  filename: string;
  previous_filename?: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
}

export interface ApiReviewComment {
  id: number;
  path: string;
  line: number | null;
  body: string;
  user: { login: string } | null;
}

export async function fetchPr(ref: ParsedPrUrl): Promise<PrMeta> {
  const { owner, repo, number } = ref;
  const pr = await gh<ApiPr>(`/repos/${owner}/${repo}/pulls/${number}`);
  return {
    owner,
    repo,
    number: pr.number,
    title: pr.title,
    body: (pr.body ?? '').slice(0, 4000),
    author: pr.user?.login ?? 'unknown',
    branch: pr.head.ref,
    baseRef: pr.base.ref,
    headSha: pr.head.sha,
    baseSha: pr.base.sha,
    url: pr.html_url,
    additions: pr.additions,
    deletions: pr.deletions,
    changedFiles: pr.changed_files,
    draft: Boolean(pr.draft),
  };
}

export async function fetchFiles(ref: ParsedPrUrl): Promise<ContextFile[]> {
  const { owner, repo, number } = ref;
  const files = await ghPaged<ApiFile>(`/repos/${owner}/${repo}/pulls/${number}/files`);

  if (files.length === 0) {
    throw new KavachError('fetch', `PR #${number} has no changed files to review.`);
  }

  return files.map((f) => {
    const hunks = parsePatch(f.patch);
    return {
      path: f.filename,
      previousPath: f.previous_filename,
      status: normalizeStatus(f.status),
      additions: f.additions,
      deletions: f.deletions,
      language: languageOf(f.filename),
      truncated: false,
      // GitHub omits `patch` for binary files and for very large diffs.
      skipReason: !f.patch && f.status !== 'removed' ? 'binary' : null,
      hunks,
      commentableLines: commentableLines(hunks),
    };
  });
}

/** Existing review comments, so publish can avoid reposting. */
export async function fetchReviewComments(ref: ParsedPrUrl): Promise<ApiReviewComment[]> {
  const { owner, repo, number } = ref;
  return ghPaged<ApiReviewComment>(`/repos/${owner}/${repo}/pulls/${number}/comments`);
}

function normalizeStatus(s: string): FileStatus {
  const known: FileStatus[] = [
    'added',
    'modified',
    'removed',
    'renamed',
    'copied',
    'changed',
    'unchanged',
  ];
  return (known as string[]).includes(s) ? (s as FileStatus) : 'modified';
}

const EXT_LANG: Record<string, string> = {
  ts: 'typescript',
  tsx: 'tsx',
  mts: 'typescript',
  cts: 'typescript',
  js: 'javascript',
  jsx: 'jsx',
  mjs: 'javascript',
  cjs: 'javascript',
  py: 'python',
  go: 'go',
  java: 'java',
  kt: 'kotlin',
  rb: 'ruby',
  php: 'php',
  rs: 'rust',
  cs: 'csharp',
  swift: 'swift',
  scala: 'scala',
  css: 'css',
  scss: 'scss',
  html: 'html',
  vue: 'vue',
  svelte: 'svelte',
  sql: 'sql',
  sh: 'shell',
  yml: 'yaml',
  yaml: 'yaml',
  json: 'json',
  md: 'markdown',
  tf: 'terraform',
};

export function languageOf(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return EXT_LANG[ext] ?? ext ?? 'unknown';
}
