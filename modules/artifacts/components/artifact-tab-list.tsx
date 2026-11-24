"use client";

import { MoreHorizontal } from "lucide-react";
import { useRef, useState } from "react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ARTIFACT_AUTOSAVE_MS, type TabMeta } from "@/modules/artifacts/hooks/use-artifact-document";
import { ptBR } from "@/modules/messages/pt-BR";

const copy = ptBR.artifacts.document;

type TabListProps = {
  tabs: TabMeta[];
  selectedTabId: string | null;
  /** A tab whose name should open in edit mode (just created). */
  renameRequestTabId: string | null;
  onRenameRequestHandled: () => void;
  onSelect: (tabId: string) => void;
  onAdd: () => void;
  onRename: (tabId: string, title: string) => void;
  onDelete: (tabId: string) => void;
  onReorder: (tabIds: string[]) => void;
};

type TabItemProps = {
  tab: TabMeta;
  selected: boolean;
  onlyTab: boolean;
  renameRequested: boolean;
  onRenameHandled: () => void;
  onSelect: () => void;
  onRename: (title: string) => void;
  onAskDelete: () => void;
  dragProps: React.HTMLAttributes<HTMLLIElement>;
};

function TabItem({
  tab,
  selected,
  onlyTab,
  renameRequested,
  onRenameHandled,
  onSelect,
  onRename,
  onAskDelete,
  dragProps
}: TabItemProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(tab.title);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelled = useRef(false);
  const sent = useRef(tab.title);
  const isEditing = editing || renameRequested;

  function startEditing() {
    cancelled.current = false;
    sent.current = tab.title;
    setName(tab.title);
    setEditing(true);
  }

  function stopTimer() {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }

  function send(value: string) {
    const clean = value.trim();
    if (clean && clean !== sent.current) {
      sent.current = clean;
      onRename(clean);
    }
  }

  function finish(commit: boolean) {
    stopTimer();
    if (commit) {
      send(name);
    } else {
      cancelled.current = true;
    }
    setEditing(false);
    onRenameHandled();
  }

  return (
    <li {...dragProps} data-tab-id={tab.id} className="list-none">
      <div
        className={cn(
          "group flex items-center gap-1 rounded-md px-1.5 py-1 text-sm",
          selected
            ? "bg-[var(--app-surface-raised)] text-[var(--app-text)]"
            : "text-[var(--app-text-soft)] hover:bg-[#1f1f1f]"
        )}
      >
        {isEditing ? (
          <Input
            autoFocus
            aria-label={copy.tabNameLabel}
            className="h-7 min-w-0 flex-1"
            value={name}
            onFocus={(event) => {
              if (!editing) {
                cancelled.current = false;
                sent.current = tab.title;
                setName(tab.title);
                setEditing(true);
              }
              event.currentTarget.select();
            }}
            onChange={(event) => {
              const next = event.target.value;
              setName(next);
              stopTimer();
              timer.current = setTimeout(() => {
                timer.current = null;
                send(next);
              }, ARTIFACT_AUTOSAVE_MS);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                finish(true);
              } else if (event.key === "Escape") {
                event.preventDefault();
                finish(false);
              }
            }}
            onBlur={() => {
              if (!cancelled.current) {
                finish(true);
              }
            }}
          />
        ) : (
          <button
            type="button"
            className="min-w-0 flex-1 truncate text-left outline-none focus-visible:underline"
            title={tab.title}
            aria-current={selected ? "page" : undefined}
            onClick={onSelect}
            onDoubleClick={startEditing}
          >
            {tab.title}
          </button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={copy.tabOptions(tab.title)}
                className="shrink-0 opacity-60 group-hover:opacity-100"
              />
            }
          >
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={startEditing}>{copy.renameTab}</DropdownMenuItem>
            <DropdownMenuItem variant="destructive" disabled={onlyTab} onClick={onAskDelete}>
              {copy.deleteTab}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}

/** Where `dragged` lands when dropped on `target`: before it when moving up, after it when moving down. */
export function moveTab(order: string[], dragged: string, target: string): string[] {
  const from = order.indexOf(dragged);
  const to = order.indexOf(target);
  if (from < 0 || to < 0 || from === to) {
    return order;
  }
  const next = order.filter((id) => id !== dragged);
  next.splice(to, 0, dragged);
  return next;
}

export function ArtifactTabList({
  tabs,
  selectedTabId,
  renameRequestTabId,
  onRenameRequestHandled,
  onSelect,
  onAdd,
  onRename,
  onDelete,
  onReorder
}: TabListProps) {
  const dragged = useRef<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<TabMeta | null>(null);
  const order = tabs.map((tab) => tab.id);

  return (
    <div className="flex min-h-0 w-52 shrink-0 flex-col border-r border-[var(--app-border)]">
      <ul aria-label={copy.tabsLabel} className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2">
        {tabs.map((tab) => (
          <TabItem
            key={tab.id}
            tab={tab}
            selected={tab.id === selectedTabId}
            onlyTab={tabs.length === 1}
            renameRequested={tab.id === renameRequestTabId}
            onRenameHandled={onRenameRequestHandled}
            onSelect={() => onSelect(tab.id)}
            onRename={(title) => onRename(tab.id, title)}
            onAskDelete={() => setPendingDelete(tab)}
            dragProps={{
              draggable: true,
              onDragStart: () => {
                dragged.current = tab.id;
              },
              onDragOver: (event) => event.preventDefault(),
              onDrop: (event) => {
                event.preventDefault();
                const from = dragged.current;
                dragged.current = null;
                if (!from) {
                  return;
                }
                const next = moveTab(order, from, tab.id);
                if (next.join() !== order.join()) {
                  onReorder(next);
                }
              }
            }}
          />
        ))}
      </ul>
      <div className="border-t border-[var(--app-border)] p-2">
        <Button type="button" variant="ghost" size="sm" className="w-full justify-start" onClick={onAdd}>
          {copy.addTab}
        </Button>
      </div>

      <AlertDialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{copy.deleteTabTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete ? copy.deleteTabBody(pendingDelete.title) : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{copy.cancel}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (pendingDelete) {
                  onDelete(pendingDelete.id);
                }
                setPendingDelete(null);
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
