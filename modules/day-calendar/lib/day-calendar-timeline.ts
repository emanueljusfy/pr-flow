import type { z } from "zod";
import type { dayCalendarEventSchema } from "@/modules/day-calendar/lib/day-calendar-validation";

type DayCalendarEvent = z.infer<typeof dayCalendarEventSchema>;

export type DayCalendarEventPhase = "all_day" | "past" | "now" | "next" | "later";

export type DayCalendarTimelineEntry = {
  event: DayCalendarEvent;
  phase: DayCalendarEventPhase;
};

/**
 * Tags each event with where it sits relative to `now`: all-day events first,
 * then timed events in start order. Only the first upcoming event is "next".
 * Without a clock (`now === null`, before mount) every timed event is "later".
 */
export function buildDayCalendarTimeline(
  events: readonly DayCalendarEvent[],
  now: Date | null
): DayCalendarTimelineEntry[] {
  const allDay = events.filter((event) => event.allDay);
  const timed = events
    .filter((event) => !event.allDay)
    .slice()
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));

  let nextAssigned = false;
  const timedEntries = timed.map((event): DayCalendarTimelineEntry => {
    if (now === null) {
      return { event, phase: "later" };
    }
    const nowMs = now.getTime();
    const start = Date.parse(event.startsAt);
    const end = Date.parse(event.endsAt);

    if (end <= nowMs) {
      return { event, phase: "past" };
    }
    if (start <= nowMs) {
      return { event, phase: "now" };
    }
    if (!nextAssigned) {
      nextAssigned = true;
      return { event, phase: "next" };
    }
    return { event, phase: "later" };
  });

  return [...allDay.map((event) => ({ event, phase: "all_day" as const })), ...timedEntries];
}

export function formatDayCalendarStartTime(startsAt: string, timeZone: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(startsAt));
}
