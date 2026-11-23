import { writeSystemLogFireAndForget } from "@/modules/observability/lib/system-logger";
import type { MonitoredPr } from "@/modules/prs/lib/domain";
import { getPullRequestState } from "@/modules/prs/lib/gh-client";
import { findPrAnnouncements } from "@/modules/prs/lib/pr-slack-announcement";
import { resolveSlackChannelId } from "@/modules/slack/lib/slack-channel-history";
import { addSlackReaction } from "@/modules/slack/lib/slack-client";
import { isSlackConfigured } from "@/modules/slack/lib/slack-config";

const MERGE_REACTION_LOG_SOURCE = "prs:merge-reaction";
export const MERGE_REACTION_EMOJI = "rocket";

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

  const { targets, errors } = await findPrAnnouncements(merged.map((pr) => pr.url));
  for (const [url, error] of errors) {
    outcomes.push({ url, status: "error", error });
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
