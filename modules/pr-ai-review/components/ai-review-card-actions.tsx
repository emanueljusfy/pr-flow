"use client";

import { useState } from "react";
import { Bot, Loader2, ScrollText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ptBR } from "@/modules/messages/pt-BR";
import { AiReviewLogsSheet } from "@/modules/pr-ai-review/components/ai-review-logs-sheet";
import { AI_REVIEW_BADGE_CLASS, aiReviewBadgeFor } from "@/modules/pr-ai-review/lib/ai-review-ui";
import type { PrAiReviewRunDto } from "@/modules/pr-ai-review/lib/domain";
import { cn } from "@/lib/utils";

const copy = ptBR.aiReview;

type AiReviewCardActionsProps = {
  prUrl: string;
  label: string;
  headSha: string | undefined;
  runs: PrAiReviewRunDto[];
  /** True when any AI review is running (one at a time, app-wide). */
  busy: boolean;
  onRunStarted: () => void;
};

export function AiReviewCardActions({ prUrl, label, headSha, runs, busy, onRunStarted }: AiReviewCardActionsProps) {
  const [logsOpen, setLogsOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const badge = aiReviewBadgeFor(runs, prUrl, headSha);
  const running = badge.kind === "running";

  async function reviewWithAi() {
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

  return (
    <div className="review-queue-card__ai">
      {badge.kind !== "none" ? (
        <span className={cn("review-queue-card__ai-badge", AI_REVIEW_BADGE_CLASS[badge.kind])} data-testid="ai-review-badge">
          {running ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <Bot className="size-3" aria-hidden />}
          {badge.label}
        </span>
      ) : null}
      <div className="ml-auto flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={running || busy || starting}
          aria-label={copy.reviewWithAiAria(label)}
          onClick={() => void reviewWithAi()}
        >
          {starting ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Bot className="size-3.5" aria-hidden />}
          {copy.reviewWithAi}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={copy.logsAria(label)}
          onClick={() => setLogsOpen(true)}
        >
          {running ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ScrollText className="size-4" aria-hidden />}
        </Button>
      </div>
      <AiReviewLogsSheet prUrl={prUrl} label={label} open={logsOpen} onOpenChange={setLogsOpen} />
    </div>
  );
}
