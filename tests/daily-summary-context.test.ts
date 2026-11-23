import { beforeEach, describe, expect, it, vi } from "vitest";

const getActiveNoteByNotebookDay = vi.fn();
const buildDailySummaryJiraContext = vi.fn();
const buildDailySummaryPrContext = vi.fn();

vi.mock("@/modules/journal/lib/note-repository", () => ({
  getActiveNoteByNotebookDay: (...args: unknown[]) => getActiveNoteByNotebookDay(...args)
}));

vi.mock("@/modules/notebook-day/lib/jira-context", () => ({
  buildDailySummaryJiraContext: (...args: unknown[]) => buildDailySummaryJiraContext(...args),
  jiraContextHasActivityOnDay: vi.fn()
}));

vi.mock("@/modules/notebook-day/lib/pr-context", () => ({
  buildDailySummaryPrContext: (...args: unknown[]) => buildDailySummaryPrContext(...args),
  prContextHasSummaryInput: vi.fn()
}));

describe("buildDailySummaryContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("aggregates note, jira and PR context for the day", async () => {
    buildDailySummaryJiraContext.mockResolvedValue({
      sprintLabel: "Sprint 42",
      issues: [
        {
          key: "PROJ-1",
          summary: "Feature X",
          statusName: "Em progresso",
          statusCategoryKey: "indeterminate",
          issueTypeName: "Story",
          priorityName: "High",
          updated: "2026-05-28T15:00:00.000Z",
          updatedOnDay: true,
          hours: "Gasto: 2h",
          timeSpentLabel: "2h",
          estimateLabel: "4h",
          percentSpent: 50
        }
      ]
    });

    buildDailySummaryPrContext.mockResolvedValue({
      githubLogin: "rigon",
      syncedAt: "2026-05-28T20:00:00.000Z",
      myOpenPrs: [
        {
          number: 42,
          title: "JOR-123 Feature X",
          url: "https://github.com/acme/repo/pull/42",
          repository: "acme/repo",
          statusGeral: "approved",
          readyToMerge: true,
          jiraIssueKey: "JOR-123",
          aprovou: ["alice"],
          solicitouAlteracoes: [],
          pendente: [],
          impediments: []
        }
      ],
      reviewsGivenToday: [],
      reviewsReceivedToday: [],
      pendingReviews: [],
      statusChangesToday: [],
      mergesToday: []
    });

    getActiveNoteByNotebookDay.mockResolvedValue({
      id: "note-1",
      notebookDay: "2026-05-28",
      body: "Foco em release",
      createdAt: "2026-05-28T08:00:00.000Z",
      updatedAt: "2026-05-28T08:00:00.000Z"
    });

    const { buildDailySummaryContext } = await import("@/modules/dashboard/lib/daily-summary-context");
    const context = await buildDailySummaryContext("2026-05-28");

    expect(getActiveNoteByNotebookDay).toHaveBeenCalledWith("2026-05-28");
    expect(context.noteBody).toBe("Foco em release");
    expect(context.jira?.sprintLabel).toBe("Sprint 42");
    expect(context.jira?.issues[0]?.key).toBe("PROJ-1");
    expect(context.prs?.myOpenPrs[0]?.number).toBe(42);
  });
});
