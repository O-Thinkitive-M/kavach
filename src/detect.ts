// Zero-config stack detection. This replaces the onboarding interview entirely:
// Kavach never asks the user a question, so whatever we cannot detect gets a
// sensible default and can be tuned later via /kavach-config.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG_SCHEMA, KAVACH_VERSION, type KavachConfig } from './types.ts';

const DEFAULT_ICON =
  'https://raw.githubusercontent.com/O-Thinkitive-M/kavach/main/assets/shield-128.png';

function readJson(path: string): Record<string, any> | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function has(root: string, ...files: string[]): boolean {
  return files.some((f) => existsSync(join(root, f)));
}

export function detectPackageManager(root: string): string {
  if (has(root, 'pnpm-lock.yaml')) return 'pnpm';
  if (has(root, 'yarn.lock')) return 'yarn';
  if (has(root, 'bun.lockb', 'bun.lock')) return 'bun';
  if (has(root, 'package-lock.json')) return 'npm';
  if (has(root, 'poetry.lock')) return 'poetry';
  if (has(root, 'requirements.txt')) return 'pip';
  if (has(root, 'go.sum', 'go.mod')) return 'go';
  if (has(root, 'Cargo.lock', 'Cargo.toml')) return 'cargo';
  if (has(root, 'pom.xml')) return 'maven';
  if (has(root, 'build.gradle', 'build.gradle.kts')) return 'gradle';
  if (has(root, 'Gemfile')) return 'bundler';
  if (has(root, 'composer.json')) return 'composer';
  return 'unknown';
}

export function detectLanguage(root: string, deps: Record<string, string>): string {
  if (has(root, 'tsconfig.json') || deps.typescript) return 'typescript';
  if (has(root, 'package.json')) return 'javascript';
  if (has(root, 'go.mod')) return 'go';
  if (has(root, 'Cargo.toml')) return 'rust';
  if (has(root, 'pom.xml', 'build.gradle', 'build.gradle.kts')) return 'java';
  if (has(root, 'requirements.txt', 'pyproject.toml', 'setup.py')) return 'python';
  if (has(root, 'Gemfile')) return 'ruby';
  if (has(root, 'composer.json')) return 'php';
  return 'unknown';
}

export function detectFramework(root: string, deps: Record<string, string>): string {
  if (deps.next) return 'next';
  if (deps.nuxt) return 'nuxt';
  if (deps['@remix-run/react']) return 'remix';
  if (deps['@angular/core']) return 'angular';
  if (deps.svelte || deps['@sveltejs/kit']) return 'svelte';
  if (deps.vue) return 'vue';
  if (deps['@nestjs/core']) return 'nest';
  if (deps.express) return 'express';
  if (deps.fastify) return 'fastify';
  if (deps.react) return 'react';
  if (has(root, 'manage.py')) return 'django';
  if (has(root, 'go.mod')) return 'go';
  return 'none';
}

export function detectTestFramework(root: string, deps: Record<string, string>): string {
  if (deps.vitest) return 'vitest';
  if (deps.jest || has(root, 'jest.config.js', 'jest.config.ts')) return 'jest';
  if (deps.mocha) return 'mocha';
  if (deps['@playwright/test']) return 'playwright';
  if (deps.cypress) return 'cypress';
  if (deps.pytest || has(root, 'pytest.ini', 'conftest.py')) return 'pytest';
  if (has(root, 'go.mod')) return 'go test';
  return 'unknown';
}

/** react + typescript etc. Drives which reviewers are plausible for this repo. */
export function detectStack(root: string, deps: Record<string, string>): string[] {
  const stack = new Set<string>();
  const lang = detectLanguage(root, deps);
  if (lang !== 'unknown') stack.add(lang);

  const framework = detectFramework(root, deps);
  if (framework !== 'none') stack.add(framework);

  if (deps.react || deps.next) stack.add('react');
  if (deps.tailwindcss) stack.add('tailwind');
  if (deps.prisma || deps['@prisma/client']) stack.add('prisma');
  if (deps.graphql) stack.add('graphql');
  return [...stack];
}

function detectMonorepo(root: string, pkg: Record<string, any> | null): boolean {
  if (pkg?.workspaces) return true;
  return has(root, 'pnpm-workspace.yaml', 'lerna.json', 'turbo.json', 'nx.json', 'rush.json');
}

/** Seed ignore globs from .gitignore so generated output is skipped for free. */
export function seedIgnores(root: string): string[] {
  const base = [
    '**/*.lock',
    '**/*-lock.json',
    '**/*.min.js',
    '**/*.min.css',
    '**/*.map',
    '**/*.snap',
    'dist/**',
    'build/**',
    'vendor/**',
    '**/__generated__/**',
    '**/*.generated.*',
    '**/*.pb.go',
  ];

  try {
    const lines = readFileSync(join(root, '.gitignore'), 'utf8').split('\n');
    for (const line of lines) {
      const entry = line.trim();
      if (!entry || entry.startsWith('#') || entry.startsWith('!')) continue;
      const glob = entry.endsWith('/') ? `${entry}**` : entry;
      if (!base.includes(glob)) base.push(glob);
    }
  } catch {
    // No .gitignore is fine — the base list still applies.
  }

  return base.slice(0, 80);
}

/** Build a complete config for a repo we have never seen. Never prompts. */
export function detectConfig(root: string): KavachConfig {
  const pkg = readJson(join(root, 'package.json'));
  const deps: Record<string, string> = {
    ...(pkg?.dependencies ?? {}),
    ...(pkg?.devDependencies ?? {}),
  };

  return {
    schema: CONFIG_SCHEMA,
    kavachVersion: KAVACH_VERSION,
    project: {
      name: pkg?.name ?? root.split('/').filter(Boolean).pop() ?? 'unknown',
      stack: detectStack(root, deps),
      language: detectLanguage(root, deps),
      packageManager: detectPackageManager(root),
      testFramework: detectTestFramework(root, deps),
      framework: detectFramework(root, deps),
      monorepo: detectMonorepo(root, pkg),
    },
    review: {
      mode: 'standard',
      maxComments: 15,
      minConfidenceToComment: 0.5,
      minConfidenceForIssue: 0.8,
      alwaysReviewers: ['security'],
      neverReviewers: [],
    },
    budget: {
      maxContextTokens: 60000,
      maxPerFileTokens: 6000,
      maxFiles: 25,
    },
    notify: {
      googleChat: true,
      onError: true,
      iconUrl: DEFAULT_ICON,
      // Opt-in. /kavach-init asks; until then no log files are written.
      reviewLog: false,
    },
    ignore: seedIgnores(root),
  };
}
