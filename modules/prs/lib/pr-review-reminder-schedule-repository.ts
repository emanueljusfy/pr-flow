import { and, eq, inArray, lte } from "drizzle-orm";
import type { PrReviewReminderScheduleInfo } from "@/modules/prs/lib/domain";
import { prReviewReminderSchedules } from "@/modules/prs/lib/schema";
import { getDb } from "@/modules/db/lib/db";

export type PrReviewReminderScheduleRecord = {
  id: string;
  prUrl: string;
  repository: string;
  number: number;
  intervalMinutes: number;
  message: string | null;
  enabled: boolean;
  nextRunAt: Date;
  lastRemindedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function toInfo(row: {
  intervalMinutes: number;
  nextRunAt: Date;
}): PrReviewReminderScheduleInfo {
  return {
    intervalMinutes: row.intervalMinutes,
    nextRunAt: row.nextRunAt.toISOString()
  };
}

function toRecord(row: typeof prReviewReminderSchedules.$inferSelect): PrReviewReminderScheduleRecord {
  return {
    id: row.id,
    prUrl: row.prUrl,
    repository: row.repository,
    number: row.number,
    intervalMinutes: row.intervalMinutes,
    message: row.message,
    enabled: row.enabled,
    nextRunAt: row.nextRunAt,
    lastRemindedAt: row.lastRemindedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

export async function upsertPrReviewReminderSchedule(input: {
  prUrl: string;
  repository: string;
  number: number;
  intervalMinutes: number;
  message: string | null;
  nextRunAt: Date;
  lastRemindedAt?: Date | null;
}): Promise<PrReviewReminderScheduleInfo> {
  const db = getDb();
  const now = new Date();
  const [row] = await db
    .insert(prReviewReminderSchedules)
    .values({
      prUrl: input.prUrl,
      repository: input.repository,
      number: input.number,
      intervalMinutes: input.intervalMinutes,
      message: input.message,
      enabled: true,
      nextRunAt: input.nextRunAt,
      lastRemindedAt: input.lastRemindedAt ?? null,
      createdAt: now,
      updatedAt: now
    })
    .onConflictDoUpdate({
      target: prReviewReminderSchedules.prUrl,
      set: {
        repository: input.repository,
        number: input.number,
        intervalMinutes: input.intervalMinutes,
        message: input.message,
        enabled: true,
        nextRunAt: input.nextRunAt,
        lastRemindedAt: input.lastRemindedAt ?? null,
        updatedAt: now
      }
    })
    .returning({
      intervalMinutes: prReviewReminderSchedules.intervalMinutes,
      nextRunAt: prReviewReminderSchedules.nextRunAt
    });

  if (!row) {
    throw new Error("Não foi possível gravar o agendamento de lembrete.");
  }

  return toInfo(row);
}

export async function getPrReviewReminderSchedulesByUrls(
  urls: string[]
): Promise<Map<string, PrReviewReminderScheduleInfo>> {
  const uniqueUrls = [...new Set(urls.filter(Boolean))];
  if (uniqueUrls.length === 0) {
    return new Map();
  }

  const db = getDb();
  const rows = await db
    .select({
      prUrl: prReviewReminderSchedules.prUrl,
      intervalMinutes: prReviewReminderSchedules.intervalMinutes,
      nextRunAt: prReviewReminderSchedules.nextRunAt
    })
    .from(prReviewReminderSchedules)
    .where(
      and(
        inArray(prReviewReminderSchedules.prUrl, uniqueUrls),
        eq(prReviewReminderSchedules.enabled, true)
      )
    );

  return new Map(rows.map((row) => [row.prUrl, toInfo(row)]));
}

export async function listDuePrReviewReminderSchedules(
  asOf: Date = new Date()
): Promise<PrReviewReminderScheduleRecord[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(prReviewReminderSchedules)
    .where(
      and(eq(prReviewReminderSchedules.enabled, true), lte(prReviewReminderSchedules.nextRunAt, asOf))
    );

  return rows.map(toRecord);
}

export async function disablePrReviewReminderSchedule(prUrl: string): Promise<boolean> {
  const trimmed = prUrl.trim();
  if (!trimmed) {
    return false;
  }

  const db = getDb();
  const updated = await db
    .update(prReviewReminderSchedules)
    .set({ enabled: false, updatedAt: new Date() })
    .where(eq(prReviewReminderSchedules.prUrl, trimmed))
    .returning({ id: prReviewReminderSchedules.id });

  return updated.length > 0;
}

export async function markPrReviewReminderScheduleSent(input: {
  prUrl: string;
  nextRunAt: Date;
  lastRemindedAt: Date;
}): Promise<void> {
  const db = getDb();
  await db
    .update(prReviewReminderSchedules)
    .set({
      nextRunAt: input.nextRunAt,
      lastRemindedAt: input.lastRemindedAt,
      updatedAt: new Date()
    })
    .where(eq(prReviewReminderSchedules.prUrl, input.prUrl));
}
