"use client";

import { useCallback, useEffect, useState } from "react";
import type { PrAiReviewRunDto } from "@/modules/pr-ai-review/lib/domain";
import { AI_REVIEW_LOGS_POLL_MS } from "@/modules/pr-ai-review/lib/domain";
import { hasRunningAiReviewRun } from "@/modules/pr-ai-review/lib/ai-review-ui";

export const AI_REVIEW_IDLE_POLL_MS = 30_000;
export const AI_REVIEW_RUNS_LIMIT = 200;

/** Recent AI review runs for the queue page; polls faster while something is running. */
export function useAiReviewRuns(): {
  runs: PrAiReviewRunDto[];
  refresh: () => Promise<void>;
  markRunning: () => void;
} {
  const [runs, setRuns] = useState<PrAiReviewRunDto[]>([]);
  const [expectRunning, setExpectRunning] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/prs/ai-review/runs?limit=${AI_REVIEW_RUNS_LIMIT}`, { cache: "no-store" });
      if (!response.ok) {
        return;
      }
      const next = (await response.json()) as PrAiReviewRunDto[];
      setRuns(next);
      if (hasRunningAiReviewRun(next)) {
        setExpectRunning(false);
      }
    } catch {
      // Keep the last list on transient errors.
    }
  }, []);

  const running = hasRunningAiReviewRun(runs) || expectRunning;

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), running ? AI_REVIEW_LOGS_POLL_MS : AI_REVIEW_IDLE_POLL_MS);
    return () => window.clearInterval(timer);
  }, [refresh, running]);

  const markRunning = useCallback(() => setExpectRunning(true), []);

  return { runs, refresh, markRunning };
}
