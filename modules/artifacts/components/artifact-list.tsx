"use client";

import { formatDistanceToNow } from "date-fns";
import { ptBR as dateFnsPtBR } from "date-fns/locale";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ArtifactSummaryDto } from "@/modules/artifacts/lib/artifact-client";
import { ptBR } from "@/modules/messages/pt-BR";

const copy = ptBR.artifacts.list;

export type ArtifactListStatus = "loading" | "ready" | "error";

type ArtifactListProps = {
  items: ArtifactSummaryDto[];
  status: ArtifactListStatus;
  query: string;
  selectedId: string | null;
  creating: boolean;
  onQueryChange: (query: string) => void;
  onSelect: (id: string) => void;
  onCreate: () => void;
};

export function ArtifactList({
  items,
  status,
  query,
  selectedId,
  creating,
  onQueryChange,
  onSelect,
  onCreate
}: ArtifactListProps) {
  return (
    <div className="flex min-h-0 w-72 shrink-0 flex-col border-r border-[var(--app-border)]">
      <div className="space-y-2 border-b border-[var(--app-border)] p-3">
        <Button type="button" className="w-full" disabled={creating} onClick={onCreate}>
          <Plus data-icon="inline-start" />
          {copy.newArtifact}
        </Button>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-[var(--app-text-muted)]" />
          <Input
            type="search"
            aria-label={copy.searchLabel}
            placeholder={copy.searchPlaceholder}
            className="pl-8"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
          />
        </div>
      </div>

      <nav aria-label={copy.ariaLabel} className="min-h-0 flex-1 overflow-y-auto p-2">
        {status === "error" ? (
          <p className="px-2 py-3 text-sm text-[var(--app-text-muted)]">{copy.loadError}</p>
        ) : items.length === 0 ? (
          status === "ready" ? (
            <p className="px-2 py-3 text-sm text-[var(--app-text-muted)]">{query.trim() ? copy.noMatch : copy.empty}</p>
          ) : null
        ) : (
          <ul className="space-y-0.5">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  aria-current={item.id === selectedId ? "page" : undefined}
                  onClick={() => onSelect(item.id)}
                  className={cn(
                    "flex w-full min-w-0 flex-col rounded-md px-2.5 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                    item.id === selectedId ? "bg-[var(--app-surface-raised)]" : "hover:bg-[#1f1f1f]"
                  )}
                >
                  <span className="truncate text-sm font-medium text-[var(--app-text)]" title={item.title}>
                    {item.title}
                  </span>
                  <time
                    dateTime={new Date(item.updatedAt).toISOString()}
                    className="text-xs text-[var(--app-text-muted)]"
                  >
                    {formatDistanceToNow(new Date(item.updatedAt), { addSuffix: true, locale: dateFnsPtBR })}
                  </time>
                </button>
              </li>
            ))}
          </ul>
        )}
      </nav>
    </div>
  );
}
