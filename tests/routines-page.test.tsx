import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { RoutinesPage } from "@/modules/routines/components/routines-page";
import { ptBR } from "@/modules/messages/pt-BR";
import { resetRoutineRunStartNotificationsForTests } from "@/modules/routines/lib/routine-run-ui";
import { renderWithProviders } from "@/tests/render-with-providers";
import type { RoutineDto, RoutineRunDto } from "@/modules/routines/lib/domain";

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn()
  })
}));

const copy = ptBR.routines;

const sampleRoutine: RoutineDto = {
  id: "routine-1",
  name: "Daily brief",
  prompt: "resumo do dia",
  agentId: "claude",
  scheduleKind: "preset",
  intervalMinutes: 60,
  cronExpr: null,
  cwd: null,
  notifySlack: false,
  enabled: true,
  nextRunAt: "2026-11-19T15:00:00.000Z",
  createdAt: "2026-11-19T12:00:00.000Z",
  updatedAt: "2026-11-19T12:00:00.000Z"
};

function runningRun(overrides: Partial<RoutineRunDto> = {}): RoutineRunDto {
  return {
    id: "run-running",
    routineId: sampleRoutine.id,
    routineName: sampleRoutine.name,
    status: "running",
    reason: null,
    stdout: null,
    stderr: null,
    slackSkipped: null,
    startedAt: "2026-11-19T14:00:00.000Z",
    finishedAt: null,
    ackedAt: null,
    ...overrides
  };
}

function succeededRun(overrides: Partial<RoutineRunDto> = {}): RoutineRunDto {
  return {
    id: "run-ok",
    routineId: sampleRoutine.id,
    routineName: sampleRoutine.name,
    status: "succeeded",
    reason: null,
    stdout: "hello out",
    stderr: "warn err",
    slackSkipped: false,
    startedAt: "2026-11-19T13:00:00.000Z",
    finishedAt: "2026-11-19T13:01:00.000Z",
    ackedAt: null,
    ...overrides
  };
}

function stubPageFetch(options: {
  routines?: RoutineDto[];
  runs?: RoutineRunDto[];
  routineRuns?: RoutineRunDto[];
  runNow?: { status: number; body?: unknown };
}) {
  const routines = options.routines ?? [sampleRoutine];
  const runs = options.runs ?? [];
  const routineRuns = options.routineRuns ?? runs.filter((r) => r.routineId === sampleRoutine.id);
  const runNow = options.runNow;

  const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();

    if (url === "/api/routines" && method === "GET") {
      return Promise.resolve({ ok: true, status: 200, json: async () => routines });
    }
    if (url === "/api/routines/agents") {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => [{ id: "claude", label: "Claude", binary: "claude", installed: true }]
      });
    }
    if (url.startsWith("/api/routines/runs") && method === "GET") {
      if (url.includes("routineId=")) {
        return Promise.resolve({ ok: true, status: 200, json: async () => routineRuns });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => runs });
    }
    if (url.endsWith("/run") && method === "POST") {
      const status = runNow?.status ?? 202;
      return Promise.resolve({
        ok: status >= 200 && status < 300,
        status,
        json: async () => runNow?.body ?? { runId: "run-new" }
      });
    }
    return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("RoutinesPage run visibility", () => {
  beforeEach(() => {
    resetRoutineRunStartNotificationsForTests();
    vi.mocked(toast).mockClear();
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("running badge and logs spinner", async () => {
    stubPageFetch({ runs: [runningRun()] });
    renderWithProviders(<RoutinesPage />);

    await waitFor(() => {
      expect(screen.getByText(copy.runningBadge)).toBeInTheDocument();
    });
    expect(screen.getByTestId("logs-spinner")).toBeInTheDocument();
  });

  it("disables run now while running", async () => {
    stubPageFetch({ runs: [runningRun()] });
    renderWithProviders(<RoutinesPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: copy.runNow })).toBeDisabled();
    });
  });

  it("idle card has no running chrome", async () => {
    stubPageFetch({ runs: [succeededRun()] });
    renderWithProviders(<RoutinesPage />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: sampleRoutine.name })).toBeInTheDocument();
    });
    expect(screen.queryByText(copy.runningBadge)).not.toBeInTheDocument();
    expect(screen.queryByTestId("logs-spinner")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: copy.runNow })).toBeEnabled();
  });

  it("opens logs sheet with run list", async () => {
    stubPageFetch({
      runs: [succeededRun()],
      routineRuns: [succeededRun()]
    });
    renderWithProviders(<RoutinesPage />);

    await waitFor(() => {
      expect(screen.getByLabelText(copy.logsAria(sampleRoutine.name))).toBeInTheDocument();
    });
    fireEvent.click(screen.getByLabelText(copy.logsAria(sampleRoutine.name)));

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
    expect(screen.getByText(copy.logsSheetTitle(sampleRoutine.name))).toBeInTheDocument();
    expect(screen.getByRole("option", { name: new RegExp(copy.statusSucceeded) })).toBeInTheDocument();
  });

  it("shows selected run stdout and stderr", async () => {
    stubPageFetch({
      runs: [succeededRun()],
      routineRuns: [succeededRun({ stdout: "", stderr: null })]
    });
    renderWithProviders(<RoutinesPage />);

    await waitFor(() => {
      expect(screen.getByLabelText(copy.logsAria(sampleRoutine.name))).toBeInTheDocument();
    });
    fireEvent.click(screen.getByLabelText(copy.logsAria(sampleRoutine.name)));

    await waitFor(() => {
      expect(screen.getByText(copy.logsStdoutEmpty)).toBeInTheDocument();
    });
    expect(screen.getByText(copy.logsStderrEmpty)).toBeInTheDocument();
  });

  it("logs sheet empty state", async () => {
    stubPageFetch({ runs: [], routineRuns: [] });
    renderWithProviders(<RoutinesPage />);

    await waitFor(() => {
      expect(screen.getByLabelText(copy.logsAria(sampleRoutine.name))).toBeInTheDocument();
    });
    fireEvent.click(screen.getByLabelText(copy.logsAria(sampleRoutine.name)));

    await waitFor(() => {
      expect(screen.getByText(copy.logsEmpty)).toBeInTheDocument();
    });
  });

  it("closes logs sheet", async () => {
    stubPageFetch({ runs: [succeededRun()], routineRuns: [succeededRun()] });
    renderWithProviders(<RoutinesPage />);

    await waitFor(() => {
      expect(screen.getByLabelText(copy.logsAria(sampleRoutine.name))).toBeInTheDocument();
    });
    fireEvent.click(screen.getByLabelText(copy.logsAria(sampleRoutine.name)));

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /close/i }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(screen.getByRole("heading", { name: sampleRoutine.name })).toBeInTheDocument();
  });

  it("polls routine runs while sheet open and running", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = stubPageFetch({
      runs: [runningRun()],
      routineRuns: [runningRun()]
    });
    renderWithProviders(<RoutinesPage />);

    await waitFor(() => {
      expect(screen.getByLabelText(copy.logsAria(sampleRoutine.name))).toBeInTheDocument();
    });
    fireEvent.click(screen.getByLabelText(copy.logsAria(sampleRoutine.name)));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          (call) => String(call[0]).includes("routineId=") && String(call[0]).includes(sampleRoutine.id)
        )
      ).toBe(true);
    });

    const before = fetchMock.mock.calls.filter((call) => String(call[0]).includes("routineId=")).length;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });

    await waitFor(() => {
      const after = fetchMock.mock.calls.filter((call) => String(call[0]).includes("routineId=")).length;
      expect(after).toBeGreaterThan(before);
    });
  });

  it("updates sheet when run finishes", async () => {
    let routineRuns: RoutineRunDto[] = [runningRun()];
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      if (url === "/api/routines" && method === "GET") {
        return Promise.resolve({ ok: true, status: 200, json: async () => [sampleRoutine] });
      }
      if (url === "/api/routines/agents") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => [{ id: "claude", label: "Claude", binary: "claude", installed: true }]
        });
      }
      if (url.startsWith("/api/routines/runs") && method === "GET") {
        if (url.includes("routineId=")) {
          return Promise.resolve({ ok: true, status: 200, json: async () => routineRuns });
        }
        return Promise.resolve({ ok: true, status: 200, json: async () => routineRuns });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers({ shouldAdvanceTime: true });

    renderWithProviders(<RoutinesPage />);

    await waitFor(() => {
      expect(screen.getByLabelText(copy.logsAria(sampleRoutine.name))).toBeInTheDocument();
    });
    fireEvent.click(screen.getByLabelText(copy.logsAria(sampleRoutine.name)));

    await waitFor(() => {
      expect(screen.getByRole("option", { name: new RegExp(copy.statusRunning) })).toBeInTheDocument();
    });

    routineRuns = [
      succeededRun({
        id: "run-running",
        stdout: "done-out",
        stderr: "done-err"
      })
    ];

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });

    await waitFor(() => {
      expect(screen.getByText("done-out")).toBeInTheDocument();
    });
    expect(screen.getByText("done-err")).toBeInTheDocument();
    expect(
      within(screen.getByRole("dialog")).getAllByText(copy.statusSucceeded).length
    ).toBeGreaterThanOrEqual(1);
  });

  it("run now toasts start on 202", async () => {
    stubPageFetch({ runs: [], runNow: { status: 202, body: { runId: "run-new" } } });
    renderWithProviders(<RoutinesPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: copy.runNow })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: copy.runNow }));

    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith(copy.alertStarted(sampleRoutine.name), {
        description: copy.alertStartedBody
      });
    });
  });

  it("run now conflict does not toast start", async () => {
    stubPageFetch({ runs: [], runNow: { status: 409 } });
    renderWithProviders(<RoutinesPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: copy.runNow })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: copy.runNow }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(copy.runConflict);
    });
    expect(toast).not.toHaveBeenCalledWith(
      copy.alertStarted(sampleRoutine.name),
      expect.anything()
    );
  });
});
