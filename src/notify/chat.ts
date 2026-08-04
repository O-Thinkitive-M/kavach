// Google Chat webhook. cardsV2 so the shield renders as the card icon.
//
// Chat requires a public HTTPS image URL — it cannot embed local files or data
// URIs, and cannot render .ico at all. If the icon is unset the card degrades to
// text rather than shipping a broken image.

import { resolveChatWebhook } from '../store/credentials.ts';
import { SEVERITIES, type ResolvedFinding, type ReviewContext, type Stage } from '../types.ts';

function webhook(): string | null {
  return resolveChatWebhook();
}

async function post(payload: unknown): Promise<void> {
  const url = webhook();
  if (!url) return;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    // Never surface the webhook URL — it carries an auth token in its query string.
    throw new Error(`Google Chat webhook returned ${res.status}`);
  }
}

function header(title: string, subtitle: string, iconUrl?: string) {
  return {
    title,
    subtitle,
    ...(iconUrl ? { imageUrl: iconUrl, imageType: 'CIRCLE' } : {}),
  };
}

function textWidget(text: string) {
  return { textParagraph: { text } };
}

export async function notifySuccess(
  context: ReviewContext,
  findings: ResolvedFinding[],
  posted: number,
  summary: string,
  iconUrl?: string,
): Promise<void> {
  if (!webhook()) return;

  const { pr, route, budget } = context;
  const counts = SEVERITIES.map(
    (s) => `${s} ${findings.filter((f) => f.severity === s && f.kind !== 'dropped').length}`,
  ).join(' · ');

  const questions = findings.filter((f) => f.kind === 'question').length;
  const issues = findings.filter((f) => f.kind === 'issue').length;

  await post({
    cardsV2: [
      {
        cardId: `kavach-${pr.number}-${pr.headSha.slice(0, 7)}`,
        card: {
          header: header(
            `Kavach — ${truncate(pr.title, 80)}`,
            `#${pr.number} · ${pr.owner}/${pr.repo}`,
            iconUrl,
          ),
          sections: [
            {
              widgets: [
                textWidget(
                  `<b>Review:</b> ${route.mode} · <b>reviewers:</b> ${route.reviewers.join(', ')}`,
                ),
                textWidget(counts),
                textWidget(
                  `<b>Inline comments posted:</b> ${posted} of ${findings.filter((f) => f.kind !== 'dropped').length} findings`,
                ),
                textWidget(
                  `Reviewed ${budget.filesIncluded} of ${budget.filesIncluded + budget.filesSkipped} files` +
                    ` (${Math.round(budget.totalTokens / 1000)}k tokens` +
                    `${budget.filesTruncated ? `, ${budget.filesTruncated} truncated` : ''})`,
                ),
                textWidget(`<b>Summary:</b> ${truncate(stripHtml(summary), 600)}`),
                textWidget(
                  `<b>Confidence:</b> ${issues} verified issue${issues === 1 ? '' : 's'}, ` +
                    `${questions} raised as question${questions === 1 ? '' : 's'}`,
                ),
              ],
            },
            {
              widgets: [
                {
                  buttonList: {
                    buttons: [{ text: 'View PR', onClick: { openLink: { url: pr.url } } }],
                  },
                },
              ],
            },
          ],
        },
      },
    ],
  });
}

export async function notifyError(
  stage: Stage,
  reason: string,
  target: string,
  iconUrl?: string,
): Promise<void> {
  if (!webhook()) return;

  await post({
    cardsV2: [
      {
        cardId: `kavach-error-${stage}`,
        card: {
          header: header('Kavach — review failed', stage, iconUrl),
          sections: [
            {
              widgets: [
                textWidget(`<b>PR:</b> ${truncate(stripHtml(target), 200)}`),
                textWidget(`<b>Stage:</b> ${stage}`),
                textWidget(`<b>Reason:</b> ${truncate(stripHtml(reason), 500)}`),
              ],
            },
          ],
        },
      },
    ],
  });
}

function stripHtml(s: string): string {
  return s.replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}
