import { buildGitActivityForDay } from "@/modules/notebook-day/lib/git-activity";
import { buildDailySummaryJiraContext } from "@/modules/notebook-day/lib/jira-context";
import { buildDailySummaryPrContext } from "@/modules/notebook-day/lib/pr-context";
import type { DailySummaryContext } from "@/modules/notebook-day/lib/types";
import { getActiveNoteByNotebookDay } from "@/modules/journal/lib/note-repository";

export async function buildNotebookDayContext(day: string): Promise<DailySummaryContext> {
  const [note, jira, prs, gitActivity] = await Promise.all([
    getActiveNoteByNotebookDay(day),
    buildDailySummaryJiraContext(day),
    buildDailySummaryPrContext(day),
    buildGitActivityForDay(day)
  ]);

  return {
    day,
    noteBody: note?.body ?? null,
    jira,
    prs,
    gitActivity
  };
}

/** @deprecated Use `buildNotebookDayContext` — alias para compatibilidade. */
export const buildDailySummaryContext = buildNotebookDayContext;
