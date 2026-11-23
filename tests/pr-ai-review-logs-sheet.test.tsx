import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AiReviewCardActions } from "@/modules/pr-ai-review/components/ai-review-card-actions";
import { AiReviewLogsSheet } from "@/modules/pr-ai-review/components/ai-review-logs-sheet";
import { aiRun, PR_URL, stubFetch } from "./pr-ai-review-fixtures";

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() })
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("AiReviewLogsSheet", () => {
  it("lists pr runs with markdown stdout", async () => {
    const runs = [
      aiRun({
        id: "new",
        verdict: "COMMENT",
        startedAt: "2026-11-23T11:00:00.000Z",
        stdout: "## Achados\n\n- **F1** [link](javascript:alert(1))",
        stderr: "warn: x",
        costUsd: 0.5
      }),
      aiRun({ id: "old", status: "failed", verdict: null, reason: "timeout", costUsd: null, stdout: "", stderr: "" })
    ];
    const stub = stubFetch({ "GET /api/prs/ai-review/runs": { body: runs } });
    vi.stubGlobal("fetch", vi.fn(stub.fetchMock));

    // Opened from the card's logs icon.
    render(
      <AiReviewCardActions prUrl={PR_URL} label="justracker-thanos#699" headSha="head-1" runs={[]} busy={false} onRunStarted={vi.fn()} />
    );
    fireEvent.click(screen.getByRole("button", { name: "Ver revisões da IA de justracker-thanos#699" }));

    const options = await screen.findAllByRole("option");
    expect(stub.calls[0].url).toBe(`/api/prs/ai-review/runs?prUrl=${encodeURIComponent(PR_URL)}&limit=20`);
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveTextContent(/Concluída · Comentou · 23\/11\/2026.* · US\$\s?0,50/);
    expect(options[1]).toHaveTextContent(/Falhou · .* · Custo não informado/);
    expect(options[0]).toHaveAttribute("aria-selected", "true");

    const preview = screen.getByTestId("ai-review-stdout-preview");
    expect(preview.querySelector("h2")).toHaveTextContent("Achados");
    expect(preview.querySelector("strong")).toHaveTextContent("F1");
    expect(preview.querySelector("a")?.getAttribute("href") ?? "").not.toMatch(/javascript:/);
    expect(screen.getByTestId("ai-review-stderr")).toHaveTextContent("warn: x");
    expect(screen.getByTestId("ai-review-stderr").tagName).toBe("PRE");
    expect(screen.getByRole("link", { name: /Abrir review no GitHub/ })).toHaveAttribute(
      "href",
      "https://github.com/jusfy/justracker-thanos/pull/699#pullrequestreview-1"
    );

    fireEvent.click(options[1]);
    expect(screen.getByTestId("ai-review-stdout-empty")).toHaveTextContent("Sem saída padrão.");
    expect(screen.getByTestId("ai-review-stderr")).toHaveTextContent("Sem saída de erro.");
  });

  it("polls while running", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let current = [aiRun({ status: "running", verdict: null, stdout: null })];
    const stub = stubFetch({ "GET /api/prs/ai-review/runs": () => ({ body: current }) });
    vi.stubGlobal("fetch", vi.fn(stub.fetchMock));
    render(<AiReviewLogsSheet prUrl={PR_URL} label="justracker-thanos#699" open onOpenChange={vi.fn()} />);
    await screen.findByRole("option");
    expect(screen.getByRole("option")).toHaveTextContent("Em execução");
    const before = stub.calls.length;

    current = [aiRun({ status: "succeeded", verdict: "APPROVE", stdout: "pronto" })];
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    await waitFor(() => expect(screen.getByRole("option")).toHaveTextContent("Concluída · Aprovado"));
    expect(stub.calls.length).toBeGreaterThan(before);

    // No longer running: polling stops.
    const settled = stub.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(9_000);
    });
    expect(stub.calls.length).toBe(settled);
  });

  it("empty state", async () => {
    const stub = stubFetch({ "GET /api/prs/ai-review/runs": { body: [] } });
    vi.stubGlobal("fetch", vi.fn(stub.fetchMock));
    render(<AiReviewLogsSheet prUrl={PR_URL} label="justracker-thanos#699" open onOpenChange={vi.fn()} />);
    expect(await screen.findByText("Nenhuma revisão da IA para esta PR.")).toBeInTheDocument();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});
