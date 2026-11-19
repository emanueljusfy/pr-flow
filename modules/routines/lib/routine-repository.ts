import { and, asc, desc, eq, inArray, isNull, lte, ne } from "drizzle-orm";
import { getDb } from "@/modules/db/lib/db";
import type { RoutineDto, RoutineRunDto, RoutineRunStatus } from "@/modules/routines/lib/domain";
import { routineRuns, routines, type RoutineRow, type RoutineRunRow } from "@/modules/routines/lib/schema";

function toRoutineDto(row: RoutineRow): RoutineDto {
  return {
    id: row.id,
    name: row.name,
    prompt: row.prompt,
    agentId: row.agentId,
    scheduleKind: row.scheduleKind as RoutineDto["scheduleKind"],
    intervalMinutes: row.intervalMinutes,
    cronExpr: row.cronExpr,
    cwd: row.cwd,
    notifySlack: row.notifySlack,
    enabled: row.enabled,
    nextRunAt: row.nextRunAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function toRunDto(row: RoutineRunRow, routineName?: string): RoutineRunDto {
  return {
    id: row.id,
    routineId: row.routineId,
    routineName,
    status: row.status as RoutineRunStatus,
    reason: row.reason,
    stdout: row.stdout,
    stderr: row.stderr,
    slackSkipped: row.slackSkipped,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt ? row.finishedAt.toISOString() : null,
    ackedAt: row.ackedAt ? row.ackedAt.toISOString() : null
  };
}

export async function listRoutines(): Promise<RoutineDto[]> {
  const db = getDb();
  const rows = await db.select().from(routines).orderBy(asc(routines.name));
  return rows.map(toRoutineDto);
}

export async function getRoutineById(id: string): Promise<RoutineDto | null> {
  const db = getDb();
  const rows = await db.select().from(routines).where(eq(routines.id, id)).limit(1);
  return rows[0] ? toRoutineDto(rows[0]) : null;
}

export async function insertRoutine(input: {
  name: string;
  prompt: string;
  agentId: string;
  scheduleKind: "preset" | "cron";
  intervalMinutes: number | null;
  cronExpr: string | null;
  cwd: string | null;
  notifySlack: boolean;
  enabled: boolean;
  nextRunAt: Date;
}): Promise<RoutineDto> {
  const db = getDb();
  const rows = await db
    .insert(routines)
    .values({
      name: input.name,
      prompt: input.prompt,
      agentId: input.agentId,
      scheduleKind: input.scheduleKind,
      intervalMinutes: input.intervalMinutes,
      cronExpr: input.cronExpr,
      cwd: input.cwd,
      notifySlack: input.notifySlack,
      enabled: input.enabled,
      nextRunAt: input.nextRunAt
    })
    .returning();
  return toRoutineDto(rows[0]);
}

export async function updateRoutineById(
  id: string,
  patch: Partial<{
    name: string;
    prompt: string;
    agentId: string;
    scheduleKind: "preset" | "cron";
    intervalMinutes: number | null;
    cronExpr: string | null;
    cwd: string | null;
    notifySlack: boolean;
    enabled: boolean;
    nextRunAt: Date;
  }>
): Promise<RoutineDto | null> {
  const db = getDb();
  const rows = await db
    .update(routines)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(routines.id, id))
    .returning();
  return rows[0] ? toRoutineDto(rows[0]) : null;
}

export async function deleteRoutineById(id: string): Promise<boolean> {
  const db = getDb();
  const rows = await db.delete(routines).where(eq(routines.id, id)).returning({ id: routines.id });
  return rows.length > 0;
}

export async function listDueRoutines(asOf: Date): Promise<RoutineDto[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(routines)
    .where(and(eq(routines.enabled, true), lte(routines.nextRunAt, asOf)))
    .orderBy(asc(routines.nextRunAt));
  return rows.map(toRoutineDto);
}

export async function hasRunningRun(routineId: string): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select({ id: routineRuns.id })
    .from(routineRuns)
    .where(and(eq(routineRuns.routineId, routineId), eq(routineRuns.status, "running")))
    .limit(1);
  return rows.length > 0;
}

export async function insertRunningRun(routineId: string, startedAt: Date = new Date()): Promise<RoutineRunDto> {
  const db = getDb();
  const rows = await db
    .insert(routineRuns)
    .values({
      routineId,
      status: "running",
      startedAt
    })
    .returning();
  return toRunDto(rows[0]);
}

export async function finalizeRun(input: {
  runId: string;
  status: Exclude<RoutineRunStatus, "running">;
  reason?: string | null;
  stdout?: string | null;
  stderr?: string | null;
  slackSkipped?: boolean | null;
  finishedAt?: Date;
}): Promise<RoutineRunDto | null> {
  const db = getDb();
  const rows = await db
    .update(routineRuns)
    .set({
      status: input.status,
      reason: input.reason ?? null,
      stdout: input.stdout ?? null,
      stderr: input.stderr ?? null,
      slackSkipped: input.slackSkipped ?? null,
      finishedAt: input.finishedAt ?? new Date()
    })
    .where(eq(routineRuns.id, input.runId))
    .returning();
  return rows[0] ? toRunDto(rows[0]) : null;
}

export async function advanceRoutineNextRunAt(routineId: string, nextRunAt: Date): Promise<void> {
  const db = getDb();
  await db
    .update(routines)
    .set({ nextRunAt, updatedAt: new Date() })
    .where(eq(routines.id, routineId));
}

export async function listRuns(input: {
  routineId?: string;
  unread?: boolean;
  limit?: number;
}): Promise<RoutineRunDto[]> {
  const db = getDb();
  const limit = input.limit ?? 50;
  const conditions = [];
  if (input.routineId) {
    conditions.push(eq(routineRuns.routineId, input.routineId));
  }
  if (input.unread) {
    conditions.push(isNull(routineRuns.ackedAt));
    conditions.push(ne(routineRuns.status, "running"));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const rows = await db
    .select({
      run: routineRuns,
      routineName: routines.name
    })
    .from(routineRuns)
    .leftJoin(routines, eq(routineRuns.routineId, routines.id))
    .where(where)
    .orderBy(desc(routineRuns.startedAt))
    .limit(limit);

  return rows.map((row) => toRunDto(row.run, row.routineName ?? undefined));
}

export async function ackRuns(runIds: string[], ackedAt: Date = new Date()): Promise<number> {
  if (runIds.length === 0) {
    return 0;
  }
  const db = getDb();
  const rows = await db
    .update(routineRuns)
    .set({ ackedAt })
    .where(and(inArray(routineRuns.id, runIds), isNull(routineRuns.ackedAt)))
    .returning({ id: routineRuns.id });
  return rows.length;
}
