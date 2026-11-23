import { describe, expect, it } from "vitest";
import { buildDayCalendarTimeline } from "@/modules/day-calendar/lib/day-calendar-timeline";

function event(uid: string, startsAt: string, endsAt: string, allDay = false) {
  return { uid, title: uid, startsAt, endsAt, allDay, location: null };
}

const events = [
  event("late", "2026-07-30T18:00:00.000Z", "2026-07-30T19:00:00.000Z"),
  event("daily", "2026-07-30T13:00:00.000Z", "2026-07-30T13:15:00.000Z"),
  event("holiday", "2026-07-30T00:00:00.000Z", "2026-07-31T00:00:00.000Z", true),
  event("focus", "2026-07-30T14:00:00.000Z", "2026-07-30T16:00:00.000Z"),
  event("sync", "2026-07-30T16:30:00.000Z", "2026-07-30T17:00:00.000Z")
];

describe("buildDayCalendarTimeline", () => {
  it("puts all-day events first and sorts timed events by start", () => {
    const timeline = buildDayCalendarTimeline(events, new Date("2026-07-30T12:00:00.000Z"));
    expect(timeline.map((entry) => entry.event.uid)).toEqual([
      "holiday",
      "daily",
      "focus",
      "sync",
      "late"
    ]);
  });

  it("marks past, current and only the first upcoming event as next", () => {
    const timeline = buildDayCalendarTimeline(events, new Date("2026-07-30T15:00:00.000Z"));
    expect(Object.fromEntries(timeline.map((entry) => [entry.event.uid, entry.phase]))).toEqual({
      holiday: "all_day",
      daily: "past",
      focus: "now",
      sync: "next",
      late: "later"
    });
  });

  it("treats an event ending exactly now as past and starting exactly now as current", () => {
    const timeline = buildDayCalendarTimeline(events, new Date("2026-07-30T16:00:00.000Z"));
    const phases = Object.fromEntries(timeline.map((entry) => [entry.event.uid, entry.phase]));
    expect(phases.focus).toBe("past");
    expect(phases.sync).toBe("next");

    const atStart = buildDayCalendarTimeline(events, new Date("2026-07-30T16:30:00.000Z"));
    expect(atStart.find((entry) => entry.event.uid === "sync")?.phase).toBe("now");
  });

  it("highlights nothing before the clock is known", () => {
    const timeline = buildDayCalendarTimeline(events, null);
    expect(timeline.filter((entry) => !entry.event.allDay).every((e) => e.phase === "later")).toBe(
      true
    );
  });
});
