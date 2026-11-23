"use client";

import { useState } from "react";
import { Bot, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ptBR } from "@/modules/messages/pt-BR";
import {
  AI_REVIEW_BADGE_CLASS,
  aiReviewBadgeFor,
  type AiReviewBadge
} from "@/modules/pr-ai-review/lib/ai-review-ui";
import type { PrAiReviewRunDto } from "@/modules/pr-ai-review/lib/domain";
import { cn } from "@/lib/utils";

const copy = ptBR.aiReview;

type UseAiReviewActionsArgs = {
  prUrl: string;
  label: string;
  headSha: string | undefined;
  runs: PrAiReviewRunDto[];
  /** True when any AI review is running (one at a time, app-wide). */
  busy: boolean;
  onRunStarted: () => void;
};

export function useAiReviewActions({ prUrl, label, headSha, runs, busy, onRunStarted }: UseAiReviewActionsArgs) {
  const [starting, setStarting] = useState(false);
  const badge = aiReviewBadgeFor(runs, prUrl, headSha);
  const canStart = badge.kind !== "running" && !busy && !starting;

  async function start() {
    if (!canStart) {
      return;
    }
    setStarting(true);
    try {
      const response = await fetch("/api/prs/ai-review/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prUrl })
      });
      const body = (await response.json()) as { prUrls?: string[]; error?: string };
      if (!response.ok) {
        toast.error(body.error ?? copy.runFailed);
        return;
      }
      toast(copy.alertStarted(label), { description: copy.alertStartedBody });
      onRunStarted();
    } catch {
      toast.error(copy.runFailed);
    } finally {
      setStarting(false);
    }
  }

  return { badge, starting, canStart, start };
}

type AiReviewBadgeButtonProps = {
  badge: AiReviewBadge;
  label: string;
  onOpenLogs: () => void;
};

/** The AI status pill; clicking it opens the run logs. Renders nothing when the PR has no AI review. */
export function AiReviewBadgeButton({ badge, label, onOpenLogs }: AiReviewBadgeButtonProps) {
  if (badge.kind === "none" || !badge.label) {
    return null;
  }
  return (
    <button
      type="button"
      className={cn("review-queue-card__ai-badge", AI_REVIEW_BADGE_CLASS[badge.kind])}
      data-testid="ai-review-badge"
      aria-label={copy.badgeLogsAria(badge.label, label)}
      title={copy.logsAria(label)}
      onClick={(event) => {
        event.stopPropagation();
        onOpenLogs();
      }}
    >
      {badge.kind === "running" ? (
        <Loader2 className="size-3 animate-spin" aria-hidden />
      ) : (
        <Bot className="size-3" aria-hidden />
      )}
      {badge.label}
    </button>
  );
}
