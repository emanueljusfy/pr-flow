import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { GET as listRoutines, POST as createRoutine } from "@/app/api/routines/route";
import { PATCH as patchRoutine, DELETE as deleteRoutine } from "@/app/api/routines/[id]/route";
import { POST as runRoutine } from "@/app/api/routines/[id]/run/route";
import { createRoutineFromInput } from "@/modules/routines/lib/routine-service";
import { insertRunningRun } from "@/modules/routines/lib/routine-repository";
import { withRoutinesTestDb } from "./routines-test-db";

vi.mock("@/modules/journal/lib/note-service", () => ({
  appendQuickNoteToToday: vi.fn(async () => ({ ok: true, note: {} }))
}));

describe("routines api", () => {
  it("crud surface statuses", async () => {
    await withRoutinesTestDb(async () => {
      const list = await listRoutines();
      expect(list.status).toBe(200);

      const bad = await createRoutine(
        new Request("http://localhost/api/routines", {
          method: "POST",
          body: JSON.stringify({
            name: "x",
            prompt: "p",
            agentId: "nope",
            scheduleKind: "preset",
            intervalMinutes: 15
          })
        })
      );
      expect(bad.status).toBe(400);

      const created = await createRoutine(
        new Request("http://localhost/api/routines", {
          method: "POST",
          body: JSON.stringify({
            name: "ok",
            prompt: "p",
            agentId: "claude",
            scheduleKind: "preset",
            intervalMinutes: 15
          })
        })
      );
      expect(created.status).toBe(201);
      const routine = (await created.json()) as { id: string };

      const patched = await patchRoutine(
        new Request(`http://localhost/api/routines/${routine.id}`, {
          method: "PATCH",
          body: JSON.stringify({ name: "renamed" })
        }),
        { params: Promise.resolve({ id: routine.id }) }
      );
      expect(patched.status).toBe(200);

      const badPatch = await patchRoutine(
        new Request(`http://localhost/api/routines/${routine.id}`, {
          method: "PATCH",
          body: JSON.stringify({ agentId: "nope" })
        }),
        { params: Promise.resolve({ id: routine.id }) }
      );
      expect(badPatch.status).toBe(400);

      const missingPatch = await patchRoutine(
        new Request("http://localhost/api/routines/00000000-0000-4000-8000-000000000099", {
          method: "PATCH",
          body: JSON.stringify({ name: "x" })
        }),
        { params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000099" }) }
      );
      expect(missingPatch.status).toBe(404);

      const deleted = await deleteRoutine(
        new Request(`http://localhost/api/routines/${routine.id}`, { method: "DELETE" }),
        { params: Promise.resolve({ id: routine.id }) }
      );
      expect(deleted.status).toBe(204);

      const missingDelete = await deleteRoutine(
        new Request(`http://localhost/api/routines/${routine.id}`, { method: "DELETE" }),
        { params: Promise.resolve({ id: routine.id }) }
      );
      expect(missingDelete.status).toBe(404);
    });
  });

  it("manual run statuses", async () => {
    await withRoutinesTestDb(async () => {
      const missing = await runRoutine(new Request("http://localhost"), {
        params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000099" })
      });
      expect(missing.status).toBe(404);

      const created = await createRoutineFromInput({
        name: "manual",
        prompt: "p",
        agentId: "claude",
        scheduleKind: "preset",
        intervalMinutes: 15
      });
      expect(created.ok).toBe(true);
      if (!created.ok) {
        return;
      }

      const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "routines-api-"));
      await createRoutineFromInput({
        name: "with-cwd",
        prompt: "p",
        agentId: "claude",
        scheduleKind: "preset",
        intervalMinutes: 15,
        cwd
      });

      const queued = await runRoutine(new Request("http://localhost"), {
        params: Promise.resolve({ id: created.routine.id })
      });
      expect(queued.status).toBe(202);
      const body = (await queued.json()) as { runId: string };
      expect(body.runId).toBeTruthy();

      // Ensure a running row exists for conflict — if async finished already, insert one.
      await insertRunningRun(created.routine.id);
      const conflict = await runRoutine(new Request("http://localhost"), {
        params: Promise.resolve({ id: created.routine.id })
      });
      expect(conflict.status).toBe(409);

      fs.rmdirSync(cwd);
    });
  });
});
