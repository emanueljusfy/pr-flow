import { and, desc, eq, inArray, isNotNull, isNull, lt, ne } from "drizzle-orm";
import { getDb } from "@/modules/db/lib/db";
import {
  AI_REVIEW_CONFIG_ID,
  AI_REVIEW_STALE_RUN_MS,
  AI_REVIEW_STALE_RUN_REASON,
  type AiReviewRunStatus,
  type AiReviewSlackReaction,
  type AiReviewTrigger,
  type AiReviewVerdict,
  type PrAiReviewConfigDto,
  type PrAiReviewRunDto
} from "@/modules/pr-ai-review/lib/domain";
import { DEFAULT_AI_REVIEW_PROMPT_TEMPLATE } from "@/modules/pr-ai-review/lib/prompt-template";
import {
  prAiReviewConfig,
  prAiReviewRuns,
  type PrAiReviewConfigRow,
  type PrAiReviewRunRow
} from "@/modules/pr-ai-review/lib/schema";

function parseAuthorLogins(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function toConfigDto(row: PrAiReviewConfigRow): PrAiReviewConfigDto {
  return {
    enabled: row.enabled,
    intervalMinutes: row.intervalMinutes,
    agentId: row.agentId,
    cwd: row.cwd,
    authorLogins: parseAuthorLogins(row.authorLogins),
    repoPattern: row.repoPattern,
    promptTemplate: row.promptTemplate ?? DEFAULT_AI_REVIEW_PROMPT_TEMPLATE,
    promptIsDefault: row.promptTemplate === null,
    nextRunAt: row.nextRunAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function toRunDto(row: PrAiReviewRunRow): PrAiReviewRunDto {
  return {
    id: row.id,
    cycleId: row.cycleId,
    prUrl: row.prUrl,
    repository: row.repository,
    prNumber: row.prNumber,
    prTitle: row.prTitle,
    headSha: row.headSha,
    trigger: row.trigger as AiReviewTrigger,
    status: row.status as AiReviewRunStatus,
    reason: row.reason,
    verdict: (row.verdict as AiReviewVerdict | null) ?? null,
    reviewUrl: row.reviewUrl,
    slackReaction: (row.slackReaction as AiReviewSlackReaction | null) ?? null,
    stdout: row.stdout,
    stderr: row.stderr,
    costUsd: row.costUsd ?? null,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt ? row.finishedAt.toISOString() : null,
    ackedAt: row.ackedAt ? row.ackedAt.toISOString() : null
  };
}

/** Reads the single config row; writes the default one when the table is empty. */
export async function getAiReviewConfig(): Promise<PrAiReviewConfigDto> {
  const db = getDb();
  const rows = await db.select().from(prAiReviewConfig).where(eq(prAiReviewConfig.id, AI_REVIEW_CONFIG_ID)).limit(1);
  if (rows[0]) {
    return toConfigDto(rows[0]);
  }
  const now = new Date();
  const inserted = await db
    .insert(prAiReviewConfig)
    .values({ id: AI_REVIEW_CONFIG_ID, nextRunAt: now, updatedAt: now })
    .onConflictDoNothing()
    .returning();
  if (inserted[0]) {
    return toConfigDto(inserted[0]);
  }
  return getAiReviewConfig();
}

export type AiReviewConfigPatch = Partial<{
  enabled: boolean;
  intervalMinutes: number;
  agentId: string;
  cwd: string | null;
  authorLogins: string[];
  repoPattern: string;
  /** Null resets to the default template. */
  promptTemplate: string | null;
  nextRunAt: Date;
}>;

export async function updateAiReviewConfig(patch: AiReviewConfigPatch): Promise<PrAiReviewConfigDto> {
  await getAiReviewConfig();
  const { authorLogins, ...rest } = patch;
  const db = getDb();
  const rows = await db
    .update(prAiReviewConfig)
    .set({
      ...rest,
      ...(authorLogins !== undefined ? { authorLogins: JSON.stringify(authorLogins) } : {}),
      updatedAt: new Date()
    })
    .where(eq(prAiReviewConfig.id, AI_REVIEW_CONFIG_ID))
    .returning();
  return toConfigDto(rows[0]);
}

export async function hasRunningAiReview(): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select({ id: prAiReviewRuns.id })
    .from(prAiReviewRuns)
    .where(eq(prAiReviewRuns.status, "running"))
    .limit(1);
  return rows.length > 0;
}

/** Marks orphaned `running` rows (process died before finalize) as failed. */
export async function failStaleAiReviewRuns(
  asOf: Date = new Date(),
  staleAfterMs: number = AI_REVIEW_STALE_RUN_MS
): Promise<number> {
  const cutoff = new Date(asOf.getTime() - staleAfterMs);
  const db = getDb();
  const rows = await db
    .update(prAiReviewRuns)
    .set({
      status: "failed",
      reason: AI_REVIEW_STALE_RUN_REASON,
      stderr: "Execução interrompida (processo reiniciado ou sem finalização).",
      finishedAt: asOf
    })
    .where(and(eq(prAiReviewRuns.status, "running"), lt(prAiReviewRuns.startedAt, cutoff)))
    .returning({ id: prAiReviewRuns.id });
  return rows.length;
}

export async function insertRunningAiReview(input: {
  cycleId: string | null;
  prUrl: string;
  repository: string;
  prNumber: number;
  prTitle: string;
  headSha: string;
  trigger: AiReviewTrigger;
  startedAt?: Date;
}): Promise<PrAiReviewRunDto> {
  const db = getDb();
  const rows = await db
    .insert(prAiReviewRuns)
    .values({
      cycleId: input.cycleId,
      prUrl: input.prUrl,
      repository: input.repository,
      prNumber: input.prNumber,
      prTitle: input.prTitle,
      headSha: input.headSha,
      trigger: input.trigger,
      status: "running",
      startedAt: input.startedAt ?? new Date()
    })
    .returning();
  return toRunDto(rows[0]);
}

export async function finalizeAiReview(input: {
  runId: string;
  status: Exclude<AiReviewRunStatus, "running">;
  reason?: string | null;
  verdict?: AiReviewVerdict | null;
  reviewUrl?: string | null;
  slackReaction?: AiReviewSlackReaction | null;
  stdout?: string | null;
  stderr?: string | null;
  costUsd?: number | null;
  finishedAt?: Date;
}): Promise<PrAiReviewRunDto | null> {
  const db = getDb();
  const rows = await db
    .update(prAiReviewRuns)
    .set({
      status: input.status,
      reason: input.reason ?? null,
      verdict: input.verdict ?? null,
      reviewUrl: input.reviewUrl ?? null,
      slackReaction: input.slackReaction ?? null,
      stdout: input.stdout ?? null,
      stderr: input.stderr ?? null,
      costUsd: input.costUsd ?? null,
      finishedAt: input.finishedAt ?? new Date()
    })
    .where(eq(prAiReviewRuns.id, input.runId))
    .returning();
  return rows[0] ? toRunDto(rows[0]) : null;
}

/** Heads that already carry an AI verdict; the cycle does not review them again. */
export async function listReviewedHeads(prUrls: string[]): Promise<Array<{ prUrl: string; headSha: string }>> {
  if (prUrls.length === 0) {
    return [];
  }
  const db = getDb();
  return db
    .select({ prUrl: prAiReviewRuns.prUrl, headSha: prAiReviewRuns.headSha })
    .from(prAiReviewRuns)
    .where(and(inArray(prAiReviewRuns.prUrl, prUrls), isNotNull(prAiReviewRuns.verdict)));
}

export async function listAiReviewRuns(input: {
  prUrl?: string;
  unread?: boolean;
  status?: AiReviewRunStatus;
  cycleId?: string;
  limit?: number;
}): Promise<PrAiReviewRunDto[]> {
  const db = getDb();
  const conditions = [];
  if (input.prUrl) {
    conditions.push(eq(prAiReviewRuns.prUrl, input.prUrl));
  }
  if (input.cycleId) {
    conditions.push(eq(prAiReviewRuns.cycleId, input.cycleId));
  }
  if (input.status) {
    conditions.push(eq(prAiReviewRuns.status, input.status));
  }
  if (input.unread) {
    conditions.push(isNull(prAiReviewRuns.ackedAt));
    conditions.push(ne(prAiReviewRuns.status, "running"));
  }
  const rows = await db
    .select()
    .from(prAiReviewRuns)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(prAiReviewRuns.startedAt))
    .limit(input.limit ?? 50);
  return rows.map(toRunDto);
}

export async function ackAiReviewRuns(runIds: string[], ackedAt: Date = new Date()): Promise<number> {
  if (runIds.length === 0) {
    return 0;
  }
  const db = getDb();
  const rows = await db
    .update(prAiReviewRuns)
    .set({ ackedAt })
    .where(and(inArray(prAiReviewRuns.id, runIds), isNull(prAiReviewRuns.ackedAt)))
    .returning({ id: prAiReviewRuns.id });
  return rows.length;
}
