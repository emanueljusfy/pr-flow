import { describe, expect, it, vi } from "vitest";
import { createRoutineFromInput } from "@/modules/routines/lib/routine-service";
import { listRuns } from "@/modules/routines/lib/routine-repository";
import { runRoutineToCompletionForTests } from "@/modules/routines/lib/process-due-routines";
import {
  buildRoutineJournalNote,
  notifyRoutineSlack
} from "@/modules/routines/lib/routine-side-effects";
import type { RoutineDto, RoutineRunDto } from "@/modules/routines/lib/domain";
import { withRoutinesTestDb } from "./routines-test-db";

const appendQuickNoteToToday = vi.fn(async () => ({ ok: true as const, note: {} as never }));

vi.mock("@/modules/journal/lib/note-service", () => ({
  appendQuickNoteToToday: (...args: unknown[]) => appendQuickNoteToToday(...args)
}));

function sampleRoutine(overrides: Partial<RoutineDto> = {}): RoutineDto {
  return {
    id: "r1",
    name: "Diária",
    prompt: "p",
    agentId: "claude",
    scheduleKind: "preset",
    intervalMinutes: 60,
    cronExpr: null,
    cwd: null,
    notifySlack: true,
    enabled: true,
    nextRunAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides
  };
}

function sampleRun(overrides: Partial<RoutineRunDto> = {}): RoutineRunDto {
  return {
    id: "run1",
    routineId: "r1",
    status: "succeeded",
    reason: null,
    stdout: "saída útil",
    stderr: "",
    costUsd: null,
    slackSkipped: null,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    ackedAt: null,
    ...overrides
  };
}

describe("routines side effects", () => {
  it("appends journal note on completion", async () => {
    appendQuickNoteToToday.mockClear();
    await withRoutinesTestDb(async () => {
      const created = await createRoutineFromInput({
        name: "Diária",
        prompt: "p",
        agentId: "claude",
        scheduleKind: "preset",
        intervalMinutes: 60
      });
      expect(created.ok).toBe(true);
      if (!created.ok) {
        return;
      }

      await runRoutineToCompletionForTests(created.routine.id, {
        probe: async () => true,
        run: async () => ({ stdout: "resultado bom", stderr: "", code: 0 })
      });

      expect(appendQuickNoteToToday).toHaveBeenCalled();
      const text = (appendQuickNoteToToday.mock.calls[0]?.[0] as { text: string }).text;
      expect(text).toContain("Diária");
      expect(text).toContain("sucesso");
      expect(text).toContain("resultado bom");
    });

    const note = buildRoutineJournalNote(
      sampleRoutine(),
      sampleRun({ status: "failed", reason: "timeout", stdout: null, stderr: "boom" })
    );
    expect(note).toContain("falha");
    expect(note).toContain("timeout");
  });

  it("posts slack or records slackSkipped", async () => {
    const post = vi.fn(async () => ({ ok: true as const, channel: "c", ts: "1" }));
    const posted = await notifyRoutineSlack(sampleRoutine({ notifySlack: true }), sampleRun(), {
      isConfigured: () => true,
      post: post as never,
      channel: () => "squad"
    });
    expect(posted).toEqual({ posted: true });
    expect(post).toHaveBeenCalled();

    const skipped = await notifyRoutineSlack(sampleRoutine({ notifySlack: true }), sampleRun(), {
      isConfigured: () => false,
      post: post as never
    });
    expect(skipped).toEqual({ posted: false, slackSkipped: true });

    await withRoutinesTestDb(async () => {
      const created = await createRoutineFromInput({
        name: "Slack off",
        prompt: "p",
        agentId: "claude",
        scheduleKind: "preset",
        intervalMinutes: 60,
        notifySlack: true
      });
      expect(created.ok).toBe(true);
      if (!created.ok) {
        return;
      }

      await runRoutineToCompletionForTests(created.routine.id, {
        probe: async () => true,
        run: async () => ({ stdout: "ok", stderr: "", code: 0 })
      });

      const runs = await listRuns({ routineId: created.routine.id });
      expect(runs[0]?.slackSkipped).toBe(true);
    });
  });
});
