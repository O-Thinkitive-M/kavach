// Post a review. One atomic call: one round trip, no half-posted reviews.

import { gh } from './client.ts';
import type { PrMeta } from '../types.ts';

export interface InlineComment {
  path: string;
  line: number;
  side: 'RIGHT';
  body: string;
}

export async function postReview(
  pr: PrMeta,
  body: string,
  comments: InlineComment[],
): Promise<{ id: number; html_url: string }> {
  return gh<{ id: number; html_url: string }>(
    `/repos/${pr.owner}/${pr.repo}/pulls/${pr.number}/reviews`,
    {
      method: 'POST',
      stage: 'publish',
      body: {
        commit_id: pr.headSha,
        // Never REQUEST_CHANGES: uncertain findings must not block a merge.
        event: 'COMMENT',
        body,
        comments,
      },
    },
  );
}
