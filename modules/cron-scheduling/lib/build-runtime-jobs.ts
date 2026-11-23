import {
  runDashboardBriefingCron,
  runJiraSyncCron,
  runPrReviewRemindersCron,
  runPrSyncCron,
  runPrAiReviewCron
} from "@/modules/devtools/lib/cron-job-runners";
import { CRON_JOB_SCHEDULE_SPECS } from "@/modules/cron-scheduling/lib/schedules";
import type { CronJobSchedule } from "@/modules/cron-scheduling/lib/types";

const RUNNERS = {
  "cron:prs-sync": () => runPrSyncCron({ manual: false }),
  "cron:pr-review-reminders": () => runPrReviewRemindersCron({ manual: false }),
  "cron:jira-sync": () => runJiraSyncCron({ manual: false }),
  "cron:dashboard-briefing": () => runDashboardBriefingCron({ manual: false }),
  "cron:pr-ai-review": () => runPrAiReviewCron({ manual: false })
} as const;

export function buildScheduledCronJobs(): CronJobSchedule[] {
  return CRON_JOB_SCHEDULE_SPECS.map((spec) => ({
    ...spec,
    run: () => {
      void RUNNERS[spec.id]();
    }
  }));
}
