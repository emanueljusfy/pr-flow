import type { MonitoredPr, PrApiResponse } from "@/modules/prs/lib/domain";
import { getPrReviewReminderSchedulesByUrls } from "@/modules/prs/lib/pr-review-reminder-schedule-repository";
import { getPrSlackSharesByUrls } from "@/modules/prs/lib/pr-slack-share-repository";

export async function enrichPrApiResponse(response: PrApiResponse): Promise<PrApiResponse> {
  if (response.status !== "ok" && response.status !== "stale") {
    return response;
  }

  const withSlack = await enrichMonitoredPrsWithSlackShares(response.data);
  return {
    ...response,
    data: await enrichMonitoredPrsWithReviewReminderSchedules(withSlack)
  };
}

export async function enrichMonitoredPrsWithSlackShares(prs: MonitoredPr[]): Promise<MonitoredPr[]> {
  if (prs.length === 0) {
    return prs;
  }

  const sharesByUrl = await getPrSlackSharesByUrls(prs.map((pr) => pr.url));

  return prs.map((pr) => {
    const slackShare = sharesByUrl.get(pr.url) ?? null;
    if (!slackShare) {
      return pr;
    }

    return { ...pr, slackShare };
  });
}

export async function enrichMonitoredPrsWithReviewReminderSchedules(
  prs: MonitoredPr[]
): Promise<MonitoredPr[]> {
  if (prs.length === 0) {
    return prs;
  }

  const schedulesByUrl = await getPrReviewReminderSchedulesByUrls(prs.map((pr) => pr.url));

  return prs.map((pr) => {
    const reviewReminderSchedule = schedulesByUrl.get(pr.url) ?? null;
    if (!reviewReminderSchedule) {
      return pr;
    }

    return { ...pr, reviewReminderSchedule };
  });
}
