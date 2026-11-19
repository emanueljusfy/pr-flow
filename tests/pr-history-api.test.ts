import { beforeEach, describe, expect, it, vi } from "vitest";

const getPullRequestHistory = vi.fn();

vi.mock("@/modules/prs/lib/pr-history-service", () => ({
  getPullRequestHistory: (...args: unknown[]) => getPullRequestHistory(...args)
}));

import { GET } from "@/app/api/prs/history/route";

describe("GET /api/prs/history", () => {
  beforeEach(() => {
    getPullRequestHistory.mockReset();
  });

  it("returns 400 for invalid query params", async () => {
    const response = await GET(
      new Request("http://localhost/api/prs/history?repository=invalid&number=abc")
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.status).toBe("error");
    expect(getPullRequestHistory).not.toHaveBeenCalled();
  });

  it("returns history events on success", async () => {
    getPullRequestHistory.mockResolvedValue({
      status: "ok",
      fetchedAt: "2026-05-28T15:00:00Z",
      data: {
        events: [
          {
            id: "opened:1",
            type: "opened",
            occurredAt: "2026-05-28T10:00:00Z",
            actorLogin: "rigon",
            url: "https://github.com/acme/a/pull/7",
            detail: null,
            reviewState: null
          }
        ]
      }
    });

    const response = await GET(
      new Request("http://localhost/api/prs/history?repository=acme%2Fa&number=7")
    );
    expect(response.status).toBe(200);
    expect(getPullRequestHistory).toHaveBeenCalledWith({ repository: "acme/a", number: 7 });
    const body = await response.json();
    expect(body.status).toBe("ok");
    expect(body.data.events).toHaveLength(1);
  });

  it("returns 401 when GitHub is unauthenticated", async () => {
    getPullRequestHistory.mockResolvedValue({
      status: "unauthenticated",
      message: "GitHub CLI sem autenticacao."
    });

    const response = await GET(
      new Request("http://localhost/api/prs/history?repository=acme/a&number=7")
    );
    expect(response.status).toBe(401);
  });
});
