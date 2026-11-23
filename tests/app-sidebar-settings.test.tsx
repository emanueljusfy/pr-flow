import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { SidebarProvider } from "@/components/ui/sidebar";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard"
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

describe("AppSidebar settings footer", () => {
  it("links a single Configurações entry instead of Alertas and Devtools items", () => {
    render(
      <SidebarProvider>
        <AppSidebar />
      </SidebarProvider>
    );

    expect(screen.getByRole("link", { name: /^configurações$/i })).toHaveAttribute(
      "href",
      "/settings/alerts"
    );
    expect(screen.queryByText("Devtools")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /configurar alertas/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^crons$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^repositórios$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^ambiente local$/i })).not.toBeInTheDocument();
  });
});
