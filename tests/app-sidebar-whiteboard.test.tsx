import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { SidebarProvider } from "@/components/ui/sidebar";

vi.mock("next/navigation", () => ({
  usePathname: () => "/whiteboard"
}));

vi.mock("@/modules/prs/hooks/use-github-login", () => ({
  useGithubLogin: () => "dev"
}));

vi.mock("@/modules/vacation-countdown/components/sidebar-ambient-panel", () => ({
  SidebarAmbientPanel: () => null
}));

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => false
}));

describe("AppSidebar whiteboard navigation", () => {
  it("shows the Quadro entry linking to /whiteboard", () => {
    render(
      <SidebarProvider>
        <AppSidebar />
      </SidebarProvider>
    );

    const link = screen.getByRole("link", { name: /^quadro$/i });
    expect(link).toHaveAttribute("href", "/whiteboard");
  });
});
