"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Surface } from "@/components/ui/surface";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { ptBR } from "@/modules/messages/pt-BR";
import { AiReviewStdoutPreview } from "@/modules/pr-ai-review/components/ai-review-stdout-preview";
import {
  AI_REVIEW_BADGE_CLASS,
  aiReviewOutcomeLabel,
  aiReviewRunBadgeKind,
  aiReviewStatusLabel,
  formatAiReviewDuration
} from "@/modules/pr-ai-review/lib/ai-review-ui";
import { formatAgentCostUsd } from "@/modules/pr-ai-review/lib/claude-agent-output";
import { AI_REVIEW_LOGS_POLL_MS, type PrAiReviewRunDto } from "@/modules/pr-ai-review/lib/domain";

const copy = ptBR.aiReview;

type AiReviewLogsSheetProps = {
  prUrl: string;
  label: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type OutputTab = "stdout" | "stderr";

function formatFullDate(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR");
}

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function runCost(run: PrAiReviewRunDto): string {
  return formatAgentCostUsd(run.costUsd) ?? copy.logsCostUnknown;
}

function runDuration(run: PrAiReviewRunDto): string {
  if (run.status === "running") {
    return copy.logsDurationRunning;
  }
  return formatAiReviewDuration(run.startedAt, run.finishedAt) ?? copy.logsDurationRunning;
}

/** Accessible name of a run option: status · outcome · date · cost. */
function runSummary(run: PrAiReviewRunDto): string {
  const parts = [aiReviewStatusLabel(run.status)];
  if (run.status === "succeeded") {
    parts.push(aiReviewOutcomeLabel(run));
  }
  parts.push(formatFullDate(run.startedAt));
  parts.push(runCost(run));
  return parts.join(" · ");
}

function hasText(value: string | null): value is string {
  return value !== null && value.trim().length > 0;
}

function commitUrl(run: PrAiReviewRunDto): string {
  return `https://github.com/${run.repository}/commit/${run.headSha}`;
}

function RunPill({ run }: { run: PrAiReviewRunDto }) {
  const kind = aiReviewRunBadgeKind(run);
  return (
    <span className={cn("review-queue-card__ai-badge shrink-0", kind !== "none" && AI_REVIEW_BADGE_CLASS[kind])}>
      {kind === "running" ? <Loader2 className="size-3 animate-spin" aria-hidden /> : null}
      {aiReviewOutcomeLabel(run)}
    </span>
  );
}

function DetailItem({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-[11px] text-[var(--app-text-muted)]">{term}</dt>
      <dd className="truncate text-xs text-[var(--app-text)]">{children}</dd>
    </div>
  );
}

function RunDetails({ run }: { run: PrAiReviewRunDto }) {
  const stdout = run.stdout ?? "";
  const hasStderr = hasText(run.stderr);
  const initialTab: OutputTab = !hasText(stdout) && hasStderr ? "stderr" : "stdout";

  return (
    <div className="flex flex-col gap-4">
      <Surface className="flex flex-col gap-4 p-4" aria-label={copy.logsDetailsHeading}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <RunPill run={run} />
            <span className="text-xs text-[var(--app-text-muted)]">{aiReviewStatusLabel(run.status)}</span>
          </div>
          {run.reviewUrl ? (
            <a
              className={buttonVariants({ variant: "outline", size: "sm" })}
              href={run.reviewUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {copy.logsOpenReview}
              <ExternalLink aria-hidden />
            </a>
          ) : null}
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
          <DetailItem term={copy.logsStartedAt}>{formatFullDate(run.startedAt)}</DetailItem>
          <DetailItem term={copy.logsDuration}>{runDuration(run)}</DetailItem>
          <DetailItem term={copy.logsCost}>
            <span className="tabular-nums">{runCost(run)}</span>
          </DetailItem>
          <DetailItem term={copy.logsCommit}>
            <a
              className="font-mono text-[var(--app-link)] hover:underline"
              href={commitUrl(run)}
              target="_blank"
              rel="noopener noreferrer"
            >
              {run.headSha.slice(0, 7)}
            </a>
          </DetailItem>
          <DetailItem term={copy.logsTrigger}>{copy.logsTriggerLabel[run.trigger]}</DetailItem>
          {run.slackReaction ? (
            <DetailItem term={copy.logsSlack}>{copy.slackReaction[run.slackReaction]}</DetailItem>
          ) : null}
        </dl>
        {run.reason ? (
          <p className="rounded-md border border-[var(--app-border)] bg-[var(--app-surface-inset)] px-3 py-2 text-xs text-[var(--app-text-soft)]">
            <span className="font-medium text-[var(--app-text)]">{copy.logsReason}: </span>
            {run.reason}
          </p>
        ) : null}
      </Surface>

      <Tabs key={run.id} defaultValue={initialTab}>
        <TabsList variant="line">
          <TabsTrigger value="stdout">{copy.logsStdoutLabel}</TabsTrigger>
          <TabsTrigger value="stderr">
            {copy.logsStderrLabel}
            {hasStderr ? (
              <>
                <span className="size-1.5 rounded-full bg-[#f1cf7b]" aria-hidden />
                <span className="sr-only">({copy.logsStderrHasContent})</span>
              </>
            ) : null}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="stdout" className="pt-1">
          <AiReviewStdoutPreview markdown={stdout} emptyLabel={copy.logsStdoutEmpty} />
        </TabsContent>
        <TabsContent value="stderr" className="pt-1">
          <pre
            data-testid="ai-review-stderr"
            className="overflow-x-auto rounded-md border border-[var(--app-border)] bg-[var(--app-surface-inset)] p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-[var(--app-text-soft)]"
          >
            {hasStderr ? run.stderr : copy.logsStderrEmpty}
          </pre>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export function AiReviewLogsSheet({ prUrl, label, open, onOpenChange }: AiReviewLogsSheetProps) {
  const [runs, setRuns] = useState<PrAiReviewRunDto[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);

  const selected = runs?.find((run) => run.id === selectedId) ?? null;
  const needsPoll = open && (runs ?? []).some((run) => run.status === "running");

  useEffect(() => {
    if (!open) {
      return;
    }
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch(
          `/api/prs/ai-review/runs?prUrl=${encodeURIComponent(prUrl)}&limit=20`,
          { cache: "no-store" }
        );
        if (!response.ok) {
          throw new Error("load failed");
        }
        const next = (await response.json()) as PrAiReviewRunDto[];
        if (cancelled) {
          return;
        }
        setLoadError(false);
        setRuns(next);
        setSelectedId((current) => (current && next.some((run) => run.id === current) ? current : (next[0]?.id ?? null)));
      } catch {
        if (!cancelled) {
          setLoadError(true);
        }
      }
    }

    void load();
    if (!needsPoll) {
      return () => {
        cancelled = true;
      };
    }
    const timer = window.setInterval(() => void load(), AI_REVIEW_LOGS_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [open, prUrl, needsPoll]);

  useEffect(() => {
    if (!open) {
      setRuns(null);
      setSelectedId(null);
      setLoadError(false);
    }
  }, [open]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 data-[side=right]:sm:max-w-2xl">
        <SheetHeader className="border-b border-[var(--app-border)] pr-12">
          <SheetTitle className="font-semibold">{copy.logsSheetTitle(label)}</SheetTitle>
          <SheetDescription className="text-xs">{copy.logsSheetDescription}</SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          {loadError ? (
            <p className="text-xs text-destructive">{copy.logsLoadFailed}</p>
          ) : runs === null ? (
            <div className="flex flex-col gap-1.5" aria-hidden>
              {[0, 1, 2].map((index) => (
                <div key={index} className="h-9 animate-pulse rounded-md bg-[var(--app-surface-inset)]" />
              ))}
            </div>
          ) : runs.length === 0 ? (
            <Surface variant="dashed" className="px-4 py-6 text-center text-xs text-[var(--app-text-muted)]">
              {copy.logsEmpty}
            </Surface>
          ) : (
            <>
              <section className="flex shrink-0 flex-col gap-2">
                <h3 className="text-xs font-medium text-[var(--app-text-muted)]">{copy.logsRunsHeading(runs.length)}</h3>
                <ul
                  className="flex max-h-48 flex-col gap-1 overflow-y-auto"
                  role="listbox"
                  aria-label={copy.logsSheetTitle(label)}
                >
                  {runs.map((run) => {
                    const isSelected = run.id === selectedId;
                    return (
                      <li key={run.id}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          aria-label={runSummary(run)}
                          className={cn(
                            "grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 rounded-md border px-3 py-2 text-left text-xs transition-colors",
                            isSelected
                              ? "border-[var(--brand-border)] bg-[var(--brand-dim)]"
                              : "border-transparent hover:bg-[var(--app-surface-inset)]"
                          )}
                          onClick={() => setSelectedId(run.id)}
                        >
                          <RunPill run={run} />
                          <span className="truncate text-[var(--app-text-soft)]">
                            {formatShortDate(run.startedAt)}
                            <span className="text-[var(--app-text-muted)]"> · {runDuration(run)}</span>
                          </span>
                          <span className="text-[var(--app-text-muted)] tabular-nums">{runCost(run)}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
              {selected ? <RunDetails run={selected} /> : null}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
