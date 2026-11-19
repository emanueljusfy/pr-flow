import {
  buildPrReviewReminderDigest,
  type PrReviewReminderDigestItem
} from "@/modules/prs/lib/core/pr-review-reminder-digest";
import { postSlackMessage } from "@/modules/slack/lib/slack-client";
import { getSlackPrChannel } from "@/modules/slack/lib/slack-config";
import {
  formatSlackGithubUserMentions,
  resolveGithubLoginsToSlackIds
} from "@/modules/slack/lib/slack-github-user-resolve";
import { formatSlackUsergroupMentions } from "@/modules/slack/lib/slack-mention-format";

/** Renders the digest with real Slack mentions (GitHub login -> Slack user). */
export async function renderPrReviewReminderDigest(
  items: PrReviewReminderDigestItem[],
  intro?: string
): Promise<string> {
  const body = buildPrReviewReminderDigest(items, intro);
  const loginToSlackId = await resolveGithubLoginsToSlackIds(items.flatMap((item) => item.pendingReviewers));
  return formatSlackUsergroupMentions(formatSlackGithubUserMentions(body, loginToSlackId));
}

/** Posts one top-level message in the PR channel listing every PR and its pending reviewers. */
export async function postPrReviewReminderDigest(input: {
  items: PrReviewReminderDigestItem[];
  intro?: string;
}): Promise<{ channel: string; ts: string | null; text: string }> {
  const text = await renderPrReviewReminderDigest(input.items, input.intro);
  const channel = getSlackPrChannel();
  const posted = await postSlackMessage({
    channel,
    text,
    linkNames: true,
    unfurlLinks: false,
    unfurlMedia: false
  });
  return { channel, ts: posted.ts ?? null, text };
}
