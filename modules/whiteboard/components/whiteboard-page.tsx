"use client";

import dynamic from "next/dynamic";
import { Surface } from "@/components/ui/surface";
import { ptBR } from "@/modules/messages/pt-BR";

const WhiteboardCanvas = dynamic(() => import("./whiteboard-canvas"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-[var(--app-text-muted)]">
      {ptBR.whiteboard.loading}
    </div>
  )
});

export function WhiteboardPage() {
  return (
    <Surface
      aria-label={ptBR.whiteboard.canvasAriaLabel}
      className="pr-flow-whiteboard relative min-h-[480px] flex-1 overflow-hidden p-0"
    >
      <div className="absolute inset-0">
        <WhiteboardCanvas />
      </div>
    </Surface>
  );
}
