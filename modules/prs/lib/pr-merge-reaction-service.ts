import { writeSystemLogFireAndForget } from "@/modules/observability/lib/system-logger";
import type { MonitoredPr } from "@/modules/prs/lib/domain";
import { getPullRequestState } from "@/modules/prs/lib/gh-client";
import { getPrSlackShareThreadByUrl } from "@/modules/prs/lib/pr-slack-share-repository";
import { findPrMentionsInSlackChannel, resolveSlackChannelId } from "@/modules/slack/lib/slack-channel-history";
import { addSlackReaction } from "@/modules/slack/lib/slack-client";
import { getSlackPrChannel, isSlackConfigured } from "@/modules/slack/lib/slack-config";

const MERGE_REACTION_LOG_SOURCE = "prs:merge-reaction";
export const MERGE_REACTION_EMOJI = "rocket";
/** How far back to look for a PR posted by hand (not recorded in `pr_slack_shares`). */
const HAND_POSTED_LOOKBACK_DAYS = 30;

type MergedPr = Pick<MonitoredPr, "id" | "number" | "url" | "repository">;

export type MergeReactionOutcome = {
  url: string;
  status: "reacted" | "already_reacted" | "not_merged" | "not_found" | "error";
  error?: string;
};

/** PRs that were in the previous monitor snapshot and are gone from the next one. */
export function findPrsThatLeftMonitor(previous: MonitoredPr[] | null, next: MonitoredPr[]): MonitoredPr[] {
  if (previous === null) {
    return [];
  }
  const nextIds = new Set(next.map((pr) => pr.id));
  return previous.filter((pr) => !nextIds.has(pr.id));
}

/**
 * For PRs that left the open list: confirm on GitHub that they were merged (not just closed)
 * and react with :rocket: on the channel message that announced them.
 */
export async function reactToMergedPrs(prs: MergedPr[]): Promise<MergeReactionOutcome[]> {
  if (prs.length === 0 || !isSlackConfigured()) {
    return [];
  }

  const outcomes: MergeReactionOutcome[] = [];
  const merged: MergedPr[] = [];

  for (const pr of prs) {
    try {
      const state = await getPullRequestState({ repository: pr.repository, number: pr.number });
      if (state === "MERGED") {
        merged.push(pr);
      } else {
        outcomes.push({ url: pr.url, status: "not_merged" });
      }
    } catch (error) {
      outcomes.push({ url: pr.url, status: "error", error: errorMessage(error) });
    }
  }

  if (merged.length === 0) {
    return logOutcomes(outcomes);
  }

  const targets = new Map<string, { channel: string; ts: string }>();
  const unrecorded: MergedPr[] = [];
  for (const pr of merged) {
    const share = await getPrSlackShareThreadByUrl(pr.url);
    if (share) {
      targets.set(pr.url, { channel: share.channel, ts: share.threadTs });
    } else {
      unrecorded.push(pr);
    }
  }

  if (unrecorded.length > 0) {
    try {
      const channel = getSlackPrChannel();
      const found = await findPrMentionsInSlackChannel({
        channel,
        urls: unrecorded.map((pr) => pr.url),
        lookbackDays: HAND_POSTED_LOOKBACK_DAYS
      });
      for (const pr of unrecorded) {
        // Newest first; the announcement is the oldest top-level message linking the PR.
        const announcement = (found.mentionsByUrl.get(pr.url) ?? []).filter((m) => m.ts === m.threadTs).at(-1);
        if (announcement) {
          targets.set(pr.url, { channel: found.channelId, ts: announcement.ts });
        }
      }
    } catch (error) {
      for (const pr of unrecorded) {
        outcomes.push({ url: pr.url, status: "error", error: errorMessage(error) });
      }
    }
  }

  for (const pr of merged) {
    const target = targets.get(pr.url);
    if (!target) {
      if (!outcomes.some((o) => o.url === pr.url)) {
        outcomes.push({ url: pr.url, status: "not_found" });
      }
      continue;
    }
    try {
      const channelId = await resolveSlackChannelId(target.channel);
      const added = await addSlackReaction({ channel: channelId, timestamp: target.ts, name: MERGE_REACTION_EMOJI });
      outcomes.push({ url: pr.url, status: added ? "reacted" : "already_reacted" });
    } catch (error) {
      outcomes.push({ url: pr.url, status: "error", error: errorMessage(error) });
    }
  }

  return logOutcomes(outcomes);
}

function logOutcomes(outcomes: MergeReactionOutcome[]): MergeReactionOutcome[] {
  const errors = outcomes.filter((o) => o.status === "error");
  if (errors.length > 0) {
    writeSystemLogFireAndForget({
      level: "warn",
      source: MERGE_REACTION_LOG_SOURCE,
      message: "Falha ao reagir com foguete em PR mergeada no Slack.",
      details: { errors }
    });
  }
  return outcomes;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
