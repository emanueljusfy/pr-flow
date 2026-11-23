"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, GitPullRequest, LayoutDashboard, Settings, Ticket } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem
} from "@/components/ui/sidebar";
import { ptBR } from "@/modules/messages/pt-BR";
import { usePendingReviewCount } from "@/modules/notifications/hooks/use-pending-review-count";
import { SidebarAmbientPanel } from "@/modules/vacation-countdown/components/sidebar-ambient-panel";
import { useGithubLogin } from "@/modules/prs/hooks/use-github-login";
import { SETTINGS_BASE_PATH, SETTINGS_TABS } from "@/modules/settings/lib/settings-tabs";

const navItems = [
  {
    title: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard
  },
  {
    title: "Jira",
    href: "/jira",
    icon: Ticket
  },
  {
    title: "Journal",
    href: "/journal",
    icon: BookOpen
  }
] as const;

function userInitials(login: string) {
  return login.slice(0, 1).toUpperCase();
}

interface AppSidebarProps {
  initialGithubLogin?: string;
}

export function AppSidebar({ initialGithubLogin }: AppSidebarProps) {
  const pathname = usePathname();
  const githubLogin = useGithubLogin(initialGithubLogin);
  const pendingReviewCount = usePendingReviewCount();
  const displayName = githubLogin ?? "Carregando...";

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader className="gap-3 group-data-[collapsible=icon]:gap-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link href="/dashboard" />} tooltip={displayName}>
              <div className="flex aspect-square size-8 shrink-0 items-center justify-center rounded-full bg-[#2a2a2a] text-[var(--app-text)]">
                {githubLogin ? (
                  <span className="text-xs font-semibold tracking-wide">{userInitials(githubLogin)}</span>
                ) : (
                  <GitPullRequest className="size-4" />
                )}
              </div>
              <div className="flex min-w-0 flex-col gap-0.5 leading-none">
                <span className="truncate text-sm font-medium">{displayName}</span>
                <span className="truncate text-[10px] text-[var(--app-text-muted)]">PR Flow</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <SidebarAmbientPanel />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] font-medium uppercase tracking-wider text-[var(--app-text-muted)]">
            Módulos
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    isActive={pathname === item.href || pathname.startsWith(`${item.href}/`)}
                    render={<Link href={item.href} />}
                    tooltip={item.title}
                  >
                    <item.icon />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={pathname === "/prs" || pathname.startsWith("/prs/")}
                  render={<Link href="/prs" />}
                  tooltip="Pull Requests"
                >
                  <GitPullRequest />
                  <span>Pull Requests</span>
                </SidebarMenuButton>
                <SidebarMenuSub>
                  <SidebarMenuSubItem>
                    <SidebarMenuSubButton
                      isActive={pathname === "/prs"}
                      render={<Link href="/prs" />}
                    >
                      Minhas PRs
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                  <SidebarMenuSubItem>
                    <SidebarMenuSubButton
                      isActive={pathname.startsWith("/prs/reviews")}
                      render={<Link href="/prs/reviews" />}
                    >
                      <span className="flex w-full items-center justify-between gap-2">
                        <span>Para revisar</span>
                        {pendingReviewCount > 0 ? (
                          <span
                            className="inline-flex min-w-5 items-center justify-center rounded-full bg-[var(--brand)] px-1.5 py-0.5 text-[10px] font-semibold text-white"
                            aria-label={`${pendingReviewCount} PRs pendentes de revisão`}
                          >
                            {pendingReviewCount}
                          </span>
                        ) : null}
                      </span>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                </SidebarMenuSub>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={
                pathname === SETTINGS_BASE_PATH || pathname.startsWith(`${SETTINGS_BASE_PATH}/`)
              }
              render={<Link href={SETTINGS_TABS[0].href} />}
              tooltip={ptBR.settings.navTooltip}
            >
              <Settings />
              <span>{ptBR.settings.navLabel}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
