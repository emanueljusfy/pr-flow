"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { ptBR } from "@/modules/messages/pt-BR";
import { pushNotificationInboxItem } from "@/modules/notifications/lib/notification-inbox";
import { playNotificationSound } from "@/modules/notifications/lib/play-notification-sound";
import {
  aiReviewOutcomeLabel,
  aiReviewRunLabel,
  claimAiReviewStartNotification,
  seedAiReviewStartNotifications
} from "@/modules/pr-ai-review/lib/ai-review-ui";
import type { PrAiReviewRunDto } from "@/modules/pr-ai-review/lib/domain";

const POLL_MS = 30_000;
const copy = ptBR.aiReview;

export function notifyAiReviewStarted(run: Pick<PrAiReviewRunDto, "id" | "repository" | "prNumber">): void {
  if (!claimAiReviewStartNotification(run.id)) {
    return;
  }
  const title = copy.alertStarted(aiReviewRunLabel(run));
  pushNotificationInboxItem({ id: `ai-review-start:${run.id}`, title, body: copy.alertStartedBody });
  toast(title, { description: copy.alertStartedBody });
}

function notifyAiReviewFinished(run: PrAiReviewRunDto): void {
  const label = aiReviewRunLabel(run);
  const title =
    run.status === "failed" ? copy.alertFailed(label) : copy.alertFinished(label, aiReviewOutcomeLabel(run));
  const body = run.status === "failed" ? (run.reason ?? copy.statusFailed) : (run.reviewUrl ?? run.prUrl);
  pushNotificationInboxItem({ id: `ai-review:${run.id}`, title, body });
  toast(title, { description: body });
}

/** Start and end toasts for AI reviews, whether the cron or a click started them. */
export function useAiReviewNotifications(): void {
  const seededRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const [unreadRes, runningRes] = await Promise.all([
          fetch("/api/prs/ai-review/runs?unread=1&limit=20", { cache: "no-store" }),
          fetch("/api/prs/ai-review/runs?status=running&limit=20", { cache: "no-store" })
        ]);
        if (!unreadRes.ok || !runningRes.ok || cancelled) {
          return;
        }
        const unread = (await unreadRes.json()) as PrAiReviewRunDto[];
        const running = (await runningRes.json()) as PrAiReviewRunDto[];
        if (cancelled) {
          return;
        }

        if (!seededRef.current) {
          seedAiReviewStartNotifications(running.map((run) => run.id));
          seededRef.current = true;
        } else {
          for (const run of running) {
            notifyAiReviewStarted(run);
          }
        }

        const finished = unread.filter((run) => run.status !== "running");
        if (finished.length === 0) {
          return;
        }
        for (const run of finished) {
          notifyAiReviewFinished(run);
        }
        playNotificationSound();
        await fetch("/api/prs/ai-review/runs/ack", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ runIds: finished.map((run) => run.id) })
        });
      } catch {
        // Ignore transient poll errors.
      }
    }

    void poll();
    const timer = window.setInterval(() => void poll(), POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);
}
