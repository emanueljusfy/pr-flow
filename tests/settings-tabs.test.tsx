import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SettingsTabsNav } from "@/modules/settings/components/settings-tabs-nav";
import { activeSettingsTab } from "@/modules/settings/lib/settings-tabs";

const pathname = vi.hoisted(() => ({ current: "/settings/crons" }));

vi.mock("next/navigation", () => ({
  usePathname: () => pathname.current
}));

describe("SettingsTabsNav", () => {
  it("renders one tab link per settings section and marks the current one", () => {
    render(<SettingsTabsNav />);

    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      "Alertas",
      "Crons",
      "Repositórios",
      "Ambiente local"
    ]);
    expect(tabs.map((tab) => tab.getAttribute("href"))).toEqual([
      "/settings/alerts",
      "/settings/crons",
      "/settings/repositories",
      "/settings/local-docker"
    ]);
    expect(screen.getByRole("tab", { name: "Crons" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Alertas" })).toHaveAttribute("aria-selected", "false");
  });
});

describe("activeSettingsTab", () => {
  it("matches nested paths and ignores unknown ones", () => {
    expect(activeSettingsTab("/settings/repositories")).toBe("/settings/repositories");
    expect(activeSettingsTab("/settings/local-docker/extra")).toBe("/settings/local-docker");
    expect(activeSettingsTab("/settings")).toBeNull();
    expect(activeSettingsTab("/settings/alertsx")).toBeNull();
  });
});

