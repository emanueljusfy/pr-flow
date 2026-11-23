import type { PrHistoryApiResponse } from "@/modules/prs/lib/domain";
import { fetchPullRequestHistory, GhUnauthenticatedError } from "@/modules/prs/lib/gh-client";
import { createServerCache } from "@/modules/server-cache/lib/server-cache";

type CachedHistory = {
  events: Awaited<ReturnType<typeof fetchPullRequestHistory>>["events"];
  fetchedAt: string;
};

// Reopening the panel is instant; after 1 min it shows the cached timeline and
// refreshes in the background.
const historyCache = createServerCache<CachedHistory>({
  name: "prs:history",
  ttlMs: 60_000,
  staleTtlMs: 30 * 60_000
});

export function clearPullRequestHistoryCache(): void {
  historyCache.clear();
}

export async function getPullRequestHistory(input: {
  repository: string;
  number: number;
}): Promise<PrHistoryApiResponse> {
  try {
    const { events, fetchedAt } = await historyCache.get(
      `${input.repository}#${input.number}`,
      async () => ({
        events: (await fetchPullRequestHistory(input)).events,
        fetchedAt: new Date().toISOString()
      })
    );
    return {
      status: "ok",
      data: { events },
      fetchedAt
    };
  } catch (error) {
    if (error instanceof GhUnauthenticatedError) {
      return {
        status: "unauthenticated",
        message: error.message
      };
    }
    const message =
      error instanceof Error ? error.message : "Não foi possível carregar o histórico da PR.";
    return {
      status: "error",
      message
    };
  }
}
