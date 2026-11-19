import { describe, expect, it, vi } from "vitest";
import { createRoutineFromInput } from "@/modules/routines/lib/routine-service";
import {
  advanceRoutineNextRunAt,
  hasRunningRun,
  insertRunningRun,
  listDueRoutines,
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
});
