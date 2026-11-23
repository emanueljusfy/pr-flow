"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ptBR } from "@/modules/messages/pt-BR";
import { SETTINGS_TABS, activeSettingsTab } from "@/modules/settings/lib/settings-tabs";

export function SettingsTabsNav() {
  const pathname = usePathname();
  const active = activeSettingsTab(pathname);

  return (
    <Tabs value={active} className="mb-5">
      <TabsList
        variant="line"
        aria-label={ptBR.settings.tabsAriaLabel}
        className="w-full justify-start gap-4 border-b border-[var(--app-border)] pb-1"
      >
        {SETTINGS_TABS.map((tab) => (
          <TabsTrigger
            key={tab.href}
            value={tab.href}
            nativeButton={false}
            render={<Link href={tab.href} />}
            className="flex-none px-0.5 group-data-[variant=line]/tabs-list:data-active:after:bg-[var(--brand)]"
          >
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
