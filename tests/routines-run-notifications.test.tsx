import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { useRoutineRunNotifications } from "@/modules/routines/hooks/use-routine-run-notifications";
import { ptBR } from "@/modules/messages/pt-BR";
import { resetRoutineRunStartNotificationsForTests } from "@/modules/routines/lib/routine-run-ui";
import type { RoutineRunDto } from "@/modules/routines/lib/domain";

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn()
  })
}));

vi.mock("@/modules/notifications/lib/play-notification-sound", () => ({
  playNotificationSound: vi.fn()
}));

vi.mock("@/modules/notifications/lib/notification-inbox", () => ({
  pushNotificationInboxItem: vi.fn()
}));

const copy = ptBR.routines;

function runDto(overrides: Partial<RoutineRunDto>): RoutineRunDto {
  return {
    id: "run-1",
    routineId: "routine-1",
    routineName: "Nightly",
    status: "running",
    reason: null,
    stdout: null,
    stderr: null,
    costUsd: null,
    slackSkipped: null,
    startedAt: "2026-11-19T14:00:00.000Z",
    finishedAt: null,
    ackedAt: null,
    ...overrides
  };
}

describe("useRoutineRunNotifications", () => {
  beforeEach(() => {
    resetRoutineRunStartNotificationsForTests();
    vi.mocked(toast).mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("toasts start once per runId", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let recent: RoutineRunDto[] = [];
    const unread: RoutineRunDto[] = [];
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("unread=1")) {
        return Promise.resolve({ ok: true, status: 200, json: async () => unread });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => recent });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderHook(() => useRoutineRunNotifications());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    recent = [runDto({ id: "run-start", status: "running" })];

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith(copy.alertStarted("Nightly"), {
        description: copy.alertStartedBody
      });
    });

    const startCalls = vi.mocked(toast).mock.calls.filter(
      (call) => call[0] === copy.alertStarted("Nightly")
    ).length;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    const startCallsAfter = vi.mocked(toast).mock.calls.filter(
      (call) => call[0] === copy.alertStarted("Nightly")
    ).length;
    expect(startCallsAfter).toBe(startCalls);
  });

  it("toasts end and acks", async () => {
    async function expectEndToast(status: "succeeded" | "failed") {
      resetRoutineRunStartNotificationsForTests();
      vi.mocked(toast).mockClear();
      const finished = runDto({
        id: `run-${status}`,
        status,
        reason: status === "failed" ? "timeout" : null,
        finishedAt: "2026-11-19T14:05:00.000Z"
      });
      const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = (init?.method ?? "GET").toUpperCase();
        if (method === "POST" && url.includes("/ack")) {
          return Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: true }) });
        }
        if (url.includes("unread=1")) {
          return Promise.resolve({ ok: true, status: 200, json: async () => [finished] });
        }
        return Promise.resolve({ ok: true, status: 200, json: async () => [finished] });
      });
      vi.stubGlobal("fetch", fetchMock);

      const { unmount } = renderHook(() => useRoutineRunNotifications());

      const title =
        status === "succeeded" ? copy.alertSucceeded("Nightly") : copy.alertFailed("Nightly");
      const description = status === "succeeded" ? "Concluída." : "timeout";

      await waitFor(() => {
        expect(toast).toHaveBeenCalledWith(title, { description });
      });

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          "/api/routines/runs/ack",
          expect.objectContaining({
            method: "POST",
            body: JSON.stringify({ runIds: [`run-${status}`] })
          })
        );
      });

      unmount();
      vi.unstubAllGlobals();
    }

    await expectEndToast("failed");
    await expectEndToast("succeeded");
  });
});
