/** Placeholder replaced with `@login` mentions for pending reviewers. */
export const PR_REVIEW_REMINDER_REVIEWERS_PLACEHOLDER = "{reviewers}";

export const DEFAULT_PR_REVIEW_REMINDER_TEMPLATE =
  `Olá ${PR_REVIEW_REMINDER_REVIEWERS_PLACEHOLDER}! Lembrete gentil: esta PR ainda aguarda a revisão de vocês. Quando puderem, peço uma olhada. Obrigado!`;

export const DEFAULT_PR_REVIEW_REMINDER_MESSAGE_WITHOUT_REVIEWERS =
  "Lembrete gentil: esta PR ainda aguarda revisão. Quando puderem, peço uma olhada. Obrigado!";

/** @deprecated Prefer buildPrReviewReminderMessage(pendingReviewers). Kept for older imports/tests. */
export const DEFAULT_PR_REVIEW_REMINDER_MESSAGE = DEFAULT_PR_REVIEW_REMINDER_MESSAGE_WITHOUT_REVIEWERS;

/** Allowed recurring intervals (minutes) for scheduled review reminders. */
export const PR_REVIEW_REMINDER_SCHEDULE_INTERVALS = [60, 120, 240, 480, 1440] as const;

export type PrReviewReminderScheduleIntervalMinutes =
  (typeof PR_REVIEW_REMINDER_SCHEDULE_INTERVALS)[number];

export function isPrReviewReminderScheduleInterval(
  value: number
): value is PrReviewReminderScheduleIntervalMinutes {
  return (PR_REVIEW_REMINDER_SCHEDULE_INTERVALS as readonly number[]).includes(value);
}

export function computeNextReviewReminderRunAt(from: Date, intervalMinutes: number): Date {
  return new Date(from.getTime() + intervalMinutes * 60_000);
}

/**
 * Persist null when the dialog text matches the live default template so the cron
 * can regenerate mentions from current pending reviewers.
 */
export function resolveScheduleMessageToStore(
  message: string,
  pendingReviewers: string[]
): string | null {
  const trimmed = message.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed === buildPrReviewReminderMessage(pendingReviewers)) {
    return null;
  }
  return trimmed;
}

export function formatPendingReviewerMentions(pendingReviewers: string[]): string {
  const mentions = [...new Set(pendingReviewers.map((login) => login.trim()).filter(Boolean))].map(
    (login) => `@${login}`
  );
  if (mentions.length === 0) {
    return "";
  }
  if (mentions.length === 1) {
    return mentions[0]!;
  }
  if (mentions.length === 2) {
    return `${mentions[0]} e ${mentions[1]}`;
  }
  return `${mentions.slice(0, -1).join(", ")} e ${mentions.at(-1)}`;
}

/**
 * Body used when posting the review reminder.
 * Override with `PR_REVIEW_REMINDER_MESSAGE` in `.env` (supports `{reviewers}`).
 */
export function buildPrReviewReminderMessage(pendingReviewers: string[] = []): string {
  const reviewers = formatPendingReviewerMentions(pendingReviewers);
  const fromEnv = process.env.PR_REVIEW_REMINDER_MESSAGE?.trim();
  const template = fromEnv || DEFAULT_PR_REVIEW_REMINDER_TEMPLATE;

  if (!reviewers) {
    if (fromEnv && !fromEnv.includes(PR_REVIEW_REMINDER_REVIEWERS_PLACEHOLDER)) {
      return fromEnv;
    }
    return DEFAULT_PR_REVIEW_REMINDER_MESSAGE_WITHOUT_REVIEWERS;
  }

  if (template.includes(PR_REVIEW_REMINDER_REVIEWERS_PLACEHOLDER)) {
    return template.split(PR_REVIEW_REMINDER_REVIEWERS_PLACEHOLDER).join(reviewers);
  }

  return template;
}

/** @deprecated Use buildPrReviewReminderMessage */
export function getPrReviewReminderMessage(): string {
  return buildPrReviewReminderMessage();
}
