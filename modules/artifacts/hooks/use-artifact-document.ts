"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArtifactRequestError,
  fetchArtifact,
  patchArtifactTitle,
  postTab,
  putTab,
  putTabOrder,
  removeArtifact,
  removeTab,
  type ArtifactDetailDto,
  type ArtifactTabDto
} from "@/modules/artifacts/lib/artifact-client";
import {
  INITIAL_TAB_SYNC,
  reduceTabSync,
  type TabSyncAction,
  type TabSyncState
} from "@/modules/artifacts/lib/artifact-sync";
import type { ArtifactEventPayload } from "@/modules/artifacts/lib/artifact-validation";
import { ptBR } from "@/modules/messages/pt-BR";

/** A task result meaning "nothing failed, nothing was saved": the tab is waiting on the user's choice. */
const NOT_SAVED = Symbol("not-saved");

/** How long the user must stop typing before a save (AC 33). */
export const ARTIFACT_AUTOSAVE_MS = 1000;

export type SaveStatus = "idle" | "saving" | "saved" | "error";
export type DocumentLoadStatus = "loading" | "ready" | "notFound" | "error";

export type TabMeta = { id: string; title: string; position: number };

type Navigation = {
  /** Put `tabId` in `?tab=`. */
  selectTab: (tabId: string) => void;
  /** Leave the artifact (deleted here or elsewhere). */
  leave: () => void;
};

export type ArtifactDocumentApi = {
  loadStatus: DocumentLoadStatus;
  title: string;
  tabs: TabMeta[];
  selectedTabId: string | null;
  /** Markdown the editor shows and the key that tells it to replace its document. */
  editor: { markdown: string; loadKey: string };
  sync: TabSyncState;
  saveStatus: SaveStatus;
  /** A tab just created whose name should open in edit mode. */
  renameRequestTabId: string | null;
  setTitle: (title: string) => void;
  onEditorChange: (markdown: string) => void;
  selectTab: (tabId: string) => Promise<void>;
  addTab: () => Promise<void>;
  renameTab: (tabId: string, title: string) => Promise<void>;
  deleteTab: (tabId: string) => Promise<void>;
  reorderTabs: (tabIds: string[]) => Promise<void>;
  deleteArtifact: () => Promise<void>;
  currentMarkdown: () => string;
  reloadFromServer: () => void;
  keepMine: () => void;
  retrySave: () => void;
  retryLoad: () => void;
  /** Reloads after a restore. */
  refresh: () => Promise<void>;
  handleEvent: (event: ArtifactEventPayload) => void;
  handleReconnect: () => void;
  clearRenameRequest: () => void;
};

/** Everything the open artifact needs: load, selection, autosave, and following the server. */
export function useArtifactDocument(
  artifactId: string,
  tabParam: string | null,
  navigation: Navigation
): ArtifactDocumentApi {
  const [loadStatus, setLoadStatus] = useState<DocumentLoadStatus>("loading");
  const [title, setTitleState] = useState("");
  const [tabs, setTabs] = useState<TabMeta[]>([]);
  const [selectedTabId, setSelectedTabId] = useState<string | null>(null);
  const [editor, setEditor] = useState({ markdown: "", loadKey: "none" });
  const [sync, setSync] = useState<TabSyncState>(INITIAL_TAB_SYNC);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [renameRequestTabId, setRenameRequestTabId] = useState<string | null>(null);

  const navigationRef = useRef(navigation);
  const serverTabs = useRef<ArtifactDetailDto["tabs"]>([]);
  const selectedRef = useRef<string | null>(null);
  const syncRef = useRef<TabSyncState>(INITIAL_TAB_SYNC);
  const draftRef = useRef<string | null>(null);
  const loadCounter = useRef(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingTitle = useRef<string | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const inFlight = useRef(0);
  const retryAction = useRef<(() => void) | null>(null);
  const alive = useRef(true);
  /** Functions that call each other or themselves (retries); read through the ref to break the cycle. */
  const later = useRef<{
    scheduleSave: () => void;
    retrySave: () => void;
    retryTitle: (title: string) => void;
    retryRename: (tabId: string, title: string) => void;
  }>({ scheduleSave: () => {}, retrySave: () => {}, retryTitle: () => {}, retryRename: () => {} });

  useEffect(() => {
    navigationRef.current = navigation;
  });

  const dispatch = useCallback((action: TabSyncAction) => {
    syncRef.current = reduceTabSync(syncRef.current, action);
    setSync(syncRef.current);
  }, []);

  const enqueue = useCallback(<T>(task: () => Promise<T>): Promise<T> => {
    const run = queue.current.then(task, task);
    queue.current = run.catch(() => undefined);
    return run;
  }, []);

  /** Tracks a write for the "Salvando… / Salvo / Não salvo" indicator. */
  const tracked = useCallback(
    async <T>(task: () => Promise<T | typeof NOT_SAVED>, retry: () => void): Promise<T | undefined> => {
      inFlight.current += 1;
      setSaveStatus("saving");
      try {
        const result = await task();
        retryAction.current = null;
        inFlight.current -= 1;
        if (inFlight.current === 0) {
          setSaveStatus(result === NOT_SAVED ? "idle" : "saved");
        }
        return result === NOT_SAVED ? undefined : result;
      } catch {
        retryAction.current = retry;
        inFlight.current -= 1;
        setSaveStatus("error");
        return undefined;
      }
    },
    []
  );

  const selectedServerTab = useCallback(
    () => serverTabs.current.find((tab) => tab.id === selectedRef.current) ?? null,
    []
  );

  const showTab = useCallback((tab: ArtifactTabDto) => {
    selectedRef.current = tab.id;
    setSelectedTabId(tab.id);
    draftRef.current = null;
    loadCounter.current += 1;
    setEditor({ markdown: tab.content, loadKey: `${tab.id}:${loadCounter.current}` });
  }, []);

  const syncTabMeta = useCallback((artifact: Pick<ArtifactDetailDto, "tabs">) => {
    setTabs(artifact.tabs.map(({ id, title: tabTitle, position }) => ({ id, title: tabTitle, position })));
  }, []);

  /** Takes the server's document and decides what it means for the selected tab (AD-018). */
  const applyServer = useCallback(
    (next: ArtifactDetailDto, touchedByEvent: ReadonlySet<string>, initial: boolean, preferredTab?: string | null) => {
      const previous = serverTabs.current;
      serverTabs.current = next.tabs;
      syncTabMeta(next);
      if (pendingTitle.current === null) {
        setTitleState(next.title);
      }

      if (initial) {
        const first = next.tabs[0];
        const wanted = next.tabs.find((tab) => tab.id === (preferredTab ?? null)) ?? first;
        if (wanted) {
          showTab(wanted);
          syncRef.current = INITIAL_TAB_SYNC;
          dispatch({ type: "loaded" });
        }
        return;
      }

      const selected = selectedRef.current;
      const current = next.tabs.find((tab) => tab.id === selected);
      if (!current) {
        toast(ptBR.artifacts.toasts.tabDeleted);
        const first = next.tabs[0];
        dispatch({ type: "remoteTabDeleted" });
        if (first) {
          showTab(first);
          navigationRef.current.selectTab(first.id);
          dispatch({ type: "loaded" });
        }
        return;
      }

      const before = previous.find((tab) => tab.id === selected);
      const touched = touchedByEvent.has(current.id) || before?.revision !== current.revision;
      if (!touched) {
        return;
      }
      dispatch({ type: "remoteTouched" });
      if (syncRef.current.status === "loading") {
        showTab(current);
        dispatch({ type: "loaded" });
      }
    },
    [dispatch, showTab, syncTabMeta]
  );

  const load = useCallback(
    async (initial: boolean, touched: ReadonlySet<string> = new Set(), preferredTab: string | null = null) => {
      try {
        const artifact = await fetchArtifact(artifactId);
        if (!alive.current) {
          return;
        }
        applyServer(artifact, touched, initial, preferredTab);
        if (initial) {
          setLoadStatus("ready");
        }
      } catch (error) {
        if (!alive.current) {
          return;
        }
        if (error instanceof ArtifactRequestError && error.status === 404) {
          if (initial) {
            setLoadStatus("notFound");
          } else {
            toast(ptBR.artifacts.toasts.artifactDeleted);
            dispatch({ type: "remoteArtifactDeleted" });
            navigationRef.current.leave();
          }
          return;
        }
        if (initial) {
          setLoadStatus("error");
        }
      }
    },
    [applyServer, artifactId, dispatch]
  );

  // First load. The artifact page is keyed by id, so this runs once per artifact.
  const initialTab = useRef(tabParam);
  useEffect(() => {
    alive.current = true;
    void load(true, new Set(), initialTab.current);
    return () => {
      alive.current = false;
    };
  }, [load]);

  /** Writes the selected tab's draft. The caller has already moved the state to `saving`. */
  const performContentSave = useCallback((): Promise<void> => {
    const tabId = selectedRef.current;
    const content = draftRef.current;
    if (!tabId || content === null) {
      dispatch({ type: "saved" });
      return Promise.resolve();
    }
    const run = () =>
      enqueue(async () => {
        const base = serverTabs.current.find((tab) => tab.id === tabId);
        if (!base) {
          throw new ArtifactRequestError(404, "not_found");
        }
        try {
          const saved = await putTab(artifactId, tabId, { baseRevision: base.revision, content });
          serverTabs.current = serverTabs.current.map((tab) => (tab.id === tabId ? saved : tab));
          if (selectedRef.current === tabId && draftRef.current === content) {
            draftRef.current = null;
          }
          dispatch({ type: "saved" });
          if (syncRef.current.status === "dirty") {
            later.current.scheduleSave();
          }
        } catch (error) {
          if (error instanceof ArtifactRequestError && error.status === 409 && error.tab) {
            const serverTab = error.tab;
            serverTabs.current = serverTabs.current.map((tab) => (tab.id === serverTab.id ? serverTab : tab));
            dispatch({ type: "saveConflict" });
            return NOT_SAVED;
          }
          dispatch({ type: "saveFailed" });
          throw error;
        }
      });
    return tracked(run, () => later.current.retrySave()).then(() => undefined);
  }, [artifactId, dispatch, enqueue, tracked]);

  const flushContent = useCallback(async () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const status = syncRef.current.status;
    if (status !== "dirty" && status !== "saveError") {
      await queue.current;
      return;
    }
    dispatch({ type: "saveStarted" });
    await performContentSave();
  }, [dispatch, performContentSave]);

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
    }
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      void flushContent();
    }, ARTIFACT_AUTOSAVE_MS);
  }, [flushContent]);

  const flushTitle = useCallback(async () => {
    if (titleTimer.current) {
      clearTimeout(titleTimer.current);
      titleTimer.current = null;
    }
    const next = pendingTitle.current;
    if (next === null) {
      return;
    }
    pendingTitle.current = null;
    await tracked(
      () => enqueue(() => patchArtifactTitle(artifactId, next)),
      () => later.current.retryTitle(next)
    );
  }, [artifactId, enqueue, tracked]);

  const flushAll = useCallback(async () => {
    await flushTitle();
    await flushContent();
  }, [flushContent, flushTitle]);

  // Leaving the artifact (or the page) sends whatever is still pending.
  const flushAllRef = useRef(flushAll);
  useEffect(() => {
    flushAllRef.current = flushAll;
  });
  useEffect(() => {
    return () => {
      void flushAllRef.current();
    };
  }, []);

  const setTitle = useCallback(
    (next: string) => {
      setTitleState(next);
      pendingTitle.current = next;
      if (titleTimer.current) {
        clearTimeout(titleTimer.current);
      }
      titleTimer.current = setTimeout(() => {
        titleTimer.current = null;
        void flushTitle();
      }, ARTIFACT_AUTOSAVE_MS);
    },
    [flushTitle]
  );

  const onEditorChange = useCallback(
    (markdown: string) => {
      const status = syncRef.current.status;
      if (status === "loading" || status === "loadError" || status === "gone") {
        return;
      }
      draftRef.current = markdown;
      dispatch({ type: "edit" });
      if (status === "clean" || status === "dirty" || status === "saveError") {
        scheduleSave();
      }
    },
    [dispatch, scheduleSave]
  );

  const selectTab = useCallback(
    async (tabId: string) => {
      if (tabId === selectedRef.current) {
        return;
      }
      await flushContent();
      const status = syncRef.current.status;
      if (status === "conflict" || status === "saveError") {
        // Switching now would drop text the server does not have.
        toast(ptBR.artifacts.toasts.unsavedSwitch);
        return;
      }
      const target = serverTabs.current.find((tab) => tab.id === tabId);
      if (!target) {
        return;
      }
      syncRef.current = INITIAL_TAB_SYNC;
      showTab(target);
      dispatch({ type: "loaded" });
      navigationRef.current.selectTab(tabId);
    },
    [dispatch, flushContent, showTab]
  );

  // The URL moved (back/forward): follow it.
  useEffect(() => {
    if (loadStatus === "ready" && tabParam && tabParam !== selectedRef.current) {
      if (serverTabs.current.some((tab) => tab.id === tabParam)) {
        void selectTab(tabParam);
      }
    }
  }, [loadStatus, selectTab, tabParam]);

  const reportFailure = useCallback(() => {
    toast.error(ptBR.artifacts.document.actionError);
  }, []);

  const refresh = useCallback(async () => {
    await load(false);
  }, [load]);

  const addTab = useCallback(async () => {
    try {
      await flushAll();
      const created = await postTab(artifactId);
      const artifact = await fetchArtifact(artifactId);
      applyServer(artifact, new Set(), false);
      const tab = artifact.tabs.find((candidate) => candidate.id === created.id) ?? created;
      syncRef.current = INITIAL_TAB_SYNC;
      showTab(tab);
      dispatch({ type: "loaded" });
      navigationRef.current.selectTab(tab.id);
      setRenameRequestTabId(tab.id);
    } catch {
      reportFailure();
    }
  }, [applyServer, artifactId, dispatch, flushAll, reportFailure, showTab]);

  const renameTab = useCallback(
    async (tabId: string, nextTitle: string) => {
      const run = async (baseRevision: number) => {
        try {
          return await putTab(artifactId, tabId, { baseRevision, title: nextTitle });
        } catch (error) {
          if (error instanceof ArtifactRequestError && error.status === 409 && error.tab) {
            // Someone else wrote the tab meanwhile; a rename does not depend on its content.
            return putTab(artifactId, tabId, { baseRevision: error.tab.revision, title: nextTitle });
          }
          throw error;
        }
      };
      const saved = await tracked(
        () =>
          enqueue(async () => {
            const base = serverTabs.current.find((tab) => tab.id === tabId);
            if (!base) {
              throw new ArtifactRequestError(404, "not_found");
            }
            const result = await run(base.revision);
            serverTabs.current = serverTabs.current.map((tab) => (tab.id === tabId ? result : tab));
            return result;
          }),
        () => later.current.retryRename(tabId, nextTitle)
      );
      if (saved) {
        syncTabMeta({ tabs: serverTabs.current });
      }
    },
    [artifactId, enqueue, syncTabMeta, tracked]
  );

  const deleteTab = useCallback(
    async (tabId: string) => {
      try {
        await flushAll();
        const order = serverTabs.current.map((tab) => tab.id);
        const index = order.indexOf(tabId);
        await removeTab(artifactId, tabId);
        const artifact = await fetchArtifact(artifactId);
        const wasSelected = selectedRef.current === tabId;
        serverTabs.current = artifact.tabs;
        syncTabMeta(artifact);
        if (wasSelected) {
          const fallback = order[index - 1] ?? order[index + 1];
          const target = artifact.tabs.find((tab) => tab.id === fallback) ?? artifact.tabs[0];
          if (target) {
            syncRef.current = INITIAL_TAB_SYNC;
            showTab(target);
            dispatch({ type: "loaded" });
            navigationRef.current.selectTab(target.id);
          }
        }
      } catch {
        reportFailure();
      }
    },
    [artifactId, dispatch, flushAll, reportFailure, showTab, syncTabMeta]
  );

  const reorderTabs = useCallback(
    async (tabIds: string[]) => {
      const byId = new Map(serverTabs.current.map((tab) => [tab.id, tab]));
      const reordered = tabIds.map((id, position) => ({ ...byId.get(id)!, position }));
      serverTabs.current = reordered;
      syncTabMeta({ tabs: reordered });
      try {
        await putTabOrder(artifactId, tabIds);
      } catch {
        reportFailure();
        await load(false);
      }
    },
    [artifactId, load, reportFailure, syncTabMeta]
  );

  const deleteArtifact = useCallback(async () => {
    try {
      await removeArtifact(artifactId);
      alive.current = false;
      navigationRef.current.leave();
    } catch {
      reportFailure();
    }
  }, [artifactId, reportFailure]);

  const currentMarkdown = useCallback(
    () => draftRef.current ?? selectedServerTab()?.content ?? "",
    [selectedServerTab]
  );

  const reloadFromServer = useCallback(() => {
    const tab = selectedServerTab();
    if (!tab) {
      return;
    }
    dispatch({ type: "reload" });
    showTab(tab);
    dispatch({ type: "loaded" });
  }, [dispatch, selectedServerTab, showTab]);

  const keepMine = useCallback(() => {
    dispatch({ type: "keepMine" });
    void performContentSave();
  }, [dispatch, performContentSave]);

  const retrySave = useCallback(() => {
    if (retryAction.current) {
      retryAction.current();
      return;
    }
    void flushContent();
  }, [flushContent]);

  const retryLoad = useCallback(() => {
    setLoadStatus("loading");
    void load(true, new Set(), tabParam);
  }, [load, tabParam]);

  const handleEvent = useCallback(
    (event: ArtifactEventPayload) => {
      if (event.id !== artifactId) {
        return;
      }
      if (event.type === "delete") {
        toast(ptBR.artifacts.toasts.artifactDeleted);
        dispatch({ type: "remoteArtifactDeleted" });
        navigationRef.current.leave();
        return;
      }
      void load(false, new Set(event.tabIds));
    },
    [artifactId, dispatch, load]
  );

  const handleReconnect = useCallback(() => {
    void load(false);
  }, [load]);

  const clearRenameRequest = useCallback(() => setRenameRequestTabId(null), []);

  useEffect(() => {
    later.current = {
      scheduleSave,
      retrySave: () => void flushContent(),
      retryTitle: (next) => {
        pendingTitle.current = next;
        void flushTitle();
      },
      retryRename: (tabId, next) => void renameTab(tabId, next)
    };
  });

  return {
    loadStatus,
    title,
    tabs,
    selectedTabId,
    editor,
    sync,
    saveStatus,
    renameRequestTabId,
    setTitle,
    onEditorChange,
    selectTab,
    addTab,
    renameTab,
    deleteTab,
    reorderTabs,
    deleteArtifact,
    currentMarkdown,
    reloadFromServer,
    keepMine,
    retrySave,
    retryLoad,
    refresh,
    handleEvent,
    handleReconnect,
    clearRenameRequest
  };
}
