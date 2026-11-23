import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DashboardGreeting } from "@/modules/dashboard/components/dashboard-greeting";
import {
  formatDashboardDateline,
  greetingForHour
} from "@/modules/dashboard/lib/dashboard-greeting";

describe("greetingForHour", () => {
  it.each([
    [4, "Boa noite"],
    [5, "Bom dia"],
    [11, "Bom dia"],
    [12, "Boa tarde"],
    [17, "Boa tarde"],
    [18, "Boa noite"],
    [23, "Boa noite"]
  ])("hour %i → %s", (hour, expected) => {
    expect(greetingForHour(hour)).toBe(expected);
  });
});

describe("formatDashboardDateline", () => {
  it("capitalizes the pt-BR weekday", () => {
    expect(formatDashboardDateline(new Date(2026, 10, 23, 10))).toBe("Segunda-feira, 23 de novembro");
  });
});

describe("DashboardGreeting", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders greeting and dateline for the current time", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 23, 14, 30));

    render(<DashboardGreeting />);

    expect(screen.getByTestId("dashboard-greeting")).toHaveTextContent("Boa tarde");
    expect(screen.getByTestId("dashboard-greeting")).toHaveTextContent("Segunda-feira, 23 de novembro");
  });
});
