"use client";

import { DashboardBriefingWidget } from "@/modules/dashboard/components/dashboard-briefing-widget";
import { DashboardGreeting } from "@/modules/dashboard/components/dashboard-greeting";
import { DashboardHub } from "@/modules/dashboard/components/dashboard-hub";
import { DashboardDayCalendarWidget } from "@/modules/day-calendar/components/dashboard-day-calendar-widget";
import { DashboardJournalStreakWidget } from "@/modules/journal/components/dashboard-journal-streak-widget";
import { ptBR } from "@/modules/messages/pt-BR";
import { DashboardShortcutDeck } from "@/modules/shortcut-deck/components/dashboard-shortcut-deck";
import { DashboardVacationWidget } from "@/modules/vacation-countdown/components/dashboard-vacation-widget";

export function DashboardPage() {
  return (
    <div className="space-y-6">
      <DashboardGreeting />

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(19rem,24rem)]">
        <div
          className="flex min-w-0 flex-col gap-4"
          role="region"
          aria-label={ptBR.dashboard.mainColumnAriaLabel}
          data-testid="dashboard-main-column"
        >
          <DashboardHub />
          <DashboardBriefingWidget />
        </div>

        <aside
          className="flex min-w-0 flex-col gap-4"
          aria-label={ptBR.dashboard.sideRailAriaLabel}
          data-testid="dashboard-side-rail"
        >
          <DashboardDayCalendarWidget />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
            <DashboardJournalStreakWidget />
            <DashboardVacationWidget />
          </div>
          <DashboardShortcutDeck />
        </aside>
      </div>
    </div>
  );
}
