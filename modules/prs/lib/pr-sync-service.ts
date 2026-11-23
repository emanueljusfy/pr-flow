import { writeSystemLogFireAndForget } from "@/modules/observability/lib/system-logger";
import type { PrApiResponse } from "@/modules/prs/lib/domain";
import {
  getPrSyncMeta,
  loadPrMonitorCache,
  loadPrReviewContextCache,
  savePrCaches,
  savePrSyncMeta
} from "@/modules/prs/lib/pr-cache-repository";
import { detectPrTimelineEvents } from "@/modules/prs/lib/pr-timeline-detect";
import { findPrsThatLeftMonitor, reactToMergedPrs } from "@/modules/prs/lib/pr-merge-reaction-service";
import { insertPrTimelineEvents } from "@/modules/prs/lib/pr-timeline-repository";
import { getMonitoredRepositorySlugsForSync } from "@/modules/prs/lib/monitored-repositories-service";
import { getPrSyncData, toMonitorApiResponse } from "@/modules/prs/lib/pr-sync-data-service";
import { createSingleFlight } from "@/modules/server-cache/lib/server-cache";

const PRS_SYNC_LOG_SOURCE = "prs:sync";

export type PrSyncResult = {
  status: "ok" | "skipped" | "error" | "unauthenticated";
  prCount: number;
  response?: PrApiResponse;
  error?: string;
};

async function runPrSync(): Promise<PrSyncResult> {
  const repos = await getMonitoredRepositorySlugsForSync();
  if (repos.length === 0) {
    return { status: "skipped", prCount: 0, error: "Nenhum repositório cadastrado." };
  }

  const result = await getPrSyncData();

  if (result.status === "ok") {
    const syncedAt = new Date(result.fetchedAt);
    const [previousMonitor, previousReviewContext] = await Promise.all([
      loadPrMonitorCache(),
      loadPrReviewContextCache()
    ]);

    const timelineEvents = detectPrTimelineEvents({
      previousMonitor: previousMonitor?.data ?? null,
      nextMonitor: result.monitor,
      previousReviewContext: previousReviewContext?.data ?? null,
      nextReviewContext: result.reviewContext,
      githubLogin: result.githubLogin,
      syncedAt
    });
    await insertPrTimelineEvents(timelineEvents);

    await savePrCaches({
      monitor: result.monitor,
      reviewerQueue: result.reviewerQueue,
      reviewContext: result.reviewContext,
      githubLogin: result.githubLogin
    });

    const leftMonitor = findPrsThatLeftMonitor(previousMonitor?.data ?? null, result.monitor);
    if (leftMonitor.length > 0) {
      // Slack + gh calls per PR; keep them off the sync response.
      void reactToMergedPrs(leftMonitor).catch((error: unknown) => {
        writeSystemLogFireAndForget({
          level: "warn",
          source: PRS_SYNC_LOG_SOURCE,
          message: "Falha ao reagir às PRs mergeadas no Slack.",
          details: { error: error instanceof Error ? error.message : String(error) }
        });
      });
    }

    const response = toMonitorApiResponse(result);
    return { status: "ok", prCount: result.monitor.length, response };
  }

  const previousMeta = await getPrSyncMeta();

  if (result.status === "unauthenticated") {
    await savePrSyncMeta({
      githubLogin: previousMeta?.githubLogin ?? null,
      status: "unauthenticated",
      error: result.message
    });
    return {
      status: "unauthenticated",
      prCount: 0,
      response: { status: "unauthenticated", message: result.message },
      error: result.message
    };
  }

  await savePrSyncMeta({
    githubLogin: previousMeta?.githubLogin ?? null,
    status: "error",
    error: result.message
  });

  writeSystemLogFireAndForget({
    level: "error",
    source: PRS_SYNC_LOG_SOURCE,
    message: result.message,
    details: result
  });

  return {
    status: "error",
    prCount: 0,
    response: { status: "error", message: result.message },
    error: result.message
  };
}


/**
 * Cron, MCP and the API share one in-flight sync: concurrent callers wait for
 * the running gh calls instead of starting another round.
 */
export const syncPrCache: () => Promise<PrSyncResult> = createSingleFlight("prs-sync", runPrSync);

/**
 * Background polling: skips GitHub when the last successful sync is newer than
 * `minIntervalMs` and serves the SQLite snapshot instead.
 */
export async function syncPrCacheUnlessFresh(
  minIntervalMs: number,
  now: () => number = Date.now
): Promise<PrSyncResult & { throttled?: boolean }> {
  const meta = await getPrSyncMeta();
  const lastSyncedAt = meta?.lastSyncedAt?.getTime();

  if (
    meta?.lastSyncStatus === "ok" &&
    lastSyncedAt !== undefined &&
    now() - lastSyncedAt < minIntervalMs
  ) {
    const cached = await loadPrMonitorCache();
    if (cached) {
      return {
        status: "ok",
        prCount: cached.data.length,
        throttled: true,
        response: {
          status: "ok",
          data: cached.data,
          fetchedAt: cached.fetchedAt,
          githubLogin: cached.githubLogin
        }
      };
    }
  }

  return syncPrCache();
}
