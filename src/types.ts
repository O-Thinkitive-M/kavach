// Kavach shared data models.
//
// context.json keys are deliberately short and `s` is one character: Claude reads
// this file directly, so every byte spends context budget.

export const KAVACH_VERSION = '1.0.0';
export const CONTEXT_SCHEMA = 1;
export const FINDINGS_SCHEMA = 1;
export const CONFIG_SCHEMA = 2;

export type Severity = 'Critical' | 'High' | 'Medium' | 'Low' | 'Suggestion';

export const SEVERITIES: Severity[] = ['Critical', 'High', 'Medium', 'Low', 'Suggestion'];

export type ReviewerName =
  | 'architecture'
  | 'react'
  | 'typescript'
  | 'security'
  | 'performance'
  | 'accessibility'
  | 'testing'
  | 'business-logic';

export const REVIEWERS: ReviewerName[] = [
  'architecture',
  'react',
  'typescript',
  'security',
  'performance',
  'accessibility',
  'testing',
  'business-logic',
];

export type ReviewMode = 'standard' | 'deep';

/** One diff line. `s`: C=context, +=added, -=removed. */
export interface DiffLine {
  s: 'C' | '+' | '-';
  /** LEFT-side line number. Absent on added lines. */
  old?: number;
  /** RIGHT-side line number. Absent on removed lines. */
  new?: number;
  t: string;
}

export interface Hunk {
  header: string;
  lines: DiffLine[];
}

export type FileStatus =
  | 'added'
  | 'modified'
  | 'removed'
  | 'renamed'
  | 'copied'
  | 'changed'
  | 'unchanged';

export type SkipReason = 'ignored' | 'generated' | 'budget' | 'binary' | 'deleted' | 'rename-only';

export interface ContextFile {
  path: string;
  previousPath?: string;
  status: FileStatus;
  additions: number;
  deletions: number;
  language: string;
  truncated: boolean;
  skipReason: SkipReason | null;
  hunks: Hunk[];
  /** RIGHT-side lines a comment may attach to. publish validates against this. */
  commentableLines: number[];
}

export interface PrMeta {
  owner: string;
  repo: string;
  number: number;
  title: string;
  body: string;
  author: string;
  branch: string;
  baseRef: string;
  headSha: string;
  baseSha: string;
  url: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  draft: boolean;
}

export interface RouteResult {
  reviewers: ReviewerName[];
  mode: ReviewMode;
  /** Human-readable justification per reviewer — makes routing debuggable without an LLM. */
  reasons: Record<string, string>;
}

export interface BudgetResult {
  totalTokens: number;
  filesIncluded: number;
  filesSkipped: number;
  filesTruncated: number;
  cap: number;
}

export interface PriorFinding {
  fingerprint: string;
  path: string;
  line: number;
}

export interface KnowledgeBundle {
  rules: string;
  stack: string;
  conventions: string;
}

export interface ReviewContext {
  kavachVersion: string;
  schema: number;
  pr: PrMeta;
  route: RouteResult;
  budget: BudgetResult;
  files: ContextFile[];
  priorFindings: PriorFinding[];
  knowledge: KnowledgeBundle;
}

/** What Claude writes. */
export interface Finding {
  reviewer: ReviewerName | string;
  path: string;
  line: number;
  endLine?: number | null;
  severity: Severity;
  /** 0..1 */
  confidence: number;
  /** Did Claude read the surrounding code and confirm? Not CI-verified. */
  verified: boolean;
  title: string;
  body: string;
  suggestion?: string | null;
  /** business-logic only: the previous behavior this changes. */
  regressionOf?: string | null;
}

export interface FindingsFile {
  schema: number;
  summary: string;
  findings: Finding[];
}

/** How a finding is rendered after policy is applied. */
export type FindingKind = 'issue' | 'suggestion' | 'question' | 'dropped';

export interface ResolvedFinding extends Finding {
  kind: FindingKind;
  fingerprint: string;
  /** Reviewers that independently reported this, after merge. */
  reviewers: string[];
}

export interface KavachConfig {
  schema: number;
  kavachVersion: string;
  project: {
    name: string;
    stack: string[];
    language: string;
    packageManager: string;
    testFramework: string;
    framework: string;
    monorepo: boolean;
  };
  review: {
    mode: ReviewMode;
    maxComments: number;
    minConfidenceToComment: number;
    minConfidenceForIssue: number;
    alwaysReviewers: string[];
    neverReviewers: string[];
  };
  budget: {
    maxContextTokens: number;
    maxPerFileTokens: number;
    maxFiles: number;
  };
  notify: {
    googleChat: boolean;
    onError: boolean;
    iconUrl: string;
  };
  ignore: string[];
}

export interface HistoryEntry {
  pr: number;
  headSha: string;
  at: string;
  fingerprints: string[];
}

export type Stage = 'fetch' | 'review' | 'publish';

/** Thrown anywhere in a run; carries the stage so the Chat error card can name it. */
export class KavachError extends Error {
  stage: Stage;
  constructor(stage: Stage, message: string) {
    super(message);
    this.name = 'KavachError';
    this.stage = stage;
  }
}
