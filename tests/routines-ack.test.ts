import { describe, expect, it, vi } from "vitest";
import {
  ackRoutineRunsFromInput,
  createRoutineFromInput,
  getRoutineRuns
} from "@/modules/routines/lib/routine-service";
import { runRoutineToCompletionForTests } from "@/modules/routines/lib/process-due-routines";
import { GET as getRuns } from "@/app/api/routines/runs/route";
import { withRoutinesTestDb } from "./routines-test-db";

vi.mock("@/modules/journal/lib/note-service", () => ({
  appendQuickNoteToToday: vi.fn(async () => ({ ok: true, note: {} }))
}));

describe("routines ack", () => {
  it("ack marks completed runs", async () => {
    await withRoutinesTestDb(async () => {
      const created = await createRoutineFromInput({
        name: "ack-me",
        prompt: "p",
        agentId: "claude",
        scheduleKind: "preset",
        intervalMinutes: 15
      });
      expect(created.ok).toBe(true);
      if (!created.ok) {
        return;
      }

      await runRoutineToCompletionForTests(created.routine.id, {
        probe: async () => true,
        run: async () => ({ stdout: "ok", stderr: "", code: 0 })
      });

      const unreadBefore = await getRoutineRuns({ unread: true });
      expect(unreadBefore.length).toBeGreaterThanOrEqual(1);
      expect(unreadBefore[0]?.ackedAt).toBeNull();

      const listResponse = await getRuns(
        new Request("http://localhost/api/routines/runs?unread=1")
      );
      expect(listResponse.status).toBe(200);

      const ack = await ackRoutineRunsFromInput({ runIds: [unreadBefore[0]!.id] });
      expect(ack.ok).toBe(true);

      const unreadAfter = await getRoutineRuns({ unread: true });
      expect(unreadAfter.find((r) => r.id === unreadBefore[0]!.id)).toBeUndefined();

      const all = await getRoutineRuns({ routineId: created.routine.id });
      expect(all[0]?.ackedAt).toBeTruthy();
    });
  });
});
