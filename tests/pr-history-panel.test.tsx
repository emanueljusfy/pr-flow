import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PrHistoryPanel } from "@/modules/prs/components/pr-history-panel";
import { PrMonitorPage } from "@/modules/prs/components/pr-monitor-page";
import type { MonitoredPr, PrApiResponse } from "@/modules/prs/lib/domain";
import { clearPrMonitorLastSync, savePrMonitorLastSync } from "@/modules/prs/lib/pr-monitor-cache";
import { renderWithProviders } from "@/tests/render-with-providers";

const samplePr: MonitoredPr = {
  id: "PR_1",
  number: 7,
  title: "fix: simplify retries",
  url: "https://github.com/acme/a/pull/7",
  repository: "acme/a",
  createdAt: "2026-05-28T10:00:00Z",
  avaliou: [],
  naoAvaliou: ["ana"],
  semReviewersSolicitados: false,
  aprovou: [],
  solicitouAlteracoes: [],
  pendente: ["ana"],
  requestedReviewersCount: 1,
  statusGeral: "pending_review"
};

describe("PrHistoryPanel", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows empty selection copy when no PR is selected", () => {
    renderWithProviders(<PrHistoryPanel onClose={() => undefined} pr={null} />);
    expect(screen.getByText("Selecione uma PR para ver o histórico.")).toBeInTheDocument();
  });

  it("loads and renders timeline events with links and tone markers", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
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
            },
            {
              id: "IC_1",
              type: "commented",
              occurredAt: "2026-05-28T11:00:00Z",
              actorLogin: "coelho",
              url: "https://github.com/acme/a/pull/7#issuecomment-1",
              detail: "parece bom",
              reviewState: null
            },
            {
              id: "PRR_1",
              type: "review_submitted",
              occurredAt: "2026-05-28T13:00:00Z",
              actorLogin: "ana",
              url: "https://github.com/acme/a/pull/7#pullrequestreview-1",
              detail: null,
              reviewState: "APPROVED"
            },
            {
              id: "PRR_2",
              type: "review_submitted",
              occurredAt: "2026-05-28T12:30:00Z",
              actorLogin: "bruno",
              url: null,
              detail: null,
              reviewState: "CHANGES_REQUESTED"
            }
          ]
        }
      })
    });
    vi.stubGlobal("fetch", fetchMock);

    const { container } = renderWithProviders(<PrHistoryPanel onClose={() => undefined} pr={samplePr} />);

    await waitFor(() => expect(screen.getByText("coelho comentou")).toBeInTheDocument());
    expect(screen.getByText("rigon abriu a PR")).toBeInTheDocument();
    expect(screen.getByText("parece bom")).toBeInTheDocument();
    expect(screen.getByText("ana aprovou")).toBeInTheDocument();
    expect(screen.getByText("bruno pediu alterações")).toBeInTheDocument();

    expect(container.querySelectorAll('[data-testid="pr-history-marker-muted"]').length).toBeGreaterThanOrEqual(2);
    expect(container.querySelector('[data-testid="pr-history-marker-approved"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="pr-history-marker-changes"]')).not.toBeNull();
    expect(container.querySelector(".pr-history-timeline__marker--tone-approved")).not.toBeNull();
    expect(container.querySelector(".pr-history-timeline__marker--tone-changes")).not.toBeNull();

    const eventLinks = screen.getAllByLabelText("Abrir evento no GitHub");
    expect(eventLinks.some((link) => link.getAttribute("href")?.includes("issuecomment-1"))).toBe(
      true
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/prs/history?repository=acme%2Fa&number=7",
      expect.objectContaining({ method: "GET" })
    );
    expect(screen.queryByText("Ver mais")).not.toBeInTheDocument();
  });

  it("expands and collapses long event details", async () => {
    const longDetail =
      "Revisado. As três chamadas (release e deploy no Sentry, annotation no Grafana) só rodam depois do rsync bem-sucedido, nunca derrubam o deploy se o sync falhar no meio.";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "ok",
        fetchedAt: "2026-05-28T15:00:00Z",
        data: {
          events: [
            {
              id: "PRR_long",
              type: "review_submitted",
              occurredAt: "2026-05-28T13:00:00Z",
              actorLogin: "davi-graciano-costa",
              url: "https://github.com/acme/a/pull/7#pullrequestreview-9",
              detail: longDetail,
              reviewState: "APPROVED"
            }
          ]
        }
      })
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithProviders(<PrHistoryPanel onClose={() => undefined} pr={samplePr} />);

    await waitFor(() => expect(screen.getByText("davi-graciano-costa aprovou")).toBeInTheDocument());
    expect(screen.getByText("Ver mais")).toBeInTheDocument();
    expect(screen.queryByText("Ver menos")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Ver mais"));
    expect(screen.getByText("Ver menos")).toBeInTheDocument();
    expect(screen.getByText(longDetail)).toBeInTheDocument();

    fireEvent.click(screen.getByText("Ver menos"));
    expect(screen.getByText("Ver mais")).toBeInTheDocument();
    expect(screen.queryByText("Ver menos")).not.toBeInTheDocument();
  });

  it("keeps events visible while a manual refresh is in flight", async () => {
    let resolveRefresh: ((value: unknown) => void) | null = null;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
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
        })
      })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveRefresh = resolve;
          })
      );
    vi.stubGlobal("fetch", fetchMock);

    const { rerender } = renderWithProviders(<PrHistoryPanel onClose={() => undefined} pr={samplePr} />);
    await waitFor(() => expect(screen.getByText("rigon abriu a PR")).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText("Atualizar histórico da PR"));
    expect(screen.getByText("rigon abriu a PR")).toBeInTheDocument();
    expect(screen.getByLabelText("Atualizando histórico da PR")).toBeInTheDocument();

    // Same PR identity with a new object must not auto-refetch.
    rerender(
      <PrHistoryPanel
        onClose={() => undefined}
        pr={{ ...samplePr, title: "fix: simplify retries (updated title)" }}
      />
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Assigned inside the fetch mock closure; TS narrows the `let` to never without the cast.
    (resolveRefresh as ((value: unknown) => void) | null)?.({
      ok: true,
      json: async () => ({
        status: "ok",
        fetchedAt: "2026-05-28T16:00:00Z",
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
            },
            {
              id: "IC_1",
              type: "commented",
              occurredAt: "2026-05-28T11:00:00Z",
              actorLogin: "coelho",
              url: null,
              detail: "novo",
              reviewState: null
            }
          ]
        }
      })
    });

    await waitFor(() => expect(screen.getByText("coelho comentou")).toBeInTheDocument());
    expect(screen.getByText("rigon abriu a PR")).toBeInTheDocument();
  });
});

describe("PrMonitorPage history selection", () => {
  afterEach(() => {
    clearPrMonitorLastSync();
    vi.unstubAllGlobals();
  });

  it("selects a PR card and shows history panel header", async () => {
    savePrMonitorLastSync({
      status: "ok",
      fetchedAt: "2026-05-28T11:00:00Z",
      githubLogin: "rigon",
      data: [samplePr]
    } satisfies PrApiResponse);

    const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/prs/history")) {
        return {
          ok: true,
          json: async () => ({
            status: "ok",
            fetchedAt: "2026-05-28T15:00:00Z",
            data: { events: [] }
          })
        };
      }
      return {
        ok: true,
        json: async () =>
          ({
            status: "ok",
            fetchedAt: "2026-05-28T12:00:00Z",
            githubLogin: "rigon",
            data: [samplePr]
          }) satisfies PrApiResponse
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const { container } = renderWithProviders(<PrMonitorPage />);
    await waitFor(() => expect(screen.getByText("fix: simplify retries")).toBeInTheDocument());

    expect(screen.getByText("Selecione uma PR para ver o histórico.")).toBeInTheDocument();

    const card = container.querySelector(".pr-card");
    expect(card).not.toBeNull();
    fireEvent.click(card!);

    await waitFor(() => expect(card).toHaveClass("pr-card--selected"));
    expect(screen.getByText("#7 · fix: simplify retries")).toBeInTheDocument();
  });
});
