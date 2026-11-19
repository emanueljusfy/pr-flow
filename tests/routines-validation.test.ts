import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { validateCreateRoutineInput } from "@/modules/routines/lib/routine-validation";
import { createRoutineFromInput } from "@/modules/routines/lib/routine-service";
import { withRoutinesTestDb } from "./routines-test-db";

describe("routines validation", () => {
  it("rejects invalid create inputs with 400 field errors", () => {
    const invalidCron = validateCreateRoutineInput({
      name: "x",
      prompt: "p",
      agentId: "claude",
      scheduleKind: "cron",
      cronExpr: "not a cron"
    });
    expect(invalidCron.ok).toBe(false);
    if (!invalidCron.ok) {
      expect(invalidCron.errors.cronExpr).toBeTruthy();
    }

    const badInterval = validateCreateRoutineInput({
      name: "x",
      prompt: "p",
      agentId: "claude",
      scheduleKind: "preset",
      intervalMinutes: 7
    });
    expect(badInterval.ok).toBe(false);
    if (!badInterval.ok) {
      expect(badInterval.errors.intervalMinutes).toBeTruthy();
    }

    const unknownAgent = validateCreateRoutineInput({
      name: "x",
      prompt: "p",
      agentId: "shell",
      scheduleKind: "preset",
      intervalMinutes: 15
    });
    expect(unknownAgent.ok).toBe(false);
    if (!unknownAgent.ok) {
      expect(unknownAgent.errors.agentId).toBeTruthy();
    }

    const badCwd = validateCreateRoutineInput({
      name: "x",
      prompt: "p",
      agentId: "claude",
      scheduleKind: "preset",
      intervalMinutes: 15,
      cwd: "relative/path"
    });
    expect(badCwd.ok).toBe(false);
    if (!badCwd.ok) {
      expect(badCwd.errors.cwd).toBeTruthy();
    }

    const missingDir = path.join(os.tmpdir(), `missing-cwd-${Date.now()}`);
    const missingCwd = validateCreateRoutineInput({
      name: "x",
      prompt: "p",
      agentId: "claude",
      scheduleKind: "preset",
      intervalMinutes: 15,
      cwd: missingDir
    });
    expect(missingCwd.ok).toBe(false);
    if (!missingCwd.ok) {
      expect(missingCwd.errors.cwd).toBeTruthy();
    }
  });

  it("allows known agentId when not installed", async () => {
    await withRoutinesTestDb(async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "routines-cwd-"));
      const result = await createRoutineFromInput({
        name: "ahead",
        prompt: "p",
        agentId: "cursor-agent",
        scheduleKind: "preset",
        intervalMinutes: 30,
        cwd: dir
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.routine.agentId).toBe("cursor-agent");
      }
      fs.rmdirSync(dir);
    });
  });
});
