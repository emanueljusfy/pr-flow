"use client";

import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { ptBR as dateFnsPtBR } from "date-fns/locale";
import type { LucideIcon } from "lucide-react";
import {
  AlertCircle,
  Check,
  CircleX,
  ExternalLink,
  GitCommitHorizontal,
  GitMerge,
  GitPullRequest,
  Loader2,
  MessageSquare,
  RefreshCw,
  RotateCcw,
  X
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { ptBR } from "@/modules/messages/pt-BR";
import { PrHistoryDetailMarkdown } from "@/modules/prs/components/pr-history-detail-markdown";
import { prHistoryDetailVisibleText } from "@/modules/prs/lib/core/pr-history-detail-text";
import { formatPrHistoryEventSummary } from "@/modules/prs/lib/core/pr-history-labels";
import {
  getPrHistoryEventVisual,
  type PrHistoryEventIcon
} from "@/modules/prs/lib/core/pr-history-visual";
import type { MonitoredPr, PrHistoryApiResponse, PrHistoryEvent } from "@/modules/prs/lib/domain";
import { cn } from "@/lib/utils";

type Props = {
  pr: MonitoredPr | null;
  onClose: () => void;
};

type PanelData = {
  prKey: string;
  events: PrHistoryEvent[];
};

const copy = ptBR.prHistory;
const DETAIL_PREVIEW_MAX_LENGTH = 160;
const DETAIL_ACCORDION_VALUE = "detail";

const HISTORY_ICONS: Record<PrHistoryEventIcon, LucideIcon> = {
  "git-pull-request": GitPullRequest,
  "message-square": MessageSquare,
  "git-commit-horizontal": GitCommitHorizontal,
  check: Check,
  "alert-circle": AlertCircle,
  "git-merge": GitMerge,
  "circle-x": CircleX,
  "rotate-ccw": RotateCcw
};

function prKeyOf(repository: string, number: number): string {
  return `${repository}#${number}`;
}

function formatEventTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return format(date, "d MMM yyyy, HH:mm", { locale: dateFnsPtBR });
}

function PrHistoryEventDetail({ detail }: { detail: string }) {
  const [openValues, setOpenValues] = useState<string[]>([]);
  const isOpen = openValues.includes(DETAIL_ACCORDION_VALUE);

  if (prHistoryDetailVisibleText(detail).length <= DETAIL_PREVIEW_MAX_LENGTH) {
    return <PrHistoryDetailMarkdown className="pr-history-timeline__detail" markdown={detail} />;
  }

  return (
    <Accordion
      className="pr-history-timeline__detail-accordion"
      value={openValues}
      onValueChange={setOpenValues}
    >
      <AccordionItem
        value={DETAIL_ACCORDION_VALUE}
        className="pr-history-timeline__detail-accordion-item"
      >
        {!isOpen ? (
          <PrHistoryDetailMarkdown
            className="pr-history-timeline__detail pr-history-timeline__detail--clamped"
            markdown={detail}
          />
        ) : null}
        <AccordionTrigger className="pr-history-timeline__detail-trigger">
          {isOpen ? copy.collapseDetail : copy.expandDetail}
        </AccordionTrigger>
        <AccordionContent className="pr-history-timeline__detail-content">
          <PrHistoryDetailMarkdown
            className="pr-history-timeline__detail pr-history-timeline__detail--expanded"
            markdown={detail}
          />
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

function PrHistoryTimelineItem({ event }: { event: PrHistoryEvent }) {
  const summary = formatPrHistoryEventSummary(event);
  const timeLabel = formatEventTime(event.occurredAt);
  const visual = getPrHistoryEventVisual(event);
  const Icon = HISTORY_ICONS[visual.icon];

  return (
    <li className="pr-history-timeline__item" data-tone={visual.tone}>
      <span
        aria-hidden
        className={cn(
          "pr-history-timeline__marker",
          `pr-history-timeline__marker--tone-${visual.tone}`
        )}
        data-testid={`pr-history-marker-${visual.tone}`}
      >
        <Icon className="pr-history-timeline__marker-icon" />
      </span>
      <div className="pr-history-timeline__body">
        <div className="pr-history-timeline__row">
          <p className="pr-history-timeline__summary">{summary}</p>
          <div className="pr-history-timeline__meta">
            {timeLabel ? <time dateTime={event.occurredAt}>{timeLabel}</time> : null}
            {event.url ? (
              <a
                aria-label={copy.eventLinkAriaLabel}
                className="pr-history-timeline__link"
                href={event.url}
                rel="noreferrer"
                target="_blank"
              >
                <ExternalLink className="size-3.5" aria-hidden />
              </a>
            ) : null}
          </div>
        </div>
        {event.detail ? <PrHistoryEventDetail detail={event.detail} /> : null}
      </div>
    </li>
  );
}

export function PrHistoryPanel({ pr, onClose }: Props) {
  const repository = pr?.repository ?? null;
  const number = pr?.number ?? null;
  const prKey = repository !== null && number !== null ? prKeyOf(repository, number) : null;

  const [data, setData] = useState<PanelData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const requestIdRef = useRef(0);

  const shownEvents = prKey && data?.prKey === prKey ? data.events : null;
  const hasContent = shownEvents !== null;

  useEffect(() => {
    if (!prKey || repository === null || number === null) {
      setData(null);
      setError(null);
      setIsFetching(false);
      return;
    }

    const controller = new AbortController();
    const requestId = ++requestIdRef.current;
    setIsFetching(true);
    setError(null);

    const params = new URLSearchParams({
      repository,
      number: String(number)
    });

    void (async () => {
      try {
        const response = await fetch(`/api/prs/history?${params.toString()}`, {
          method: "GET",
          cache: "no-store",
          signal: controller.signal
        });
        const json = (await response.json()) as PrHistoryApiResponse;
        if (controller.signal.aborted || requestId !== requestIdRef.current) {
          return;
        }
        if (json.status !== "ok") {
          setError(json.message || copy.loadFailed);
          setIsFetching(false);
          return;
        }
        setData({ prKey, events: json.data.events });
        setError(null);
        setIsFetching(false);
      } catch (caught) {
        if (controller.signal.aborted || requestId !== requestIdRef.current) {
          return;
        }
        const message = caught instanceof Error ? caught.message : copy.loadFailed;
        setError(message);
        setIsFetching(false);
      }
    })();

    return () => controller.abort();
  }, [prKey, repository, number, reloadToken]);

  return (
    <aside
      aria-busy={isFetching || undefined}
      aria-label={copy.panelTitle}
      className="panel pr-history-panel flex min-h-0 flex-col"
    >
      <header className="pr-history-panel__header flex items-start justify-between gap-2 border-b border-[var(--app-border)] pb-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-[var(--app-text)]">{copy.panelTitle}</h2>
          {pr ? (
            <p className="mt-1 truncate text-xs text-[var(--app-text-muted)]">
              #{pr.number} · {pr.title}
            </p>
          ) : null}
        </div>
        {pr ? (
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={isFetching ? copy.refreshingAriaLabel : copy.refreshAriaLabel}
              className="size-8"
              disabled={isFetching}
              onClick={() => setReloadToken((value) => value + 1)}
            >
              {isFetching ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <RefreshCw className="size-4" aria-hidden />
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={copy.closeAriaLabel}
              className="size-8"
              onClick={onClose}
            >
              <X className="size-4" aria-hidden />
            </Button>
          </div>
        ) : null}
      </header>

      <div
        className={cn(
          "pr-history-panel__body min-h-0 flex-1 overflow-y-auto pt-3",
          isFetching && hasContent && "opacity-70"
        )}
      >
        {!pr ? <p className="small muted px-1">{copy.emptySelection}</p> : null}

        {pr && !hasContent && isFetching ? (
          <div className="flex items-center gap-2 px-1 text-sm text-[var(--app-text-muted)]">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {copy.loading}
          </div>
        ) : null}

        {pr && !hasContent && !isFetching && error ? (
          <div className="space-y-3 px-1">
            <p className="small muted">{error}</p>
            <Button type="button" variant="outline" size="sm" onClick={() => setReloadToken((value) => value + 1)}>
              {copy.retry}
            </Button>
          </div>
        ) : null}

        {pr && hasContent ? (
          <>
            {error ? <p className="small muted mb-3 px-1">{error}</p> : null}
            <ol aria-label={copy.timelineAriaLabel} className="pr-history-timeline">
              {shownEvents.map((event) => (
                <PrHistoryTimelineItem key={event.id} event={event} />
              ))}
            </ol>
          </>
        ) : null}
      </div>
    </aside>
  );
}
