"use client";

import dynamic from "next/dynamic";
import { ptBR } from "@/modules/messages/pt-BR";

/** The editor is browser-only: BlockNote touches `document` on import. */
export const ArtifactEditorLoader = dynamic(() => import("./artifact-editor"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-[var(--app-text-muted)]">
      {ptBR.artifacts.editor.loading}
    </div>
  )
});
