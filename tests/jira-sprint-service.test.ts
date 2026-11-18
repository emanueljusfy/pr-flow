import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchJiraSprints } from "@/modules/jira/lib/jira-sprint-service";

describe("fetchJiraSprints", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("loads sprints from the scrum board of the configured project", async () => {
    vi.stubEnv("JIRA_EMAIL", "dev@example.com");
    vi.stubEnv("JIRA_TOKEN", "secret-token");
    vi.stubEnv("JIRA_SPRINT_BOARD_ID", "1032");

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 1032, name: "Downstream scrum", type: "scrum" })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          values: [
            {
              id: 4943,
              name: "Sprint 6",
              state: "active",
              startDate: "2026-05-13T13:41:41.000Z",
              endDate: "2026-05-29T03:00:00.000Z"
            },
            {
              id: 5111,
              name: "Sprint 7",
              state: "future"
            }
          ]
        })
      });

    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchJiraSprints();

    expect(result.boardId).toBe(1032);
    expect(result.boardName).toBe("Downstream scrum");
    expect(result.sprints.map((s) => s.name)).toEqual(["Sprint 6", "Sprint 7"]);
    expect(fetchMock.mock.calls[1]?.[0]).toContain("/board/1032/sprint");
  });

  it("returns empty sprints for kanban boards without calling the sprint API", async () => {
    vi.stubEnv("JIRA_EMAIL", "dev@example.com");
    vi.stubEnv("JIRA_TOKEN", "secret-token");
    vi.stubEnv("JIRA_SPRINT_PROJECT_KEY", "FT");
    vi.stubEnv("JIRA_SPRINT_BOARD_ID", "1724");

    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 1724, name: "Justracker kb", type: "kanban" })
    });

    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchJiraSprints();

    expect(result).toMatchObject({
      boardId: 1724,
      boardName: "Justracker kb",
      projectKey: "FT",
      sprints: []
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain("/sprint");
  });

  it("falls back to empty sprints when the board rejects the sprint endpoint", async () => {
    vi.stubEnv("JIRA_EMAIL", "dev@example.com");
    vi.stubEnv("JIRA_TOKEN", "secret-token");
    vi.stubEnv("JIRA_SPRINT_BOARD_ID", "999");

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 999, name: "Odd board", type: "simple" })
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ errorMessages: ["O quadro não aceita sprints"] })
      });

    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchJiraSprints();

    expect(result.boardId).toBe(999);
    expect(result.sprints).toEqual([]);
  });
});
