import { getPrSlackShareThreadByUrl } from "@/modules/prs/lib/pr-slack-share-repository";
import { findPrMentionsInSlackChannel } from "@/modules/slack/lib/slack-channel-history";
import { getSlackPrChannel } from "@/modules/slack/lib/slack-config";

/** How far back to look for a PR posted by hand (not recorded in `pr_slack_shares`). */
export const HAND_POSTED_LOOKBACK_DAYS = 30;

export type PrAnnouncementTarget = { channel: string; ts: string };

export type FindPrAnnouncementsResult = {
  targets: Map<string, PrAnnouncementTarget>;
  /** URLs whose channel scan failed, with the error message. */
  errors: Map<string, string>;
};

/**
 * Locates the channel message that announced each PR: first the share the app recorded,
 * else the oldest top-level message in the PR channel linking it (within 30 days).
 */
export async function findPrAnnouncements(urls: string[]): Promise<FindPrAnnouncementsResult> {
  const targets = new Map<string, PrAnnouncementTarget>();
  const errors = new Map<string, string>();
  const unrecorded: string[] = [];

  for (const url of urls) {
    const share = await getPrSlackShareThreadByUrl(url);
    if (share) {
      targets.set(url, { channel: share.channel, ts: share.threadTs });
    } else {
      unrecorded.push(url);
    }
  }

  if (unrecorded.length === 0) {
    return { targets, errors };
  }

  try {
    const found = await findPrMentionsInSlackChannel({
      channel: getSlackPrChannel(),
      urls: unrecorded,
      lookbackDays: HAND_POSTED_LOOKBACK_DAYS
    });
    for (const url of unrecorded) {
      // Newest first; the announcement is the oldest top-level message linking the PR.
      const announcement = (found.mentionsByUrl.get(url) ?? []).filter((m) => m.ts === m.threadTs).at(-1);
      if (announcement) {
        targets.set(url, { channel: found.channelId, ts: announcement.ts });
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    for (const url of unrecorded) {
      errors.set(url, message);
    }
  }

  return { targets, errors };
}
