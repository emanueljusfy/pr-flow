"use client";

import { Clipboard, History, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Surface } from "@/components/ui/surface";
import { ArtifactEditorLoader } from "@/modules/artifacts/components/artifact-editor-loader";
import { ArtifactTabList } from "@/modules/artifacts/components/artifact-tab-list";
import { ArtifactVersionsSheet } from "@/modules/artifacts/components/artifact-versions-sheet";
import { useArtifactDocument } from "@/modules/artifacts/hooks/use-artifact-document";
import type { ArtifactEventPayload } from "@/modules/artifacts/lib/artifact-validation";
import { ptBR } from "@/modules/messages/pt-BR";

const copy = ptBR.artifacts.document;

export type ArtifactEventHandlers = {
  onEvent: (event: ArtifactEventPayload) => void;
  onReconnect: () => void;
};

type ArtifactDocumentProps = {
  artifactId: string;
  /** `?tab=` of the URL. */
  tabParam: string | null;
  /** The artifact was just created: put the cursor in its title. */
  autoFocusTitle: boolean;
  onSelectTab: (tabId: string) => void;
  onLeave: () => void;
  /** Lets the page forward server events to this document. */
  registerEvents: (handlers: ArtifactEventHandlers | null) => void;
  /** The artifact's title or tabs changed through this page: refresh the list. */
  onChanged: () => void;
};

export function ArtifactDocument({
  artifactId,
  tabParam,
  autoFocusTitle,
  onSelectTab,
  onLeave,
  registerEvents,
  onChanged
}: ArtifactDocumentProps) {
  const doc = useArtifactDocument(artifactId, tabParam, { selectTab: onSelectTab, leave: onLeave });
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const titleInput = useRef<HTMLInputElement>(null);
  const focused = useRef(false);

  const { handleEvent, handleReconnect } = doc;
  useEffect(() => {
    registerEvents({ onEvent: handleEvent, onReconnect: handleReconnect });
    return () => registerEvents(null);
  }, [handleEvent, handleReconnect, registerEvents]);

  useEffect(() => {
    if (doc.loadStatus === "ready" && autoFocusTitle && !focused.current) {
      focused.current = true;
      titleInput.current?.focus();
      titleInput.current?.select();
    }
  }, [autoFocusTitle, doc.loadStatus]);

  // The list shows titles and times: refresh it once each time a save lands.
  const { saveStatus } = doc;
  const previousSaveStatus = useRef(saveStatus);
  useEffect(() => {
    if (saveStatus === "saved" && previousSaveStatus.current !== "saved") {
      onChanged();
    }
    previousSaveStatus.current = saveStatus;
  }, [onChanged, saveStatus]);

  if (doc.loadStatus === "loading") {
    return <p className="p-6 text-sm text-[var(--app-text-muted)]">{copy.loading}</p>;
  }
  if (doc.loadStatus === "notFound") {
    return (
      <div className="flex flex-1 flex-col items-start gap-3 p-6">
        <p className="text-sm font-medium text-[var(--app-text)]">{copy.notFound}</p>
        <Link href="/artifacts" className="text-sm text-[var(--app-link)] underline-offset-2 hover:underline">
          {copy.backToList}
        </Link>
      </div>
    );
  }
  if (doc.loadStatus === "error") {
    return (
      <div className="flex flex-1 flex-col items-start gap-3 p-6">
        <p className="text-sm text-[var(--app-text-muted)]">{copy.loadError}</p>
        <Button type="button" variant="outline" size="sm" onClick={doc.retryLoad}>
          {copy.retry}
        </Button>
      </div>
    );
  }

  const selectedTab = doc.tabs.find((tab) => tab.id === doc.selectedTabId);

  async function copyMarkdown() {
    try {
      await navigator.clipboard.writeText(doc.currentMarkdown());
      toast.success(copy.copied);
    } catch {
      toast.error(copy.copyError);
    }
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--app-border)] p-3">
        <Input
          ref={titleInput}
          aria-label={copy.titleLabel}
          className="h-9 min-w-48 flex-1 text-base font-semibold"
          value={doc.title}
          onChange={(event) => doc.setTitle(event.target.value)}
        />
        <div
          role="status"
          aria-live="polite"
          className="flex min-w-24 items-center gap-2 text-xs text-[var(--app-text-muted)]"
        >
          {doc.saveStatus === "saving" ? copy.saving : null}
          {doc.saveStatus === "saved" ? copy.saved : null}
          {doc.saveStatus === "error" ? (
            <>
              <span className="text-[var(--app-text)]">{copy.notSaved}</span>
              <Button type="button" variant="outline" size="xs" onClick={doc.retrySave}>
                {copy.retrySave}
              </Button>
            </>
          ) : null}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void copyMarkdown()}>
          <Clipboard data-icon="inline-start" />
          {copy.copyMarkdown}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => setVersionsOpen(true)}>
          <History data-icon="inline-start" />
          {copy.versions}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => setConfirmDelete(true)}>
          <Trash2 data-icon="inline-start" />
          {copy.deleteArtifact}
        </Button>
      </div>

      <div className="flex min-h-0 flex-1">
        <ArtifactTabList
          tabs={doc.tabs}
          selectedTabId={doc.selectedTabId}
          renameRequestTabId={doc.renameRequestTabId}
          onRenameRequestHandled={doc.clearRenameRequest}
          onSelect={(tabId) => void doc.selectTab(tabId)}
          onAdd={() => void doc.addTab()}
          onRename={(tabId, title) => void doc.renameTab(tabId, title)}
          onDelete={(tabId) => void doc.deleteTab(tabId)}
          onReorder={(tabIds) => void doc.reorderTabs(tabIds)}
        />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {doc.sync.status === "conflict" ? (
            <Surface variant="inset" role="alert" className="m-3 flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
              <span className="flex-1 text-[var(--app-text)]">{ptBR.artifacts.banner.message}</span>
              <Button type="button" variant="outline" size="sm" onClick={doc.reloadFromServer}>
                {ptBR.artifacts.banner.reload}
              </Button>
              <Button type="button" size="sm" onClick={doc.keepMine}>
                {ptBR.artifacts.banner.keepMine}
              </Button>
            </Surface>
          ) : null}
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            <ArtifactEditorLoader
              markdown={doc.editor.markdown}
              loadKey={doc.editor.loadKey}
              ariaLabel={copy.editorLabel(selectedTab?.title ?? "")}
              onMarkdownChange={doc.onEditorChange}
            />
          </div>
        </div>
      </div>

      <ArtifactVersionsSheet
        artifactId={artifactId}
        open={versionsOpen}
        onOpenChange={setVersionsOpen}
        onRestored={async () => {
          await doc.refresh();
          onChanged();
        }}
      />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{copy.deleteArtifactTitle}</AlertDialogTitle>
            <AlertDialogDescription>{copy.deleteArtifactBody(doc.title)}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{copy.cancel}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setConfirmDelete(false);
                void doc.deleteArtifact();
              }}
            >
              {copy.confirmDelete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
