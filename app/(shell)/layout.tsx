import type { ReactNode } from "react";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppNotificationProvider } from "@/modules/notifications/components/app-notification-provider";
import { NotificationBell } from "@/modules/notifications/components/notification-bell";
import { QuickNoteDialog } from "@/components/quick-note/quick-note-dialog";
import { VacationCountdownBootstrap } from "@/modules/vacation-countdown/components/vacation-setup-dialog";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { getGithubLogin } from "@/modules/app/lib/github-login-repository";

export default async function ShellLayout({ children }: Readonly<{ children: ReactNode }>) {
  let initialGithubLogin: string | undefined;
  try {
    initialGithubLogin = (await getGithubLogin()) ?? undefined;
  } catch {
    // Sidebar falls back to client fetch / "Carregando..." when DB is unavailable.
  }

  return (
    <SidebarProvider className="bg-[var(--app-bg-top)]">
      <AppSidebar initialGithubLogin={initialGithubLogin} />
      <SidebarInset className="overflow-hidden bg-[var(--app-surface)] md:peer-data-[variant=inset]:m-3 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:rounded-2xl md:peer-data-[variant=inset]:peer-data-[state=collapsed]:ml-3">
        <header className="flex h-11 shrink-0 items-center gap-3 border-b border-[var(--app-border)] px-4">
          <SidebarTrigger className="-ml-1" />
          <NotificationBell />
          <span className="hidden text-sm font-medium tracking-tight text-[var(--app-text)] sm:inline">
            PR <span className="text-[var(--brand)]">Flow</span>
          </span>
          <span className="hidden text-xs text-[var(--app-text-muted)] md:inline">
            Cockpit local
          </span>
        </header>
        <div className="flex min-h-0 flex-1 flex-col overflow-auto">{children}</div>
      </SidebarInset>
      <QuickNoteDialog />
      <VacationCountdownBootstrap />
      <AppNotificationProvider />
    </SidebarProvider>
  );
}
