import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PrMonitorPage } from "@/modules/prs/components/pr-monitor-page";
import type { PrApiResponse } from "@/modules/prs/lib/domain";
import { clearPrMonitorLastSync, savePrMonitorLastSync } from "@/modules/prs/lib/pr-monitor-cache";
import { PR_VIEW_MODE_STORAGE_KEY } from "@/modules/prs/lib/pr-view-mode-storage";
import { renderWithProviders } from "@/tests/render-with-providers";

vi.mock("@/modules/prs/hooks/use-weather-forecast", () => ({
  useWeatherForecast: () => ({ status: "error", forecast: null })
}));

function mockFetchSequence(...responses: PrApiResponse[]) {
  const fetchMock = vi.fn();
  for (const response of responses) {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => response
    });
  }
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("PrMonitorPage", () => {
  afterEach(() => {
    clearPrMonitorLastSync();
    vi.unstubAllGlobals();
  });

  it("exibe ultima sincronizacao salva antes da resposta da rede", async () => {
    savePrMonitorLastSync({
      status: "ok",
      fetchedAt: "2026-05-28T11:00:00Z",
      githubLogin: "rigon",
      data: [
        {
          id: "PR_9",
          number: 9,
          title: "cache local",
          url: "https://github.com/acme/a/pull/9",
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
        }
      ]
    });

    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              ok: true,
              json: async () =>
                ({
                  status: "ok",
                  fetchedAt: "2026-05-28T12:00:00Z",
                  githubLogin: "rigon",
                  data: []
                }) satisfies PrApiResponse
            });
          }, 200);
        })
    );
    vi.stubGlobal("fetch", fetchMock);

    renderWithProviders(<PrMonitorPage />);
    await waitFor(() => expect(screen.getByText("cache local")).toBeInTheDocument());
    expect(screen.queryByText("Carregando monitor...")).not.toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  });

  it("exibe estado nao autenticado com instrucao e tenta novamente", async () => {
    const fetchMock = mockFetchSequence(
      { status: "unauthenticated", message: "gh auth login" },
      {
        status: "ok",
        fetchedAt: "2026-05-28T12:00:00Z",
        githubLogin: "rigon",
        data: [
          {
            id: "PR_1",
            number: 1,
            title: "feat",
            url: "https://github.com/acme/a/pull/1",
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
          }
        ]
      }
    );

    renderWithProviders(<PrMonitorPage />);
    await screen.findByText("GitHub CLI sem autenticacao");
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    await screen.findByText("PR #1");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("exibe banner e dados desatualizados quando a API retorna stale", async () => {
    mockFetchSequence({
      status: "stale",
      fetchedAt: "2026-05-28T11:00:00Z",
      githubLogin: "rigon",
      message: "GitHub fora do ar",
      data: [
        {
          id: "PR_9",
          number: 9,
          title: "dados antigos",
          url: "https://github.com/acme/a/pull/9",
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
        }
      ]
    });

    renderWithProviders(<PrMonitorPage />);
    await screen.findByRole("alert");
    expect(screen.getByText(/Não foi possível atualizar os dados/i)).toBeInTheDocument();
    expect(screen.getByText("dados antigos")).toBeInTheDocument();
    expect(screen.queryByText("Falha na atualizacao")).not.toBeInTheDocument();
  });

  it("carrega monitor via GET na montagem", async () => {
    const fetchMock = mockFetchSequence({
      status: "ok",
      fetchedAt: "2026-05-28T12:00:00Z",
      githubLogin: "rigon",
      data: []
    });

    renderWithProviders(<PrMonitorPage />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0]?.[1]).toEqual({ method: "GET", cache: "no-store" });
  });

  it("exibe modal de alerta quando detecta mudanca de estado apos sincronizacao", async () => {
    savePrMonitorLastSync({
      status: "ok",
      fetchedAt: "2026-05-28T12:00:00Z",
      githubLogin: "rigon",
      data: [
        {
          id: "PR_1",
          number: 1,
          title: "feat",
          url: "https://github.com/acme/a/pull/1",
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
        }
      ]
    });

    mockFetchSequence({
      status: "ok",
      fetchedAt: "2026-05-28T12:00:30Z",
      githubLogin: "rigon",
      data: [
        {
          id: "PR_1",
          number: 1,
          title: "feat",
          url: "https://github.com/acme/a/pull/1",
          repository: "acme/a",
          createdAt: "2026-05-28T10:00:00Z",
          avaliou: ["ana"],
          naoAvaliou: [],
          semReviewersSolicitados: false,
          aprovou: ["ana"],
          solicitouAlteracoes: [],
          pendente: [],
          requestedReviewersCount: 1,
          statusGeral: "approved"
        }
      ]
    });

    renderWithProviders(<PrMonitorPage />);

    await screen.findByRole("dialog", { name: "Mudancas detectadas na sincronizacao" });
    expect(screen.getByText("PR #1: Revisão pendente -> Aprovada")).toBeInTheDocument();
  });

  it("filtra PRs carregadas pela busca com debounce", async () => {
    mockFetchSequence({
      status: "ok",
      fetchedAt: "2026-05-28T12:00:00Z",
      githubLogin: "rigon",
      data: [
        {
          id: "PR_1",
          number: 1,
          title: "feat pagamentos",
          url: "https://github.com/acme/a/pull/1",
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
        },
        {
          id: "PR_2",
          number: 2,
          title: "fix checkout",
          url: "https://github.com/acme/a/pull/2",
          repository: "acme/a",
          createdAt: "2026-05-28T10:00:00Z",
          avaliou: [],
          naoAvaliou: ["bob"],
          semReviewersSolicitados: false,
          aprovou: [],
          solicitouAlteracoes: [],
          pendente: ["bob"],
          requestedReviewersCount: 1,
          statusGeral: "pending_review"
        }
      ]
    });

    renderWithProviders(<PrMonitorPage />);
    await screen.findByText("feat pagamentos");
    expect(screen.getByText("fix checkout")).toBeInTheDocument();
    expect(screen.queryByText(/PR\(s\)/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Buscar PRs" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Filtrar PRs carregadas" }), {
      target: { value: "checkout" }
    });

    await waitFor(
      () => {
        expect(screen.getByText("fix checkout")).toBeInTheDocument();
        expect(screen.queryByText("feat pagamentos")).not.toBeInTheDocument();
      },
      { timeout: 1000 }
    );
  });

  it("alterna para a visao compacta e lembra a escolha", async () => {
    window.localStorage.removeItem(PR_VIEW_MODE_STORAGE_KEY);
    mockFetchSequence({
      status: "ok",
      fetchedAt: "2026-05-28T12:00:00Z",
      githubLogin: "rigon",
      data: [
        {
          id: "PR_1",
          number: 1,
          title: "feat pagamentos",
          url: "https://github.com/acme/a/pull/1",
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
        }
      ]
    });

    const { container } = renderWithProviders(<PrMonitorPage />);
    await screen.findByText("feat pagamentos");
    expect(container.querySelector(".cards-grid")).toBeInTheDocument();

    const compactButton = screen.getByRole("button", { name: "Exibir PRs em lista compacta" });
    fireEvent.click(compactButton);

    expect(compactButton).toHaveAttribute("aria-pressed", "true");
    expect(container.querySelector(".pr-compact-list")).toBeInTheDocument();
    expect(container.querySelector(".pr-card--compact")).toBeInTheDocument();
    expect(window.localStorage.getItem(PR_VIEW_MODE_STORAGE_KEY)).toBe("compact");
    window.localStorage.removeItem(PR_VIEW_MODE_STORAGE_KEY);
  });

  it("agrupa PRs empilhadas sobre a branch de outra PR", async () => {
    const base = {
      url: "https://github.com/acme/a/pull/1",
      repository: "acme/a",
      createdAt: "2026-05-28T10:00:00Z",
      avaliou: [],
      naoAvaliou: [],
      semReviewersSolicitados: true,
      aprovou: [],
      solicitouAlteracoes: [],
      pendente: [],
      requestedReviewersCount: 0,
      statusGeral: "no_reviewers" as const
    };
    mockFetchSequence({
      status: "ok",
      fetchedAt: "2026-05-28T12:00:00Z",
      githubLogin: "rigon",
      data: [
        { ...base, id: "PR_2", number: 2, title: "parte 2 checkout", headRefName: "feat-b", baseRefName: "feat-a" },
        { ...base, id: "PR_3", number: 3, title: "fix isolado", headRefName: "fix", baseRefName: "main" },
        { ...base, id: "PR_1", number: 1, title: "parte 1 checkout", headRefName: "feat-a", baseRefName: "main" }
      ]
    });

    renderWithProviders(<PrMonitorPage />);
    const stack = await screen.findByRole("region", { name: "Stack de 2 PRs (merge em main)" });

    expect(within(stack).getByText("parte 1 checkout")).toBeInTheDocument();
    expect(within(stack).getByText("parte 2 checkout")).toBeInTheDocument();
    expect(within(stack).getByText("Base da stack")).toBeInTheDocument();
    expect(within(stack).getByText("empilha em #1")).toBeInTheDocument();
    expect(within(stack).queryByText("fix isolado")).not.toBeInTheDocument();
    expect(screen.getByText("fix isolado")).toBeInTheDocument();
  });
});
