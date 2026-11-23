/**
 * Contexto do notebook day: montagem, tipos, regra de insumo e formatação para prompt.
 * Consumers: dashboard (briefing), journal (day draft).
 */

export type {
  AuthoredCommit,
  DailySummaryAlreadyExists,
  DailySummaryContext,
  DailySummaryError,
  DailySummaryJiraContext,
  DailySummaryJiraItem,
  DailySummaryMissingApiKey,
  DailySummaryNoInput,
  DailySummaryNotGenerated,
  DailySummaryPrContext,
  DailySummaryPrItem,
  DailySummaryPrMergedItem,
  DailySummaryPrStatusChange,
  DailySummaryQueueItem,
  DailySummaryRateLimited,
  DailySummaryResponse,
  DailySummaryReviewEvent,
  DailySummaryReviewItem,
  DailySummarySuccess
} from "@/modules/notebook-day/lib/types";

export { buildGitActivityForDay, selectAuthoredCommits } from "@/modules/notebook-day/lib/git-activity";

export {
  buildNotebookDayContext,
  buildDailySummaryContext
} from "@/modules/notebook-day/lib/build-context";

export {
  buildDailySummaryJiraContext,
  jiraContextHasActivityOnDay
} from "@/modules/notebook-day/lib/jira-context";

export {
  buildDailySummaryPrContext,
  prContextHasSummaryInput
} from "@/modules/notebook-day/lib/pr-context";

export { formatDailySummaryContextData } from "@/modules/notebook-day/lib/prompt";

export {
  contextHasSummaryInput,
  dayHasSummaryInput,
  dayHasJiraActivityOnDay,
  dayHasPrActivityOnDay,
  hasNotebookContentOnDay
} from "@/modules/notebook-day/lib/has-input";
