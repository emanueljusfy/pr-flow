import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ROUTINE_OUTPUT_TRUNCATE_CHARS } from "@/modules/routines/lib/domain";
import { createRoutineFromInput } from "@/modules/routines/lib/routine-service";
import { getRoutineById, listRuns } from "@/modules/routines/lib/routine-repository";
import { runRoutineToCompletionForTests } from "@/modules/routines/lib/process-due-routines";
import {
  resolveRoutineCwd,
  runRoutineAgent,
  truncateOutput
} from "@/modules/routines/lib/routine-runner";
import { withRoutinesTestDb } from "./routines-test-db";

describe("routines runner", () => {
  it("spawns fresh process with prompt and cwd", async () => {
    const calls: Array<{ command: string; args: string[]; cwd?: string }> = [];
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "routines-run-cwd-"));
    const run = vi.fn(async (command: string, args: string[], options?: { cwd?: string }) => {
      calls.push({ command, args, cwd: options?.cwd });
      return { stdout: "ok", stderr: "", code: 0 };
    });

    const result = await runRoutineAgent({
      routine: {
        id: "r1",
        name: "n",
        prompt: "do the thing",
        agentId: "claude",
        scheduleKind: "preset",
        intervalMinutes: 15,
        cronExpr: null,
        cwd: dir,
        notifySlack: false,
        enabled: true,
        nextRunAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      run,
      probe: async () => true
    });

    expect(result.status).toBe("succeeded");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.command).toBe("claude");
    expect(calls[0]?.args).toContain("do the thing");
    expect(calls[0]?.cwd).toBe(dir);
    expect(
      resolveRoutineCwd(
        {
          id: "r1",
          name: "n",
          prompt: "p",
          agentId: "claude",
          scheduleKind: "preset",
          intervalMinutes: 15,
          cronExpr: null,
          cwd: null,
          notifySlack: false,
          enabled: true,
          nextRunAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        "/fallback"
      )
    ).toBe("/fallback");
    fs.rmdirSync(dir);
  });

  it("fails with agent_not_found and advances nextRunAt", async () => {
    await withRoutinesTestDb(async () => {
      const created = await createRoutineFromInput({
        name: "missing-agent",
        prompt: "p",
        agentId: "claude",
        scheduleKind: "preset",
        intervalMinutes: 15
      });
      expect(created.ok).toBe(true);
      if (!created.ok) {
        return;
      }

      const beforeNext = new Date(created.routine.nextRunAt).getTime();
      const completed = await runRoutineToCompletionForTests(created.routine.id, {
        probe: async () => false
      });
      expect(completed.ok).toBe(true);
      if (!completed.ok) {
        return;
      }
      expect(completed.status).toBe("failed");

      const runs = await listRuns({ routineId: created.routine.id });
      expect(runs[0]?.reason).toBe("agent_not_found");
      expect(runs[0]?.ackedAt).toBeNull();

      const updated = await getRoutineById(created.routine.id);
      expect(updated).toBeTruthy();
      expect(new Date(updated!.nextRunAt).getTime()).toBeGreaterThan(beforeNext);
    });
  });

  it("truncates output at 100000 and persists status", async () => {
    expect(ROUTINE_OUTPUT_TRUNCATE_CHARS).toBe(100_000);
    expect(truncateOutput("a".repeat(10))).toHaveLength(10);
    expect(truncateOutput("a".repeat(100_000 + 50))).toHaveLength(100_000);

    await withRoutinesTestDb(async () => {
      const created = await createRoutineFromInput({
        name: "big-out",
        prompt: "p",
        agentId: "claude",
        scheduleKind: "preset",
        intervalMinutes: 15
      });
      expect(created.ok).toBe(true);
      if (!created.ok) {
        return;
      }

      const huge = "x".repeat(100_000 + 20);
      await runRoutineToCompletionForTests(created.routine.id, {
        probe: async () => true,
        run: async () => ({ stdout: huge, stderr: huge, code: 0 })
      });

      const runs = await listRuns({ routineId: created.routine.id });
      expect(runs[0]?.status).toBe("succeeded");
      expect(runs[0]?.stdout).toHaveLength(100_000);
      expect(runs[0]?.stderr).toHaveLength(100_000);
    });
  });
});
