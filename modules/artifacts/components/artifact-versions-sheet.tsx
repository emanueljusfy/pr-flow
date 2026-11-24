"use client";

import { formatDistanceToNow } from "date-fns";
import { ptBR as dateFnsPtBR } from "date-fns/locale";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  fetchVersion,
  fetchVersions,
  postRestore,
  type ArtifactVersionDto,
  type ArtifactVersionSummaryDto
} from "@/modules/artifacts/lib/artifact-client";
import { ptBR } from "@/modules/messages/pt-BR";

const copy = ptBR.artifacts.versions;

function authorLabel(version: Pick<ArtifactVersionSummaryDto, "source" | "restoredFrom">): string {
  if (version.source === "agent") {
    return copy.agent;
  }
  if (version.source === "restore") {
    return version.restoredFrom === null ? copy.user : copy.restoredFrom(version.restoredFrom);
  }
  return copy.user;
}

type Props = {
  artifactId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The document changed on the server: reload it. */
  onRestored: () => Promise<void>;
};

export function ArtifactVersionsSheet({ artifactId, open, onOpenChange, onRestored }: Props) {
  const [versions, setVersions] = useState<ArtifactVersionSummaryDto[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [preview, setPreview] = useState<ArtifactVersionDto | null>(null);
  const [previewTabId, setPreviewTabId] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    let cancelled = false;
    fetchVersions(artifactId)
      .then((list) => {
        if (!cancelled) {
          setVersions(list);
          setFailed(false);
          setPreview(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [artifactId, open]);

  async function choose(number: number) {
    try {
      const version = await fetchVersion(artifactId, number);
      setPreview(version);
      setPreviewTabId(version.tabs[0]?.id ?? null);
    } catch {
      toast.error(copy.loadError);
    }
  }

  async function restore() {
    if (!preview) {
      return;
    }
    setRestoring(true);
    try {
      await postRestore(artifactId, preview.number);
      await onRestored();
      toast.success(copy.restored);
      onOpenChange(false);
    } catch {
      toast.error(copy.restoreError);
    } finally {
      setRestoring(false);
    }
  }

  const previewTab = preview?.tabs.find((tab) => tab.id === previewTabId) ?? null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-3xl">
        <SheetHeader className="border-b border-[var(--app-border)]">
          <SheetTitle>{copy.title}</SheetTitle>
          <SheetDescription>{copy.description}</SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-1">
          <div className="w-64 shrink-0 overflow-y-auto border-r border-[var(--app-border)] p-2">
            {failed ? <p className="p-2 text-sm text-[var(--app-text-muted)]">{copy.loadError}</p> : null}
            <ul className="space-y-0.5">
              {versions?.map((version) => (
                <li key={version.number}>
                  <button
                    type="button"
                    aria-current={preview?.number === version.number ? "true" : undefined}
                    onClick={() => void choose(version.number)}
                    className={cn(
                      "flex w-full flex-col rounded-md px-2.5 py-2 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                      preview?.number === version.number ? "bg-[var(--app-surface-raised)]" : "hover:bg-[#1f1f1f]"
                    )}
                  >
                    <span className="font-medium text-[var(--app-text)]">
                      {copy.label(version.number)} · {authorLabel(version)}
                    </span>
                    <span className="text-xs text-[var(--app-text-muted)]">
                      {formatDistanceToNow(new Date(version.updatedAt), { addSuffix: true, locale: dateFnsPtBR })} ·{" "}
                      {copy.tabCount(version.tabCount)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            {preview ? (
              <>
                <div className="flex items-center justify-between gap-2 border-b border-[var(--app-border)] p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[var(--app-text)]">{preview.title}</p>
                    <p className="text-xs text-[var(--app-text-muted)]">{copy.readOnly}</p>
                  </div>
                  <Button type="button" size="sm" disabled={restoring} onClick={() => void restore()}>
                    {copy.restore}
                  </Button>
                </div>
                <div className="flex min-h-0 flex-1">
                  <ul
                    aria-label={copy.previewTabs}
                    className="w-40 shrink-0 space-y-0.5 overflow-y-auto border-r border-[var(--app-border)] p-2"
                  >
                    {preview.tabs.map((tab) => (
                      <li key={tab.id}>
                        <button
                          type="button"
                          title={tab.title}
                          aria-current={tab.id === previewTabId ? "true" : undefined}
                          onClick={() => setPreviewTabId(tab.id)}
                          className={cn(
                            "w-full truncate rounded-md px-2 py-1 text-left text-sm",
                            tab.id === previewTabId ? "bg-[var(--app-surface-raised)]" : "hover:bg-[#1f1f1f]"
                          )}
                        >
                          {tab.title}
                        </button>
                      </li>
                    ))}
                  </ul>
                  <div
                    className="prose prose-sm dark:prose-invert min-w-0 max-w-none flex-1 overflow-auto p-4"
                    data-testid="version-preview"
                  >
                    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
                      {previewTab?.content ?? ""}
                    </ReactMarkdown>
                  </div>
                </div>
              </>
            ) : (
              <p className="p-4 text-sm text-[var(--app-text-muted)]">{copy.pick}</p>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
