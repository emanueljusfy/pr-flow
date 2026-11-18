import {
  computeNextReviewReminderRunAt,
  resolveScheduleMessageToStore
} from "@/modules/prs/lib/core/pr-review-reminder";
import type { PrReviewReminderScheduleInfo } from "@/modules/prs/lib/domain";
import { loadPrMonitorCacheAllowStale } from "@/modules/prs/lib/pr-cache-repository";
import { postPrReviewReminder } from "@/modules/prs/lib/pr-review-reminder-service";
import {
  disablePrReviewReminderSchedule,
  listDuePrReviewReminderSchedules,
  markPrReviewReminderScheduleSent,
  upsertPrReviewReminderSchedule
} from "@/modules/prs/lib/pr-review-reminder-schedule-repository";

export async function schedulePrReviewReminderAfterSend(input: {
  url: string;
  repository: string;
  number: number;
  message: string;
  pendingReviewers: string[];
  intervalMinutes: number;
  remindedAt?: Date;
}): Promise<PrReviewReminderScheduleInfo> {
  const remindedAt = input.remindedAt ?? new Date();
  return upsertPrReviewReminderSchedule({
    prUrl: input.url,
    repository: input.repository,
    number: input.number,
    intervalMinutes: input.intervalMinutes,
    message: resolveScheduleMessageToStore(input.message, input.pendingReviewers),
    nextRunAt: computeNextReviewReminderRunAt(remindedAt, input.intervalMinutes),
    lastRemindedAt: remindedAt
  });
}

export async function cancelPrReviewReminderSchedule(url: string): Promise<boolean> {
  return disablePrReviewReminderSchedule(url);
}

export type ProcessDuePrReviewRemindersResult = {
  processed: number;
  sent: number;
  disabled: number;
  errors: number;
};

export async function processDuePrReviewReminderSchedules(
  asOf: Date = new Date()
): Promise<ProcessDuePrReviewRemindersResult> {
  const due = await listDuePrReviewReminderSchedules(asOf);
  const cache = await loadPrMonitorCacheAllowStale();
  const prsByUrl = new Map((cache?.data ?? []).map((pr) => [pr.url, pr]));

  let sent = 0;
  let disabled = 0;
  let errors = 0;

  for (const schedule of due) {
    const pr = prsByUrl.get(schedule.prUrl);
    const pendingReviewers = pr?.pendente ?? [];

    if (!pr || pendingReviewers.length === 0) {
      await disablePrReviewReminderSchedule(schedule.prUrl);
      disabled += 1;
      continue;
    }

    const result = await postPrReviewReminder({
      url: schedule.prUrl,
      repository: schedule.repository,
      number: schedule.number,
      message: schedule.message ?? undefined,
      pendingReviewers
    });

    if (result.status === "ok") {
      const remindedAt = new Date();
      await markPrReviewReminderScheduleSent({
        prUrl: schedule.prUrl,
        lastRemindedAt: remindedAt,
        nextRunAt: computeNextReviewReminderRunAt(remindedAt, schedule.intervalMinutes)
      });
      sent += 1;
      continue;
    }

    if (result.status === "no_pending" || result.status === "not_shared") {
      await disablePrReviewReminderSchedule(schedule.prUrl);
      disabled += 1;
      continue;
    }

    errors += 1;
  }

  return {
    processed: due.length,
    sent,
    disabled,
    errors
  };
}
