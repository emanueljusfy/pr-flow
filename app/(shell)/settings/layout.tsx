import type { ReactNode } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { ptBR } from "@/modules/messages/pt-BR";
import { SettingsTabsNav } from "@/modules/settings/components/settings-tabs-nav";

export default function SettingsLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="app-shell">
      <PageHeader
        title={ptBR.settings.pageTitle}
        description={ptBR.settings.pageDescription}
        className="mb-3"
      />
      <SettingsTabsNav />
      {children}
    </div>
  );
}
