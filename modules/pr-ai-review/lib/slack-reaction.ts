import { writeSystemLogFireAndForget } from "@/modules/observability/lib/system-logger";
import { findPrAnnouncements } from "@/modules/prs/lib/pr-slack-announcement";
import { resolveSlackChannelId } from "@/modules/slack/lib/slack-channel-history";
import { addSlackReaction } from "@/modules/slack/lib/slack-client";
import { isSlackConfigured } from "@/modules/slack/lib/slack-config";
import type { AiReviewSlackReaction, AiReviewVerdict } from "@/modules/pr-ai-review/lib/domain";
import { VERDICT_REACTION_EMOJI } from "@/modules/pr-ai-review/lib/verdict";

const LOG_SOURCE = "prs:ai-review-reaction";

/** Reacts on the PR announcement per the channel rule: approved ✅, comment 💬. Never throws. */
export async function reactToAiReviewVerdict(input: {
  prUrl: string;
  verdict: AiReviewVerdict;
}): Promise<AiReviewSlackReaction> {
  if (!isSlackConfigured()) {
    return "skipped";
  }

  try {
    const { targets, errors } = await findPrAnnouncements([input.prUrl]);
    const scanError = errors.get(input.prUrl);
    if (scanError) {
      throw new Error(scanError);
    }
    const target = targets.get(input.prUrl);
    if (!target) {
      return "not_found";
    }
    const channelId = await resolveSlackChannelId(target.channel);
    const added = await addSlackReaction({
      channel: channelId,
      timestamp: target.ts,
      name: VERDICT_REACTION_EMOJI[input.verdict]
    });
    return added ? "reacted" : "already_reacted";
  } catch (error) {
    writeSystemLogFireAndForget({
      level: "warn",
      source: LOG_SOURCE,
      message: "Falha ao reagir no anúncio da PR após a review da IA.",
      details: { prUrl: input.prUrl, verdict: input.verdict, error: error instanceof Error ? error.message : String(error) }
    });
    return "error";
  }
}
