import type { PrHistoryApiResponse } from "@/modules/prs/lib/domain";
import { fetchPullRequestHistory, GhUnauthenticatedError } from "@/modules/prs/lib/gh-client";

export async function getPullRequestHistory(input: {
  repository: string;
  number: number;
}): Promise<PrHistoryApiResponse> {
  try {
    const { events } = await fetchPullRequestHistory(input);
    return {
      status: "ok",
      data: { events },
      fetchedAt: new Date().toISOString()
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
