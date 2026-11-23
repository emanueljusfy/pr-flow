import { and, eq } from "drizzle-orm";
import { summaries } from "@/modules/dashboard/lib/dashboard-briefing-schema";
import { getDb } from "@/modules/db/lib/db";

export type StoredDashboardBriefing = {
  day: string;
  content: string;
  generatedAt: string;
};

function toStored(row: typeof summaries.$inferSelect): StoredDashboardBriefing {
  return {
    day: row.periodKey,
    content: row.content,
    generatedAt: row.generatedAt.toISOString()
  };
}

export async function getStoredDashboardBriefing(day: string): Promise<StoredDashboardBriefing | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(summaries)
    .where(and(eq(summaries.type, "dashboard"), eq(summaries.periodKey, day)));

  return row ? toStored(row) : null;
}

export async function saveDashboardBriefing(day: string, content: string): Promise<StoredDashboardBriefing> {
  const db = getDb();
  const now = new Date();

  const [row] = await db
    .insert(summaries)
    .values({ type: "dashboard", periodKey: day, content, generatedAt: now })
    .onConflictDoUpdate({
      target: [summaries.type, summaries.periodKey],
      set: { content, generatedAt: now }
    })
    .returning();

  return toStored(row);
}
