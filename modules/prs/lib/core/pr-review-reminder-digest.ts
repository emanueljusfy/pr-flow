import { formatPendingReviewerMentions } from "@/modules/prs/lib/core/pr-review-reminder";

export const DEFAULT_PR_REVIEW_REMINDER_DIGEST_INTRO =
  "Lembrete gentil: estas PRs ainda aguardam revisão. Quando puderem, peço uma olhada. Obrigado!";

export type PrReviewReminderDigestItem = {
  url: string;
  repository: string;
  number: number;
  title: string;
  pendingReviewers: string[];
  /** Pending reviewers whose approval was dismissed (subset of pendingReviewers). */
  dismissedReviewers?: string[];
};

/** Slack mrkdwn needs &, < and > escaped inside link labels and plain text. */
function escapeSlackText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function repositoryName(repository: string): string {
  return repository.split("/").at(-1) ?? repository;
}

/**
 * One Slack message listing several PRs and who is pending on each. Mentions stay as
 * `@githubLogin` so the caller can resolve them to Slack users.
 */
export function buildPrReviewReminderDigest(items: PrReviewReminderDigestItem[], intro?: string): string {
  const header = intro?.trim() || DEFAULT_PR_REVIEW_REMINDER_DIGEST_INTRO;
  const lines = items.map((item) => {
    const label = `${repositoryName(item.repository)}#${item.number}`;
    const reviewers = formatPendingReviewerMentions(item.pendingReviewers);
    const dismissed = [...new Set(item.dismissedReviewers ?? [])];
    const dismissedNote = dismissed.length > 0 ? ` (aprovação caiu com push novo: ${dismissed.join(", ")})` : "";
    return `• <${item.url}|${label}> ${escapeSlackText(item.title)} — ${reviewers}${dismissedNote}`;
  });
  return [header, "", ...lines].join("\n");
}
