import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AiReviewLogsSheet } from "@/modules/pr-ai-review/components/ai-review-logs-sheet";
import { aiReviewRunBadgeKind, formatAiReviewDuration } from "@/modules/pr-ai-review/lib/ai-review-ui";
import { PrReviewerQueueItem } from "@/modules/prs/components/pr-reviewer-queue-item";
import { aiRun, PR_URL, queuePr, stubFetch } from "./pr-ai-review-fixtures";

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
        finishedAt: "2026-11-23T11:05:00.000Z",
        stdout: "## Achados\n\n- **F1** [link](javascript:alert(1))",
        stderr: "warn: x",
        costUsd: 0.5
      }),
      aiRun({ id: "old", status: "failed", verdict: null, reason: "timeout", costUsd: null, stdout: "", stderr: "" })
    ];
    const stub = stubFetch({ "GET /api/prs/ai-review/runs": { body: runs } });
    vi.stubGlobal("fetch", vi.fn(stub.fetchMock));

    // Opened from the card's AI badge.
    render(
      <ul>
        <PrReviewerQueueItem pr={queuePr} aiRuns={[aiRun({ verdict: "COMMENT" })]} />
      </ul>
    );
    fireEvent.click(
      screen.getByRole("button", { name: "IA: Comentou — ver revisões da IA de justracker-thanos#699" })
    );

    const options = await screen.findAllByRole("option");
    expect(stub.calls[0].url).toBe(`/api/prs/ai-review/runs?prUrl=${encodeURIComponent(PR_URL)}&limit=20`);
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveAccessibleName(/Concluída · Comentou · 23\/11\/2026.* · US\$\s?0,50/);
    expect(options[1]).toHaveAccessibleName(/Falhou · .* · Custo não informado/);
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    expect(options[0]).toHaveTextContent(/Comentou.*5 min.*US\$\s?0,50/);
    expect(screen.getByText("2 execuções")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "head-1" })).toHaveAttribute(
      "href",
      "https://github.com/jusfy/justracker-thanos/commit/head-1"
    );
    expect(screen.getByText("Automática")).toBeInTheDocument();
    expect(screen.getByText("Reação adicionada no canal")).toBeInTheDocument();

    const preview = screen.getByTestId("ai-review-stdout-preview");
    expect(preview.querySelector("h2")).toHaveTextContent("Achados");
    expect(preview.querySelector("strong")).toHaveTextContent("F1");
    expect(preview.querySelector("a")?.getAttribute("href") ?? "").not.toMatch(/javascript:/);
    expect(screen.getByRole("link", { name: /Abrir review no GitHub/ })).toHaveAttribute(
      "href",
      "https://github.com/jusfy/justracker-thanos/pull/699#pullrequestreview-1"
    );

    // stderr lives in its own tab, flagged when it has content.
    const stderrTab = screen.getByRole("tab", { name: /Saída de erro.*tem saída/ });
    fireEvent.click(stderrTab);
    expect(await screen.findByTestId("ai-review-stderr")).toHaveTextContent("warn: x");
    expect(screen.getByTestId("ai-review-stderr").tagName).toBe("PRE");

    fireEvent.click(options[1]);
    expect(screen.getByText("timeout")).toBeInTheDocument();
    expect(screen.getByTestId("ai-review-stdout-empty")).toHaveTextContent("Sem saída padrão.");
    fireEvent.click(screen.getByRole("tab", { name: "Saída de erro" }));
    expect(await screen.findByTestId("ai-review-stderr")).toHaveTextContent("Sem saída de erro.");
  });

  it("opens on the stderr tab when only stderr has output", async () => {
    const stub = stubFetch({
      "GET /api/prs/ai-review/runs": { body: [aiRun({ status: "failed", verdict: null, stdout: "", stderr: "boom" })] }
    });
    vi.stubGlobal("fetch", vi.fn(stub.fetchMock));
    render(<AiReviewLogsSheet prUrl={PR_URL} label="justracker-thanos#699" open onOpenChange={vi.fn()} />);
    expect(await screen.findByTestId("ai-review-stderr")).toHaveTextContent("boom");
    expect(screen.queryByTestId("ai-review-stdout-empty")).not.toBeInTheDocument();
  });

  it("polls while running", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let current = [aiRun({ status: "running", verdict: null, stdout: null })];
    const stub = stubFetch({ "GET /api/prs/ai-review/runs": () => ({ body: current }) });
    vi.stubGlobal("fetch", vi.fn(stub.fetchMock));
    render(<AiReviewLogsSheet prUrl={PR_URL} label="justracker-thanos#699" open onOpenChange={vi.fn()} />);
    await screen.findByRole("option");
    expect(screen.getByRole("option")).toHaveAccessibleName(/^Em execução/);
    expect(screen.getByRole("option")).toHaveTextContent("em andamento");
    const before = stub.calls.length;

    current = [aiRun({ status: "succeeded", verdict: "APPROVE", stdout: "pronto" })];
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    await waitFor(() => expect(screen.getByRole("option")).toHaveAccessibleName(/^Concluída · Aprovado/));
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

describe("logs sheet helpers", () => {
  it("formats run duration", () => {
    const start = "2026-11-23T10:00:00.000Z";
    expect(formatAiReviewDuration(start, null)).toBeNull();
    expect(formatAiReviewDuration(start, "2026-11-23T10:00:38.000Z")).toBe("38 s");
    expect(formatAiReviewDuration(start, "2026-11-23T10:04:12.000Z")).toBe("4 min 12 s");
    expect(formatAiReviewDuration(start, "2026-11-23T10:05:00.000Z")).toBe("5 min");
    expect(formatAiReviewDuration(start, "2026-11-23T11:03:00.000Z")).toBe("1 h 3 min");
  });

  it("maps a run to its badge kind", () => {
    expect(aiReviewRunBadgeKind({ status: "running", verdict: null })).toBe("running");
    expect(aiReviewRunBadgeKind({ status: "failed", verdict: "APPROVE" })).toBe("failed");
    expect(aiReviewRunBadgeKind({ status: "succeeded", verdict: "APPROVE" })).toBe("approve");
    expect(aiReviewRunBadgeKind({ status: "succeeded", verdict: "COMMENT" })).toBe("comment");
    expect(aiReviewRunBadgeKind({ status: "succeeded", verdict: "REQUEST_CHANGES" })).toBe("request_changes");
    expect(aiReviewRunBadgeKind({ status: "succeeded", verdict: null })).toBe("none");
  });
});
