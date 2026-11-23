import { describe, expect, it, vi } from "vitest";
import {
  ROUTINE_STALE_RUN_MS,
  ROUTINE_STALE_RUN_REASON
} from "@/modules/routines/lib/domain";
import { createRoutineFromInput, getRoutineRuns } from "@/modules/routines/lib/routine-service";
import {
  advanceRoutineNextRunAt,
  failStaleRunningRuns,
  hasRunningRun,
  insertRunningRun,
  listDueRoutines,
  listRuns,
  updateRoutineById
} from "@/modules/routines/lib/routine-repository";
import { processDueRoutines } from "@/modules/routines/lib/process-due-routines";
import { withRoutinesTestDb } from "./routines-test-db";

describe("routines poller", () => {
  it("skips disabled routines", async () => {
    await withRoutinesTestDb(async () => {
      const created = await createRoutineFromInput({
        name: "disabled",
        prompt: "p",
        agentId: "claude",
        scheduleKind: "preset",
        intervalMinutes: 15,
        enabled: true
      });
      expect(created.ok).toBe(true);
      if (!created.ok) {
        return;
      }

      await updateRoutineById(created.routine.id, { enabled: false });
      await advanceRoutineNextRunAt(created.routine.id, new Date(Date.now() - 60_000));

      const due = await listDueRoutines(new Date());
      expect(due.find((r) => r.id === created.routine.id)).toBeUndefined();

      const result = await processDueRoutines(new Date(), {
        probe: async () => true,
        run: async () => ({ stdout: "ok", stderr: "", code: 0 })
      });
      expect(result.started).toBe(0);
    });
  });

  it("skips routine with running run", async () => {
    await withRoutinesTestDb(async () => {
      const created = await createRoutineFromInput({
        name: "busy",
        prompt: "p",
        agentId: "claude",
        scheduleKind: "preset",
        intervalMinutes: 15
      });
      expect(created.ok).toBe(true);
      if (!created.ok) {
        return;
      }

      await advanceRoutineNextRunAt(created.routine.id, new Date(Date.now() - 60_000));
      await insertRunningRun(created.routine.id);
      expect(await hasRunningRun(created.routine.id)).toBe(true);

      const run = vi.fn(async () => ({ stdout: "ok", stderr: "", code: 0 }));
      const result = await processDueRoutines(new Date(), {
        probe: async () => true,
        run
      });

      expect(result.skippedRunning).toBeGreaterThanOrEqual(1);
      expect(run).not.toHaveBeenCalled();
    });
  });

  it("reaps stale running runs so orphaned rows do not block forever", async () => {
    await withRoutinesTestDb(async () => {
      const created = await createRoutineFromInput({
        name: "orphaned",
        prompt: "p",
        agentId: "claude",
        scheduleKind: "preset",
        intervalMinutes: 15
      });
      expect(created.ok).toBe(true);
      if (!created.ok) {
        return;
      }

      const startedAt = new Date(Date.now() - ROUTINE_STALE_RUN_MS - 60_000);
      await advanceRoutineNextRunAt(created.routine.id, new Date(Date.now() - 60_000));
      await insertRunningRun(created.routine.id, startedAt);
      expect(await hasRunningRun(created.routine.id)).toBe(true);

      const run = vi.fn(async () => ({ stdout: "ok", stderr: "", code: 0 }));
      const result = await processDueRoutines(new Date(), {
        probe: async () => true,
        run
      });

      expect(result.staleReaped).toBe(1);
      expect(result.started).toBe(1);
      expect(run).toHaveBeenCalled();
      expect(await hasRunningRun(created.routine.id)).toBe(false);

      const runs = await listRuns({ routineId: created.routine.id, limit: 10 });
      const reaped = runs.find((row) => row.reason === ROUTINE_STALE_RUN_REASON);
      expect(reaped?.status).toBe("failed");
    });
  });

  it("getRoutineRuns reaps stale running before returning", async () => {
    await withRoutinesTestDb(async () => {
      const created = await createRoutineFromInput({
        name: "ui-orphan",
        prompt: "p",
        agentId: "claude",
        scheduleKind: "preset",
        intervalMinutes: 15
      });
      expect(created.ok).toBe(true);
      if (!created.ok) {
        return;
      }

      const startedAt = new Date(Date.now() - ROUTINE_STALE_RUN_MS - 1);
      await insertRunningRun(created.routine.id, startedAt);

      const runs = await getRoutineRuns({ routineId: created.routine.id });
      expect(runs[0]?.status).toBe("failed");
      expect(runs[0]?.reason).toBe(ROUTINE_STALE_RUN_REASON);
      expect(await failStaleRunningRuns()).toBe(0);
    });
  });
});
