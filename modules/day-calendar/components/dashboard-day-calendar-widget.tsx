"use client";

import { CalendarDays, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HelpHint } from "@/components/ui/help-hint";
import { Skeleton } from "@/components/ui/skeleton";
import { Surface } from "@/components/ui/surface";
import { useNow } from "@/hooks/use-now";
import { cn } from "@/lib/utils";
import { useDayCalendar } from "@/modules/day-calendar/hooks/use-day-calendar";
import { formatDayCalendarTimeRange } from "@/modules/day-calendar/lib/day-calendar-labels";
import {
  buildDayCalendarTimeline,
  formatDayCalendarStartTime
} from "@/modules/day-calendar/lib/day-calendar-timeline";
import { ptBR } from "@/modules/messages/pt-BR";

export function DashboardDayCalendarWidget() {
  const { data, isLoading, error, refresh } = useDayCalendar();

  const events = data?.status === "ok" ? data.events : [];
  const timeZone = data?.status === "ok" ? data.timeZone : "America/Sao_Paulo";
  const missingConfig = data?.status === "missing_config";
  const now = useNow();
  const timeline = buildDayCalendarTimeline(events, now);

  return (
    <Surface className="flex min-w-0 flex-col space-y-4 p-4" data-testid="dashboard-day-calendar-widget">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-[var(--brand-border)] bg-[var(--brand-dim)] text-[var(--brand-bright)]">
            <CalendarDays className="size-4" aria-hidden />
          </span>
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="text-sm font-semibold text-[var(--app-text)]">
              {ptBR.dayCalendar.widgetTitle}
            </h2>
            <HelpHint>{ptBR.dayCalendar.widgetHelp}</HelpHint>
          </div>
        </div>
        {isLoading ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
        ) : null}
      </div>

      {isLoading ? (
        <ul className="space-y-2" aria-label={ptBR.dayCalendar.loading}>
          {Array.from({ length: 3 }, (_, index) => (
            <li key={index} className="panel-inset space-y-2 px-3 py-2.5">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-24" />
            </li>
          ))}
        </ul>
      ) : null}

      {!isLoading && error ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-destructive">{error}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => void refresh()}>
            {ptBR.dayCalendar.retry}
          </Button>
        </div>
      ) : null}

      {!isLoading && !error && missingConfig ? (
        <p className="text-sm text-[var(--app-text-muted)]">{data.message}</p>
      ) : null}

      {!isLoading && !error && !missingConfig && events.length === 0 ? (
        <p className="text-sm text-[var(--app-text-muted)]">{ptBR.dayCalendar.noEvents}</p>
      ) : null}

      {!isLoading && !error && events.length > 0 ? (
        <ol className="relative min-h-0 space-y-1" aria-label={ptBR.dayCalendar.listAriaLabel}>
          <span
            className="absolute top-2 bottom-2 left-[calc(3rem+0.375rem+0.5rem)] w-px bg-[var(--app-border)]"
            aria-hidden
          />
          {timeline.map(({ event, phase }) => {
            const isNow = phase === "now";
            const isNext = phase === "next";

            return (
              <li
                key={event.uid}
                data-phase={phase}
                className={cn(
                  "relative grid grid-cols-[3rem_1rem_minmax(0,1fr)] items-start gap-x-1.5 rounded-lg py-2 pr-2",
                  isNow && "bg-[var(--brand-dim)]",
                  phase === "past" && "opacity-50"
                )}
              >
                <span className="pt-px text-right text-xs font-medium tabular-nums text-[var(--app-text-muted)]">
                  {event.allDay
                    ? ptBR.dayCalendar.allDayShort
                    : formatDayCalendarStartTime(event.startsAt, timeZone)}
                </span>
                <span className="flex justify-center pt-1" aria-hidden>
                  <span
                    className={cn(
                      "relative size-2 rounded-full border",
                      isNow
                        ? "border-[var(--brand-bright)] bg-[var(--brand-bright)]"
                        : isNext
                          ? "border-[var(--app-text)] bg-[var(--app-surface-raised)]"
                          : "border-[var(--app-border-strong)] bg-[var(--app-surface-raised)]"
                    )}
                  />
                </span>
                <div className="min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium leading-snug text-[var(--app-text)]">
                      {event.title}
                    </p>
                    {isNow || isNext ? (
                      <span
                        className={cn(
                          "shrink-0 rounded-full border px-1.5 py-px text-[10px] font-medium uppercase tracking-wide",
                          isNow
                            ? "border-[var(--brand-border)] text-[var(--brand-bright)]"
                            : "border-[var(--app-border-strong)] text-[var(--app-text-muted)]"
                        )}
                      >
                        {isNow ? ptBR.dayCalendar.nowBadge : ptBR.dayCalendar.nextBadge}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-xs text-[var(--app-text-muted)]">
                    {formatDayCalendarTimeRange(
                      event.startsAt,
                      event.endsAt,
                      event.allDay,
                      timeZone
                    )}
                    {event.location ? <span> · {event.location}</span> : null}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      ) : null}
    </Surface>
  );
}
