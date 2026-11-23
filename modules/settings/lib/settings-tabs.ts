import { ptBR } from "@/modules/messages/pt-BR";

const copy = ptBR.settings;

export const SETTINGS_BASE_PATH = "/settings";

export const SETTINGS_TABS = [
  { href: "/settings/alerts", label: copy.tabAlerts },
  { href: "/settings/crons", label: copy.tabCrons },
  { href: "/settings/repositories", label: copy.tabRepositories },
  { href: "/settings/local-docker", label: copy.tabLocalDocker }
] as const;

export type SettingsTabHref = (typeof SETTINGS_TABS)[number]["href"];

export const DEFAULT_SETTINGS_TAB: SettingsTabHref = SETTINGS_TABS[0].href;

export function activeSettingsTab(pathname: string): SettingsTabHref | null {
  const match = SETTINGS_TABS.find(
    (tab) => pathname === tab.href || pathname.startsWith(`${tab.href}/`)
  );
  return match?.href ?? null;
}
