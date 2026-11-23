"use client";

import { useState } from "react";
import { Bot, ExternalLink, GitPullRequest, Loader2 } from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger
} from "@/components/ui/context-menu";
import { ptBR } from "@/modules/messages/pt-BR";
import { AiReviewBadgeButton, useAiReviewActions } from "@/modules/pr-ai-review/components/ai-review-card-actions";
import { AiReviewLogsSheet } from "@/modules/pr-ai-review/components/ai-review-logs-sheet";
import type { PrAiReviewRunDto } from "@/modules/pr-ai-review/lib/domain";
import type { ReviewerQueuePr } from "@/modules/prs/lib/domain";
import { myReviewStatusLabel } from "@/modules/prs/lib/core/my-review-status";
import {
  reviewQueueCardClass,
  reviewQueueStatusPillClass
} from "@/modules/prs/lib/review-queue-status";
import { cn } from "@/lib/utils";

const copy = ptBR.aiReview;

interface Props {
  pr: ReviewerQueuePr;
  aiRuns?: PrAiReviewRunDto[];
  aiBusy?: boolean;
  onAiRunStarted?: () => void;
  /** `compact` renders a single dense row (list view). */
  variant?: "card" | "compact";
}

function formatRepository(repository: string): string {
  const slashIndex = repository.lastIndexOf("/");
  if (slashIndex === -1) {
    return repository;
  }
  return repository.slice(slashIndex + 1);
}

export function PrReviewerQueueItem({
  pr,
  aiRuns = [],
  aiBusy = false,
  onAiRunStarted = () => {},
  variant = "card"
}: Props) {
  const [logsOpen, setLogsOpen] = useState(false);
  const repo = formatRepository(pr.repository);
  const label = `${repo}#${pr.number}`;
  const ai = useAiReviewActions({
    prUrl: pr.url,
    label,
    headSha: pr.headSha,
    runs: aiRuns,
    busy: aiBusy,
    onRunStarted: onAiRunStarted
  });
  const compact = variant === "compact";

  const repoLine = (
    <p className="review-queue-card__repo">
      <GitPullRequest className="size-3.5 shrink-0" aria-hidden />
      <span>{repo}</span>
      <span className="review-queue-card__number">#{pr.number}</span>
    </p>
  );
  const statusPill = (
    <span className={cn("review-queue-card__status", reviewQueueStatusPillClass(pr.myReviewStatus))}>
      {myReviewStatusLabel(pr.myReviewStatus)}
    </span>
  );
  const badge = <AiReviewBadgeButton badge={ai.badge} label={label} onOpenLogs={() => setLogsOpen(true)} />;
  const linkProps = {
    href: pr.url,
    rel: "noreferrer",
    target: "_blank",
    "aria-label": `Abrir PR #${pr.number}: ${pr.title}`
  };

  return (
    <li>
      <ContextMenu>
        <ContextMenuTrigger
          render={
            <article
              className={cn(
                "review-queue-card panel",
                compact && "review-queue-card--compact",
                reviewQueueCardClass(pr.myReviewStatus)
              )}
            />
          }
        >
          {compact ? (
            <div className="review-queue-row">
              <a className="review-queue-row__link" {...linkProps}>
                {repoLine}
                <span className="review-queue-row__title">{pr.title}</span>
              </a>
              {badge}
              {statusPill}
            </div>
          ) : (
            <>
              <a className="review-queue-card__main" {...linkProps}>
                <header className="review-queue-card__header">
                  {repoLine}
                  {statusPill}
                </header>
                <h3 className="review-queue-card__title">{pr.title}</h3>
              </a>
              {ai.badge.kind !== "none" ? <div className="review-queue-card__ai">{badge}</div> : null}
            </>
          )}
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onClick={() => window.open(pr.url, "_blank", "noopener,noreferrer")}>
            <ExternalLink aria-hidden />
            {copy.openOnGitHub}
          </ContextMenuItem>
          <ContextMenuItem
            disabled={!ai.canStart}
            aria-label={copy.reviewWithAiAria(label)}
            onClick={() => void ai.start()}
          >
            {ai.starting ? <Loader2 aria-hidden className="animate-spin" /> : <Bot aria-hidden />}
            {copy.reviewWithAi}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      <AiReviewLogsSheet prUrl={pr.url} label={label} open={logsOpen} onOpenChange={setLogsOpen} />
    </li>
  );
}
