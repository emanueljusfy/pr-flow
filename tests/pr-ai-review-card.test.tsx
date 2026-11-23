import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { AiReviewCardActions } from "@/modules/pr-ai-review/components/ai-review-card-actions";
import type { PrAiReviewRunDto } from "@/modules/pr-ai-review/lib/domain";
import { aiRun, PR_URL, stubFetch } from "./pr-ai-review-fixtures";

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() })
}));

function renderCard(runs: PrAiReviewRunDto[], headSha = "head-1", onRunStarted = vi.fn(), busy = false) {
  return render(
    <AiReviewCardActions
      prUrl={PR_URL}
      label="justracker-thanos#699"
      headSha={headSha}
      runs={runs}
      busy={busy}
      onRunStarted={onRunStarted}
    />
  );
}

const reviewButton = () => screen.getByRole("button", { name: "Revisar justracker-thanos#699 com IA" });

beforeEach(() => {
  vi.mocked(toast).mockClear();
  vi.mocked(toast.error).mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AiReviewCardActions", () => {
  it("running badge disables action", () => {
    renderCard([aiRun({ id: "old", verdict: "APPROVE" }), aiRun({ id: "now", status: "running", verdict: null, startedAt: "2026-11-23T11:00:00.000Z" })]);
    expect(screen.getByTestId("ai-review-badge")).toHaveTextContent("IA revisando…");
    expect(reviewButton()).toBeDisabled();
  });

  it("verdict badges", () => {
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
      expect(screen.getByTestId("ai-review-badge")).toHaveTextContent(label);
      expect(reviewButton()).toBeEnabled();
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
    fireEvent.click(reviewButton());
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
    fireEvent.click(reviewButton());
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Já existe uma revisão da IA em andamento."));
    expect(onRunStarted).not.toHaveBeenCalled();
  });

  it("disables action while another pr is being reviewed", () => {
    renderCard([], "head-1", vi.fn(), true);
    expect(reviewButton()).toBeDisabled();
  });
});
