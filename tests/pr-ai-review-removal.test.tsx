import fs from "node:fs";
import path from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { CRON_JOB_SCHEDULE_SPECS } from "@/modules/cron-scheduling/lib/schedules";
import { CRON_JOB_DEFINITIONS } from "@/modules/devtools/lib/cron-job-definitions";

vi.mock("next/navigation", () => ({ usePathname: () => "/prs/reviews" }));
vi.mock("@/modules/prs/hooks/use-github-login", () => ({ useGithubLogin: () => "dev" }));
vi.mock("@/modules/vacation-countdown/components/sidebar-ambient-panel", () => ({ SidebarAmbientPanel: () => null }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/modules/notifications/hooks/use-app-notifications", () => ({
  useAppNotifications: () => ({ permission: "default", requestPermission: vi.fn() })
}));

const root = process.cwd();

describe("routines removal", () => {
  it("routines module is gone", () => {
    expect(fs.existsSync(path.join(root, "app/(shell)/routines"))).toBe(false);
    expect(fs.existsSync(path.join(root, "app/api/routines"))).toBe(false);
    expect(fs.existsSync(path.join(root, "modules/routines"))).toBe(false);

    const ids = CRON_JOB_SCHEDULE_SPECS.map((spec) => spec.id as string);
    expect(ids).not.toContain("cron:routines");
    expect(ids).toContain("cron:pr-ai-review");
    expect(CRON_JOB_DEFINITIONS.map((job) => job.id as string)).toContain("cron:pr-ai-review");
    expect(CRON_JOB_DEFINITIONS.map((job) => job.id as string)).not.toContain("cron:routines");

    render(
      <SidebarProvider>
        <AppSidebar />
      </SidebarProvider>
    );
    expect(screen.queryByRole("link", { name: /Rotinas/i })).not.toBeInTheDocument();
    expect(document.querySelector('a[href="/routines"]')).toBeNull();
  });
});
