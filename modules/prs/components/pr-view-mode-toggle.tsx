"use client";

import { LayoutGrid, Rows3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ptBR } from "@/modules/messages/pt-BR";
import type { PrViewMode } from "@/modules/prs/lib/pr-view-mode-storage";

interface Props {
  value: PrViewMode;
  onChange: (mode: PrViewMode) => void;
}

export function PrViewModeToggle({ value, onChange }: Props) {
  const copy = ptBR.prViewMode;

  return (
    <div aria-label={copy.groupAriaLabel} className="pr-view-mode-toggle" role="group">
      <Button
        aria-label={copy.cardsAriaLabel}
        aria-pressed={value === "cards"}
        onClick={() => onChange("cards")}
        size="sm"
        type="button"
        variant={value === "cards" ? "secondary" : "ghost"}
      >
        <LayoutGrid className="size-4" aria-hidden />
        {copy.cards}
      </Button>
      <Button
        aria-label={copy.compactAriaLabel}
        aria-pressed={value === "compact"}
        onClick={() => onChange("compact")}
        size="sm"
        type="button"
        variant={value === "compact" ? "secondary" : "ghost"}
      >
        <Rows3 className="size-4" aria-hidden />
        {copy.compact}
      </Button>
    </div>
  );
}
