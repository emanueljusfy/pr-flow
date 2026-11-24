"use client";

import { useEffect, useState } from "react";
import { getSnapshot, Tldraw, type Editor } from "tldraw";
import "tldraw/tldraw.css";
import "../whiteboard.css";
import { Button } from "@/components/ui/button";
import { ptBR } from "@/modules/messages/pt-BR";
import {
  WhiteboardSyncClient,
  type WhiteboardLoadStatus,
  type WhiteboardSaveStatus
} from "../lib/whiteboard-sync-client";
import { WHITEBOARD_PERSISTENCE_KEY, whiteboardThemes } from "../lib/whiteboard-theme";
import { createWhiteboardStore } from "../lib/whiteboard-tldraw";

/** Camera, current page and selection stay in this browser; the board itself lives on the server. */
const SESSION_STORAGE_KEY = `${WHITEBOARD_PERSISTENCE_KEY}:session`;
const SESSION_SAVE_DELAY_MS = 1000;

function restoreSession(editor: Editor): () => void {
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (raw) {
      editor.loadSnapshot({ session: JSON.parse(raw) });
    }
  } catch {
    // a stale or unreadable session just starts fresh
  }
  const pages = editor.getPages();
  if (pages[0] && !editor.getPage(editor.getCurrentPageId())) {
    editor.setCurrentPage(pages[0].id);
  }

  let timer: ReturnType<typeof setTimeout> | null = null;
  const save = () => {
    try {
      window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(getSnapshot(editor.store).session));
    } catch {
      // storage full or blocked
    }
  };
  const stop = editor.store.listen(
    () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(save, SESSION_SAVE_DELAY_MS);
    },
    { scope: "session" }
  );
  return () => {
    if (timer) clearTimeout(timer);
    stop();
  };
}

export default function WhiteboardCanvas() {
  const [store] = useState(createWhiteboardStore);
  const [clientId] = useState(() => crypto.randomUUID());
  const [attempt, setAttempt] = useState(0);
  const [loadStatus, setLoadStatus] = useState<WhiteboardLoadStatus>("loading");
  const [saveStatus, setSaveStatus] = useState<WhiteboardSaveStatus>("saved");

  useEffect(() => {
    const client = new WhiteboardSyncClient({
      store,
      clientId,
      onLoadStatus: setLoadStatus,
      onSaveStatus: setSaveStatus
    });
    void client.start();
    const onPageHide = () => void client.flush();
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      void client.flush();
      client.stop();
    };
  }, [store, clientId, attempt]);

  if (loadStatus === "loading") {
    return (
      <div className="flex h-full items-center justify-center text-sm text-[var(--app-text-muted)]">
        {ptBR.whiteboard.loading}
      </div>
    );
  }

  if (loadStatus === "error") {
    return (
      <div role="alert" className="flex h-full flex-col items-center justify-center gap-3 text-sm">
        <p className="text-[var(--app-text-muted)]">{ptBR.whiteboard.loadError}</p>
        <Button variant="outline" size="sm" onClick={() => setAttempt((n) => n + 1)}>
          {ptBR.whiteboard.retry}
        </Button>
      </div>
    );
  }

  return (
    <>
      <Tldraw
        store={store}
        themes={whiteboardThemes}
        colorScheme="dark"
        onMount={(editor) => {
          // A stored "light" preference would override the prop; the app is dark-only.
          editor.user.updateUserPreferences({ colorScheme: "dark" });
          return restoreSession(editor);
        }}
      />
      {saveStatus === "error" ? (
        <div
          role="status"
          className="pointer-events-none absolute top-2 left-1/2 z-[400] -translate-x-1/2 rounded-md border border-[var(--app-border)] bg-[var(--app-surface-raised)] px-3 py-1.5 text-xs text-[var(--app-text)]"
        >
          {ptBR.whiteboard.notSaved}
        </div>
      ) : null}
    </>
  );
}
