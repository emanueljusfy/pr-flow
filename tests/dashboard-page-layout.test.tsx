import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DashboardPage } from "@/modules/dashboard/components/dashboard-page";

vi.mock("@/modules/dashboard/components/dashboard-greeting", () => ({
  DashboardGreeting: () => <div data-testid="greeting" />
}));
vi.mock("@/modules/dashboard/components/dashboard-hub", () => ({
  DashboardHub: () => <div data-testid="hub" />
}));
vi.mock("@/modules/dashboard/components/dashboard-briefing-widget", () => ({
  DashboardBriefingWidget: () => <div data-testid="briefing" />
}));
vi.mock("@/modules/day-calendar/components/dashboard-day-calendar-widget", () => ({
  DashboardDayCalendarWidget: () => <div data-testid="calendar" />
}));
vi.mock("@/modules/journal/components/dashboard-journal-streak-widget", () => ({
  DashboardJournalStreakWidget: () => <div data-testid="streak" />
}));
vi.mock("@/modules/vacation-countdown/components/dashboard-vacation-widget", () => ({
  DashboardVacationWidget: () => <div data-testid="vacation" />
}));
vi.mock("@/modules/shortcut-deck/components/dashboard-shortcut-deck", () => ({
  DashboardShortcutDeck: () => <div data-testid="deck" />
}));

describe("DashboardPage layout", () => {
  it("keeps work widgets in the main column and personal widgets in the side rail", () => {
    render(<DashboardPage />);

    expect(screen.getByTestId("greeting")).toBeInTheDocument();

    const main = screen.getByRole("region", { name: "Trabalho do dia" });
    expect(within(main).getByTestId("hub")).toBeInTheDocument();
    expect(within(main).getByTestId("briefing")).toBeInTheDocument();

    const rail = screen.getByRole("complementary", { name: "Seu dia" });
    for (const id of ["calendar", "streak", "vacation", "deck"]) {
      expect(within(rail).getByTestId(id)).toBeInTheDocument();
    }
  });
});
