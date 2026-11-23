import { listRoutineAgents } from "@/modules/routines/lib/agent-registry";
import type { RoutineDto, RoutineRunDto } from "@/modules/routines/lib/domain";
import {
  ackRuns,
  deleteRoutineById,
  failStaleRunningRuns,
  getRoutineById,
  insertRoutine,
  listRoutines,
  listRuns,
  updateRoutineById
} from "@/modules/routines/lib/routine-repository";
import { computeNextRunAt } from "@/modules/routines/lib/routine-schedule";
import {
  validateAckRunsInput,
  validateCreateRoutineInput,
  validateUpdateRoutineInput,
  type CreateRoutineInput,
  type UpdateRoutineInput
} from "@/modules/routines/lib/routine-validation";
import { startManualRoutineRun } from "@/modules/routines/lib/process-due-routines";

export async function getRoutines(): Promise<RoutineDto[]> {
  return listRoutines();
}

export async function createRoutineFromInput(
  input: CreateRoutineInput
): Promise<
  | { ok: true; routine: RoutineDto }
  | { ok: false; status: 400; errors: Record<string, string> }
> {
  const validation = validateCreateRoutineInput(input);
  if (!validation.ok) {
    return { ok: false, status: 400, errors: validation.errors };
  }

  const value = validation.value;
  const nextRunAt = computeNextRunAt({
    scheduleKind: value.scheduleKind,
    intervalMinutes: value.intervalMinutes,
    cronExpr: value.cronExpr,
    from: new Date()
  });

  const routine = await insertRoutine({
    name: value.name,
    prompt: value.prompt,
    agentId: value.agentId,
    scheduleKind: value.scheduleKind,
    intervalMinutes: value.intervalMinutes,
    cronExpr: value.cronExpr,
    cwd: value.cwd,
    notifySlack: value.notifySlack,
    enabled: value.enabled,
    nextRunAt
  });

  return { ok: true, routine };
}

export async function updateRoutineFromInput(
  id: string,
  input: UpdateRoutineInput
): Promise<
  | { ok: true; routine: RoutineDto }
  | { ok: false; status: 400; errors: Record<string, string> }
  | { ok: false; status: 404 }
> {
  const existing = await getRoutineById(id);
  if (!existing) {
    return { ok: false, status: 404 };
  }

  const validation = validateUpdateRoutineInput(input);
  if (!validation.ok) {
    return { ok: false, status: 400, errors: validation.errors };
  }

  const patch = validation.value;
  const scheduleKind = patch.scheduleKind ?? existing.scheduleKind;
  const intervalMinutes =
    patch.intervalMinutes !== undefined ? patch.intervalMinutes : existing.intervalMinutes;
  const cronExpr = patch.cronExpr !== undefined ? patch.cronExpr : existing.cronExpr;

  const scheduleChanged =
    patch.scheduleKind !== undefined ||
    patch.intervalMinutes !== undefined ||
    patch.cronExpr !== undefined;

  const nextRunAt = scheduleChanged
    ? computeNextRunAt({
        scheduleKind,
        intervalMinutes,
        cronExpr,
        from: new Date()
      })
    : undefined;

  const routine = await updateRoutineById(id, {
    ...patch,
    ...(nextRunAt ? { nextRunAt } : {})
  });

  if (!routine) {
    return { ok: false, status: 404 };
  }
  return { ok: true, routine };
}

export async function removeRoutine(id: string): Promise<{ ok: true } | { ok: false; status: 404 }> {
  const removed = await deleteRoutineById(id);
  return removed ? { ok: true } : { ok: false, status: 404 };
}

export async function getRoutineAgents() {
  return listRoutineAgents();
}

export async function getRoutineRuns(query: {
  routineId?: string | null;
  unread?: boolean;
  limit?: number;
}): Promise<RoutineRunDto[]> {
  // Heal orphaned "running" rows so the UI does not show "Em execução" forever
  // after a process restart mid-run.
  await failStaleRunningRuns();
  return listRuns({
    routineId: query.routineId ?? undefined,
    unread: query.unread,
    limit: query.limit
  });
}

export async function ackRoutineRunsFromInput(
  input: unknown
): Promise<{ ok: true } | { ok: false; status: 400; errors: Record<string, string> }> {
  const validation = validateAckRunsInput(input);
  if (!validation.ok) {
    return { ok: false, status: 400, errors: validation.errors };
  }
  await ackRuns(validation.value.runIds);
  return { ok: true };
}

export async function triggerManualRoutineRun(id: string) {
  return startManualRoutineRun(id);
}
