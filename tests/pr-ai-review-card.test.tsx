import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { PrReviewerQueueItem } from "@/modules/prs/components/pr-reviewer-queue-item";
import type { PrAiReviewRunDto } from "@/modules/pr-ai-review/lib/domain";
import { aiRun, PR_URL, queuePr, stubFetch } from "./pr-ai-review-fixtures";

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() })
}));

function renderCard(
  runs: PrAiReviewRunDto[],
  headSha = "head-1",
  onAiRunStarted = vi.fn(),
  aiBusy = false,
  variant: "card" | "compact" = "card"
) {
  return render(
    <ul>
      <PrReviewerQueueItem
        pr={{ ...queuePr, headSha }}
        aiRuns={runs}
        aiBusy={aiBusy}
        onAiRunStarted={onAiRunStarted}
        variant={variant}
      />
    </ul>
  );
}

async function openMenu() {
  fireEvent.contextMenu(document.querySelector(".review-queue-card")!);
  return screen.findByRole("menuitem", { name: "Revisar justracker-thanos#699 com IA" });
}

beforeEach(() => {
  vi.mocked(toast).mockClear();
  vi.mocked(toast.error).mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PrReviewerQueueItem AI actions", () => {
  it("card has no inline actions; review and github live in the context menu", async () => {
    renderCard([]);
    expect(screen.queryByText("Abrir no GitHub")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Revisar .* com IA/ })).not.toBeInTheDocument();

    const reviewItem = await openMenu();
    expect(reviewItem).not.toHaveAttribute("aria-disabled", "true");

    const open = vi.fn();
    vi.stubGlobal("open", open);
    fireEvent.click(screen.getByRole("menuitem", { name: "Abrir no GitHub" }));
    expect(open).toHaveBeenCalledWith(PR_URL, "_blank", "noopener,noreferrer");
  });

  it("running badge disables review action", async () => {
    renderCard([
      aiRun({ id: "old", verdict: "APPROVE" }),
      aiRun({ id: "now", status: "running", verdict: null, startedAt: "2026-11-23T11:00:00.000Z" })
    ]);
    expect(screen.getByTestId("ai-review-badge")).toHaveTextContent("IA revisando…");
    expect(await openMenu()).toHaveAttribute("aria-disabled", "true");
  });

  it("verdict badges are buttons", () => {
    const cases = [
      ["APPROVE", "IA: Aprovado"],
      ["COMMENT", "IA: Comentou"],
      ["REQUEST_CHANGES", "IA: Pediu mudanças"]
    ] as const;
    for (const [verdict, label] of cases) {
      const { unmount } = renderCard([
        aiRun({ id: "old", verdict: "APPROVE", startedAt: "2026-11-22T10:00:00.000Z" }),
        aiRun({ id: "new", verdict })
      ]);
      const badge = screen.getByTestId("ai-review-badge");
      expect(badge).toHaveTextContent(label);
      expect(badge.tagName).toBe("BUTTON");
      unmount();
    }
  });

  it("failed and absent badges", () => {
    const { unmount } = renderCard([
      aiRun({ id: "old", verdict: "APPROVE", startedAt: "2026-11-22T10:00:00.000Z" }),
      aiRun({ id: "new", status: "failed", verdict: null, reason: "timeout" })
    ]);
    expect(screen.getByTestId("ai-review-badge")).toHaveTextContent("IA: Falhou");
    unmount();

    // Runs of another PR do not count.
    renderCard([aiRun({ prUrl: "https://github.com/jusfy/justracker-thanos/pull/700" })]);
    expect(screen.queryByTestId("ai-review-badge")).not.toBeInTheDocument();
  });

  it("stale verdict badge", () => {
    renderCard([aiRun({ verdict: "APPROVE", headSha: "head-1" })], "head-2");
    expect(screen.getByTestId("ai-review-badge")).toHaveTextContent("IA: desatualizada");
  });

  it("review with ai posts pr url", async () => {
    const stub = stubFetch({ "POST /api/prs/ai-review/run": { status: 202, body: { prUrls: [PR_URL] } } });
    vi.stubGlobal("fetch", vi.fn(stub.fetchMock));
    const onRunStarted = vi.fn();
    renderCard([], "head-1", onRunStarted);
    fireEvent.click(await openMenu());
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith("IA revisando justracker-thanos#699", { description: "Revisão em andamento." })
    );
    expect(stub.calls[0]).toEqual({ url: "/api/prs/ai-review/run", method: "POST", body: { prUrl: PR_URL } });
    expect(onRunStarted).toHaveBeenCalledTimes(1);
  });

  it("shows conflict from review with ai", async () => {
    const stub = stubFetch({
      "POST /api/prs/ai-review/run": { status: 409, body: { error: "Já existe uma revisão da IA em andamento." } }
    });
    vi.stubGlobal("fetch", vi.fn(stub.fetchMock));
    const onRunStarted = vi.fn();
    renderCard([], "head-1", onRunStarted);
    fireEvent.click(await openMenu());
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Já existe uma revisão da IA em andamento."));
    expect(onRunStarted).not.toHaveBeenCalled();
  });

  it("disables action while another pr is being reviewed", async () => {
    renderCard([], "head-1", vi.fn(), true);
    expect(await openMenu()).toHaveAttribute("aria-disabled", "true");
  });

  it("compact variant renders one row with badge and context menu", async () => {
    renderCard([aiRun({ verdict: "APPROVE" })], "head-1", vi.fn(), false, "compact");
    expect(document.querySelector(".review-queue-card--compact .review-queue-row")).not.toBeNull();
    expect(screen.getByRole("link", { name: "Abrir PR #699: fix: S3" })).toHaveAttribute("href", PR_URL);
    expect(screen.getByTestId("ai-review-badge")).toHaveTextContent("IA: Aprovado");
    expect(await openMenu()).toBeInTheDocument();
  });
});
