"use client";

import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ptBR } from "@/modules/messages/pt-BR";
import { AiReviewStdoutPreview } from "@/modules/pr-ai-review/components/ai-review-stdout-preview";
import { aiReviewOutcomeLabel, aiReviewStatusLabel } from "@/modules/pr-ai-review/lib/ai-review-ui";
import { formatAgentCostUsd } from "@/modules/pr-ai-review/lib/claude-agent-output";
import { AI_REVIEW_LOGS_POLL_MS, type PrAiReviewRunDto } from "@/modules/pr-ai-review/lib/domain";

const copy = ptBR.aiReview;

type AiReviewLogsSheetProps = {
  prUrl: string;
  label: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function runSummary(run: PrAiReviewRunDto): string {
  const parts = [aiReviewStatusLabel(run.status)];
  if (run.status === "succeeded") {
    parts.push(aiReviewOutcomeLabel(run));
  }
  parts.push(new Date(run.startedAt).toLocaleString("pt-BR"));
  parts.push(formatAgentCostUsd(run.costUsd) ?? copy.logsCostUnknown);
  return parts.join(" · ");
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
      <SheetContent side="right" className="flex w-full flex-col data-[side=right]:sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{copy.logsSheetTitle(label)}</SheetTitle>
          <SheetDescription>{copy.logsSheetDescription}</SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-4 pb-4">
          {loadError ? (
            <p className="text-xs text-destructive">{copy.logsLoadFailed}</p>
          ) : runs === null ? null : runs.length === 0 ? (
            <p className="text-xs text-[var(--app-text-muted)]">{copy.logsEmpty}</p>
          ) : (
            <>
              <ul
                className="flex max-h-32 shrink-0 flex-col gap-1 overflow-y-auto"
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
                        className={`w-full rounded-md px-2 py-1.5 text-left text-xs ${
                          isSelected
                            ? "bg-[var(--brand-dim)] text-[var(--app-text)]"
                            : "text-[var(--app-text-muted)] hover:bg-[var(--app-surface-inset)]"
                        }`}
                        onClick={() => setSelectedId(run.id)}
                      >
                        {runSummary(run)}
                      </button>
                    </li>
                  );
                })}
              </ul>
              {selected ? (
                <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
                  <p className="flex shrink-0 flex-wrap items-center gap-x-2 text-xs text-[var(--app-text-muted)]">
                    <span className="font-medium text-[var(--app-text)]">{aiReviewOutcomeLabel(selected)}</span>
                    {selected.reason ? <span>{selected.reason}</span> : null}
                    {selected.slackReaction ? <span>{copy.slackReaction[selected.slackReaction]}</span> : null}
                    {selected.reviewUrl ? (
                      <a
                        className="inline-flex items-center gap-1 text-[var(--app-link)] hover:underline"
                        href={selected.reviewUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {copy.logsOpenReview}
                        <ExternalLink className="size-3" aria-hidden />
                      </a>
                    ) : null}
                  </p>
                  <div className="flex min-h-0 flex-1 flex-col">
                    <h3 className="mb-1 shrink-0 text-xs font-semibold text-[var(--app-text)]">{copy.logsStdoutLabel}</h3>
                    <AiReviewStdoutPreview markdown={selected.stdout ?? ""} emptyLabel={copy.logsStdoutEmpty} />
                  </div>
                  <div className="shrink-0">
                    <h3 className="mb-1 text-xs font-semibold text-[var(--app-text)]">{copy.logsStderrLabel}</h3>
                    <pre
                      data-testid="ai-review-stderr"
                      className="max-h-28 overflow-auto rounded-md border border-[var(--app-border)] bg-[var(--app-surface-inset)] p-2 font-mono text-[11px] whitespace-pre-wrap text-[var(--app-text)]"
                    >
                      {selected.stderr && selected.stderr.length > 0 ? selected.stderr : copy.logsStderrEmpty}
                    </pre>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
