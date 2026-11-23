import type { DashboardBriefingContext } from "@/modules/dashboard/lib/dashboard-briefing-types";
import { buildNotebookDayContext } from "@/modules/notebook-day";
import { previousBusinessDay, todayLocalDateString } from "@/modules/journal/lib/notebook-day";

export async function buildDashboardBriefingContext(
  today: string = todayLocalDateString()
): Promise<DashboardBriefingContext> {
  const lastWorkday = previousBusinessDay(today);

  const [lastWorkdayContext, todayContext] = await Promise.all([
    buildNotebookDayContext(lastWorkday),
    buildNotebookDayContext(today)
  ]);

  return {
    today,
    previousBusinessDay: lastWorkday,
    lastWorkdayContext,
    todayContext
  };
}
