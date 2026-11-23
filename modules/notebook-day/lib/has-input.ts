import { buildGitActivityForDay } from "@/modules/notebook-day/lib/git-activity";
import { buildDailySummaryJiraContext, jiraContextHasActivityOnDay } from "@/modules/notebook-day/lib/jira-context";
import { buildDailySummaryPrContext, prContextHasSummaryInput } from "@/modules/notebook-day/lib/pr-context";
import type { DailySummaryContext } from "@/modules/notebook-day/lib/types";
import { getActiveNoteByNotebookDay } from "@/modules/journal/lib/note-repository";

/** Day input: journal note, Jira ticket updated, PR review activity or authored commits. */
export function contextHasSummaryInput(context: DailySummaryContext): boolean {
  return (
    Boolean(context.noteBody?.trim()) ||
    jiraContextHasActivityOnDay(context.jira) ||
    prContextHasSummaryInput(context.prs) ||
    (context.gitActivity?.length ?? 0) > 0
  );
}

export async function hasNotebookContentOnDay(notebookDay: string): Promise<boolean> {
  const note = await getActiveNoteByNotebookDay(notebookDay);
  return Boolean(note?.body?.trim());
}

export async function dayHasJiraActivityOnDay(day: string): Promise<boolean> {
  const jira = await buildDailySummaryJiraContext(day);
  return jiraContextHasActivityOnDay(jira);
}

export async function dayHasPrActivityOnDay(day: string): Promise<boolean> {
  const prs = await buildDailySummaryPrContext(day);
  return prContextHasSummaryInput(prs);
}

export async function dayHasSummaryInput(day: string): Promise<boolean> {
  const [hasNote, hasJira, hasPr, gitActivity] = await Promise.all([
    hasNotebookContentOnDay(day),
    dayHasJiraActivityOnDay(day),
    dayHasPrActivityOnDay(day),
    buildGitActivityForDay(day)
  ]);
  return hasNote || hasJira || hasPr || gitActivity.length > 0;
}
