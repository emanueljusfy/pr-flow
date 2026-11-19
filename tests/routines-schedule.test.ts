import { describe, expect, it } from "vitest";
import { PRESET_INTERVAL_MINUTES } from "@/modules/routines/lib/domain";
import { createRoutineFromInput } from "@/modules/routines/lib/routine-service";
import { withRoutinesTestDb } from "./routines-test-db";

describe("routines schedule", () => {
  it("creates preset routine with future nextRunAt", async () => {
    await withRoutinesTestDb(async () => {
      const before = Date.now();
      for (const intervalMinutes of PRESET_INTERVAL_MINUTES) {
        const result = await createRoutineFromInput({
          name: `preset-${intervalMinutes}`,
          prompt: "hello",
          agentId: "claude",
          scheduleKind: "preset",
          intervalMinutes,
          notifySlack: false,
          enabled: true
        });
        expect(result.ok).toBe(true);
        if (!result.ok) {
          continue;
        }
        expect(result.routine.scheduleKind).toBe("preset");
        expect(result.routine.intervalMinutes).toBe(intervalMinutes);
        expect(new Date(result.routine.nextRunAt).getTime()).toBeGreaterThan(before);
      }
    });
  });

  it("creates cron routine with future nextRunAt", async () => {
    await withRoutinesTestDb(async () => {
      const before = Date.now();
      const result = await createRoutineFromInput({
        name: "cron-daily",
        prompt: "hello",
        agentId: "claude",
        scheduleKind: "cron",
        cronExpr: "0 9 * * 1-5",
        notifySlack: false,
        enabled: true
      });
      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }
      expect(result.routine.scheduleKind).toBe("cron");
      expect(result.routine.cronExpr).toBe("0 9 * * 1-5");
      expect(new Date(result.routine.nextRunAt).getTime()).toBeGreaterThan(before);
    });
  });
});
