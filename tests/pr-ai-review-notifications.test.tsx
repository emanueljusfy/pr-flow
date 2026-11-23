import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { notifyAiReviewStarted, useAiReviewNotifications } from "@/modules/pr-ai-review/hooks/use-ai-review-notifications";
import { resetAiReviewStartNotificationsForTests } from "@/modules/pr-ai-review/lib/ai-review-ui";
import { aiRun, stubFetch } from "./pr-ai-review-fixtures";

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() })
}));
vi.mock("@/modules/notifications/lib/play-notification-sound", () => ({ playNotificationSound: vi.fn() }));
vi.mock("@/modules/notifications/lib/notification-inbox", () => ({ pushNotificationInboxItem: vi.fn() }));

beforeEach(() => {
  resetAiReviewStartNotificationsForTests();
  vi.mocked(toast).mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("useAiReviewNotifications", () => {
  it("start toast once per run", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let running = [aiRun({ id: "seeded", status: "running", verdict: null })];
    const stub = stubFetch({
      "GET /api/prs/ai-review/runs?unread": { body: [] },
      "GET /api/prs/ai-review/runs?status=running": () => ({ body: running })
    });
    vi.stubGlobal("fetch", vi.fn(stub.fetchMock));
    renderHook(() => useAiReviewNotifications());
    await waitFor(() => expect(stub.calls.length).toBeGreaterThanOrEqual(2));
    // Already running at mount: seeded, no toast.
    expect(toast).not.toHaveBeenCalled();

    running = [...running, aiRun({ id: "new", status: "running", verdict: null, prNumber: 700 })];
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(vi.mocked(toast).mock.calls.filter(([title]) => title === "IA revisando justracker-thanos#700")).toHaveLength(1);

    // A click toast for the same run id does not repeat it.
    notifyAiReviewStarted({ id: "new", repository: "jusfy/justracker-thanos", prNumber: 700 });
    expect(vi.mocked(toast).mock.calls.filter(([title]) => title === "IA revisando justracker-thanos#700")).toHaveLength(1);
  });

  it("end toast and ack", async () => {
    const stub = stubFetch({
      "GET /api/prs/ai-review/runs?unread": {
        body: [
          aiRun({ id: "ok", verdict: "APPROVE" }),
          aiRun({ id: "none", verdict: null, prNumber: 701, reviewUrl: null }),
          aiRun({ id: "bad", status: "failed", verdict: null, reason: "timeout", prNumber: 702 })
        ]
      },
      "GET /api/prs/ai-review/runs?status=running": { body: [] },
      "POST /api/prs/ai-review/runs/ack": { body: { ok: true } }
    });
    vi.stubGlobal("fetch", vi.fn(stub.fetchMock));
    renderHook(() => useAiReviewNotifications());
    await waitFor(() => expect(stub.calls.some((call) => call.method === "POST")).toBe(true));
    const titles = vi.mocked(toast).mock.calls.map(([title]) => title);
    expect(titles).toEqual([
      "IA terminou justracker-thanos#699: Aprovado",
      "IA terminou justracker-thanos#701: sem review postada",
      "IA falhou em justracker-thanos#702"
    ]);
    expect(stub.calls.find((call) => call.method === "POST")?.body).toEqual({ runIds: ["ok", "none", "bad"] });
  });
});
