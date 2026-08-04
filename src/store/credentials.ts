// Credential store.
//
// Lives at ~/.kavach/credentials.json, mode 0600, deliberately outside any repo
// so a token can never be committed by accident. Environment variables always
// win, so CI and one-off overrides need no file at all.
//
// Tokens are keyed by owner (org or user) as well as a default, which lets one
// machine review work and personal repos with different tokens.

import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface Credentials {
  schema: number;
  /** Fallback token used when no owner-specific token matches. */
  githubToken?: string;
  /** Owner (org or user, lowercased) -> token. Checked before the default. */
  githubTokensByOwner?: Record<string, string>;
  googleChatWebhook?: string;
  /** Login the default token belongs to, recorded at setup for display only. */
  githubLogin?: string;
}

const SCHEMA = 1;

export function credentialsDir(): string {
  return process.env.KAVACH_HOME || join(homedir(), '.kavach');
}

export function credentialsPath(): string {
  return join(credentialsDir(), 'credentials.json');
}

export function loadCredentials(): Credentials {
  try {
    const raw = JSON.parse(readFileSync(credentialsPath(), 'utf8'));
    return { schema: SCHEMA, ...raw };
  } catch {
    return { schema: SCHEMA };
  }
}

export function saveCredentials(creds: Credentials): void {
  const dir = credentialsDir();
  mkdirSync(dir, { recursive: true });

  const path = credentialsPath();
  writeFileSync(path, JSON.stringify({ schema: SCHEMA, ...creds }, null, 2) + '\n', {
    mode: 0o600,
  });
  // Re-assert the mode: writeFileSync only applies it when creating the file.
  chmodSync(path, 0o600);
}

/**
 * Resolve a GitHub token for a repo owner.
 *
 * Order: env var → owner-specific stored token → default stored token.
 * Returns null when nothing is available, so callers can prompt rather than
 * throwing an opaque error.
 */
export function resolveGithubToken(owner?: string): string | null {
  const fromEnv = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (fromEnv) return fromEnv;

  const creds = loadCredentials();
  if (owner) {
    const scoped = creds.githubTokensByOwner?.[owner.toLowerCase()];
    if (scoped) return scoped;
  }
  return creds.githubToken ?? null;
}

export function resolveChatWebhook(): string | null {
  const fromEnv = process.env.GOOGLE_CHAT_WEBHOOK || process.env.KAVACH_CHAT_WEBHOOK;
  if (fromEnv) return fromEnv;
  return loadCredentials().googleChatWebhook ?? null;
}

export function setGithubToken(token: string, owner?: string, login?: string): void {
  const creds = loadCredentials();
  if (owner) {
    creds.githubTokensByOwner = {
      ...(creds.githubTokensByOwner ?? {}),
      [owner.toLowerCase()]: token,
    };
    // First token stored also becomes the default, so a single-org user is done.
    if (!creds.githubToken) {
      creds.githubToken = token;
      if (login) creds.githubLogin = login;
    }
  } else {
    creds.githubToken = token;
    if (login) creds.githubLogin = login;
  }
  saveCredentials(creds);
}

export function setChatWebhook(url: string): void {
  const creds = loadCredentials();
  creds.googleChatWebhook = url;
  saveCredentials(creds);
}

/**
 * Never print a token. Shows the prefix (which identifies the token *type*, not
 * the secret) and the last 4, which is enough to tell two tokens apart.
 */
export function maskToken(token: string): string {
  if (token.length <= 12) return '***';
  const prefix = /^(gh[pousr]_|github_pat_)/.exec(token)?.[1] ?? '';
  return `${prefix}…${token.slice(-4)}`;
}

/** Webhooks carry an auth token in the query string, so show only the space id. */
export function maskWebhook(url: string): string {
  const space = /spaces\/([A-Za-z0-9_-]+)/.exec(url);
  return space ? `chat.googleapis.com/…/spaces/${space[1]}` : 'chat.googleapis.com/…';
}

export function credentialsStatus(owner?: string): {
  hasToken: boolean;
  hasWebhook: boolean;
  tokenSource: 'env' | 'owner' | 'default' | 'none';
  path: string;
} {
  const creds = loadCredentials();
  const envToken = Boolean(process.env.GITHUB_TOKEN || process.env.GH_TOKEN);
  const ownerToken = owner ? Boolean(creds.githubTokensByOwner?.[owner.toLowerCase()]) : false;

  return {
    hasToken: Boolean(resolveGithubToken(owner)),
    hasWebhook: Boolean(resolveChatWebhook()),
    tokenSource: envToken ? 'env' : ownerToken ? 'owner' : creds.githubToken ? 'default' : 'none',
    path: credentialsPath(),
  };
}
