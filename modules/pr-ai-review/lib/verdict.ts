import type { PullRequestReviewRecord } from "@/modules/prs/lib/gh-client";
import type { AiReviewVerdict } from "@/modules/pr-ai-review/lib/domain";

const STATE_TO_VERDICT: Record<string, AiReviewVerdict> = {
  APPROVED: "APPROVE",
  COMMENTED: "COMMENT",
  CHANGES_REQUESTED: "REQUEST_CHANGES"
};

export type PickedVerdict = { verdict: AiReviewVerdict; reviewUrl: string | null };

/** Latest review by `login` submitted at or after `since` with a verdict state. */
export function pickAiReviewVerdict(
  reviews: PullRequestReviewRecord[],
  login: string,
  since: Date
): PickedVerdict | null {
  const normalized = login.trim().toLowerCase();
  const sinceMs = since.getTime();
  let picked: { at: number; review: PullRequestReviewRecord; verdict: AiReviewVerdict } | null = null;

  for (const review of reviews) {
    if (review.login.toLowerCase() !== normalized) {
      continue;
    }
    const verdict = STATE_TO_VERDICT[review.state];
    if (!verdict) {
      continue;
    }
    const at = Date.parse(review.submittedAt);
    if (!Number.isFinite(at) || at < sinceMs) {
      continue;
    }
    if (!picked || at >= picked.at) {
      picked = { at, review, verdict };
    }
  }

  return picked ? { verdict: picked.verdict, reviewUrl: picked.review.url } : null;
}

export const VERDICT_REACTION_EMOJI: Record<AiReviewVerdict, string> = {
  APPROVE: "white_check_mark",
  COMMENT: "speech_balloon",
  REQUEST_CHANGES: "speech_balloon"
};
