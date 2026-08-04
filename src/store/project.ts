// Where a project's Kavach state lives.
//
// Everything is per-user, under ~/.kavach/projects/<key>/ — nothing is written
// into the repository being reviewed. Two people reviewing the same repo keep
// entirely separate rules, settings and history, and neither can accidentally
// commit their configuration.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { credentialsDir } from './credentials.ts';

/** Legacy in-repo store. Read for migration, never written to again. */
export const LEGACY_STORE_DIR = '.pr-architect';

/**
 * A stable identity for a project.
 *
 * The git remote is preferred: a repo keeps its settings when the folder is
 * renamed, moved, or re-cloned elsewhere. Falls back to the absolute path for
 * a directory that is not a git repo at all.
 */
export function projectKey(root: string): string {
  const remote = gitRemote(root);
  if (!remote) {
    const label = basename(root) || 'project';
    const digest = createHash('sha256').update(root).digest('hex').slice(0, 8);
    return `${sanitize(label)}-${digest}`;
  }

  // Hash the normalized host/owner/repo, not the raw URL, so switching a remote
  // between SSH and HTTPS does not orphan the project's settings.
  const identity = remoteIdentity(remote);
  const digest = createHash('sha256').update(identity).digest('hex').slice(0, 8);
  return `${sanitize(identity.split('/').slice(-2).join('-'))}-${digest}`;
}

/** `git@github.com:acme/api.git` and its https form both -> `github.com/acme/api`. */
function remoteIdentity(remote: string): string {
  const url = remote.trim().replace(/\.git$/, '');
  const scp = /^[^@]+@([^:]+):(.+)$/.exec(url);
  if (scp) return `${scp[1].toLowerCase()}/${scp[2].toLowerCase()}`;

  const web = /^[a-z]+:\/\/(?:[^@/]+@)?([^/]+)\/(.+)$/i.exec(url);
  if (web) return `${web[1].toLowerCase()}/${web[2].toLowerCase()}`;

  return url.toLowerCase();
}

function sanitize(text: string): string {
  return text.replace(/[^A-Za-z0-9._-]/g, '-').slice(0, 60);
}

function gitRemote(root: string): string | null {
  try {
    const url = execFileSync('git', ['-C', root, 'remote', 'get-url', 'origin'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return url || null;
  } catch {
    // Not a git repo, no origin, or git is unavailable.
    return null;
  }
}


export function projectsDir(): string {
  return join(credentialsDir(), 'projects');
}

/** Root of this project's user-scoped store. */
export function projectDir(root: string): string {
  return join(projectsDir(), projectKey(root));
}

export function projectPath(root: string, ...parts: string[]): string {
  return join(projectDir(root), ...parts);
}

export function ensureProjectDir(root: string): void {
  mkdirSync(projectPath(root, 'runs'), { recursive: true });
}

/** Path to the old in-repo store, used only to migrate away from it. */
export function legacyPath(root: string, ...parts: string[]): string {
  return join(root, LEGACY_STORE_DIR, ...parts);
}

export function hasLegacyStore(root: string): boolean {
  return existsSync(join(root, LEGACY_STORE_DIR, 'config.json'));
}
