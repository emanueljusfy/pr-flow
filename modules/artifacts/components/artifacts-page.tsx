"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Surface } from "@/components/ui/surface";
import { ArtifactDocument, type ArtifactEventHandlers } from "@/modules/artifacts/components/artifact-document";
import { ArtifactList, type ArtifactListStatus } from "@/modules/artifacts/components/artifact-list";
import { useArtifactEvents } from "@/modules/artifacts/hooks/use-artifact-events";
import { fetchArtifactList, postArtifact, type ArtifactSummaryDto } from "@/modules/artifacts/lib/artifact-client";
import { ptBR } from "@/modules/messages/pt-BR";

const SEARCH_DEBOUNCE_MS = 250;

export function ArtifactsPage({ artifactId }: { artifactId: string | null }) {
  const router = useRouter();
  const tabParam = useSearchParams().get("tab");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<ArtifactSummaryDto[]>([]);
  const [status, setStatus] = useState<ArtifactListStatus>("loading");
  const [creating, setCreating] = useState(false);
  const queryRef = useRef("");
  const documentEvents = useRef<ArtifactEventHandlers | null>(null);
  const [focusTitleId, setFocusTitleId] = useState<string | null>(null);

  const refreshList = useCallback(async () => {
    try {
      const next = await fetchArtifactList(queryRef.current);
      setItems(next);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    queryRef.current = query;
    const timer = setTimeout(() => void refreshList(), query === "" ? 0 : SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, refreshList]);

  useArtifactEvents({
    onEvent: (event) => {
      void refreshList();
      documentEvents.current?.onEvent(event);
    },
    onReconnect: () => {
      void refreshList();
      documentEvents.current?.onReconnect();
    }
  });

  const registerEvents = useCallback((handlers: ArtifactEventHandlers | null) => {
    documentEvents.current = handlers;
  }, []);

  const openArtifact = useCallback((id: string) => router.push(`/artifacts/${id}`), [router]);
  const selectTab = useCallback(
    (tabId: string) => router.push(`/artifacts/${artifactId}?tab=${tabId}`),
    [artifactId, router]
  );
  const leave = useCallback(() => {
    router.push("/artifacts");
    void refreshList();
  }, [refreshList, router]);

  const onDocumentChanged = useCallback(() => void refreshList(), [refreshList]);

  async function create() {
    setCreating(true);
    try {
      const artifact = await postArtifact(ptBR.artifacts.defaultArtifactTitle);
      setFocusTitleId(artifact.id);
      setQuery("");
      queryRef.current = "";
      router.push(`/artifacts/${artifact.id}?tab=${artifact.tabs[0]?.id ?? ""}`);
      await refreshList();
    } catch {
      toast.error(ptBR.artifacts.list.createError);
    } finally {
      setCreating(false);
    }
  }

  return (
    <Surface className="flex min-h-[480px] min-w-0 flex-1 overflow-hidden p-0">
      <ArtifactList
        items={items}
        status={status}
        query={query}
        selectedId={artifactId}
        creating={creating}
        onQueryChange={setQuery}
        onSelect={openArtifact}
        onCreate={() => void create()}
      />
      {artifactId ? (
        <ArtifactDocument
          key={artifactId}
          artifactId={artifactId}
          tabParam={tabParam}
          autoFocusTitle={focusTitleId === artifactId}
          onSelectTab={selectTab}
          onLeave={leave}
          registerEvents={registerEvents}
          onChanged={onDocumentChanged}
        />
      ) : (
        <div className="flex min-w-0 flex-1 items-center justify-center p-6">
          <Surface variant="dashed" className="max-w-sm space-y-1 p-6 text-center">
            <p className="text-sm font-medium text-[var(--app-text)]">{ptBR.artifacts.emptyMain.title}</p>
            <p className="text-sm text-[var(--app-text-muted)]">{ptBR.artifacts.emptyMain.body}</p>
          </Surface>
        </div>
      )}
    </Surface>
  );
}
