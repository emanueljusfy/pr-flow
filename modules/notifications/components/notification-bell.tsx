"use client";

import { useState } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger
} from "@/components/ui/popover";
import { ptBR } from "@/modules/messages/pt-BR";
import { useNotificationInbox } from "@/modules/notifications/hooks/use-notification-inbox";

const copy = ptBR.notifications;

function formatRelativeTime(createdAt: number): string {
  const deltaMs = Date.now() - createdAt;
  const minutes = Math.floor(deltaMs / 60_000);
  if (minutes < 1) {
    return "agora";
  }
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} h`;
  }
  const days = Math.floor(hours / 24);
  return `${days} d`;
}

export function NotificationBell() {
  const { items, unreadCount, markAllRead } = useNotificationInbox();
  const [open, setOpen] = useState(false);

  if (unreadCount === 0 && !open) {
    return null;
  }

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen && unreadCount > 0) {
          markAllRead();
        }
      }}
    >
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="relative shrink-0"
            aria-label={copy.bellAriaLabel(unreadCount)}
          />
        }
      >
        <Bell className="size-4" aria-hidden />
        {unreadCount > 0 ? (
          <span
            className="absolute -right-0.5 -top-0.5 inline-flex min-w-4 items-center justify-center rounded-full bg-[var(--brand)] px-1 text-[10px] font-semibold leading-4 text-white"
            aria-hidden
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-3" sideOffset={8}>
        <PopoverHeader className="mb-1 flex flex-row items-start justify-between gap-2">
          <div className="min-w-0">
            <PopoverTitle>{copy.inboxTitle}</PopoverTitle>
            <PopoverDescription className="sr-only">{copy.inboxDescription}</PopoverDescription>
          </div>
          {items.some((item) => !item.read) ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 shrink-0 px-2 text-xs"
              onClick={() => markAllRead()}
            >
              {copy.markAllRead}
            </Button>
          ) : null}
        </PopoverHeader>

        {items.length === 0 ? (
          <p className="px-1 py-3 text-sm text-[var(--app-text-muted)]">{copy.inboxEmpty}</p>
        ) : (
          <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto">
            {items.map((item) => (
              <li
                key={`${item.id}-${item.createdAt}`}
                className="rounded-md px-2 py-1.5 text-sm text-[var(--app-text)]"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium leading-snug">{item.title}</span>
                  <span className="shrink-0 text-[10px] text-[var(--app-text-muted)]">
                    {formatRelativeTime(item.createdAt)}
                  </span>
                </div>
                <p className="mt-0.5 text-xs leading-snug text-[var(--app-text-muted)]">{item.body}</p>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
