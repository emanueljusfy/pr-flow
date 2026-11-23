import { z } from "zod";

export type NotificationInboxItem = {
  id: string;
  title: string;
  body: string;
  createdAt: number;
  read: boolean;
};

const STORAGE_KEY = "pr-flow:notification-inbox";
export const NOTIFICATION_INBOX_UPDATED_EVENT = "pr-flow:notification-inbox-updated";
export const MAX_NOTIFICATION_INBOX_ITEMS = 20;

const inboxItemSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  body: z.string(),
  createdAt: z.number().finite(),
  read: z.boolean()
});

const inboxSchema = z.array(inboxItemSchema);

function dispatchUpdated(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new Event(NOTIFICATION_INBOX_UPDATED_EVENT));
}

function persist(items: NotificationInboxItem[]): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    dispatchUpdated();
  } catch {
    // Ignore quota or privacy mode errors.
  }
}

export function loadNotificationInbox(): NotificationInboxItem[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = inboxSchema.safeParse(JSON.parse(raw) as unknown);
    if (!parsed.success) {
      return [];
    }
    return parsed.data.slice(0, MAX_NOTIFICATION_INBOX_ITEMS);
  } catch {
    return [];
  }
}

export function clearNotificationInbox(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(STORAGE_KEY);
  dispatchUpdated();
}

export function countUnreadNotificationInbox(
  items: NotificationInboxItem[] = loadNotificationInbox()
): number {
  return items.filter((item) => !item.read).length;
}

export function pushNotificationInboxItem(input: {
  id: string;
  title: string;
  body: string;
  createdAt?: number;
}): void {
  if (typeof window === "undefined") {
    return;
  }
  const existing = loadNotificationInbox().filter((item) => item.id !== input.id);
  const next: NotificationInboxItem[] = [
    {
      id: input.id,
      title: input.title,
      body: input.body,
      createdAt: input.createdAt ?? Date.now(),
      read: false
    },
    ...existing
  ];
  persist(capInbox(next));
}

/** Drops the oldest read items first so unread alerts are not evicted while read ones remain. */
function capInbox(items: NotificationInboxItem[]): NotificationInboxItem[] {
  let overflow = items.length - MAX_NOTIFICATION_INBOX_ITEMS;
  if (overflow <= 0) {
    return items;
  }
  const dropped = new Set<NotificationInboxItem>();
  for (let index = items.length - 1; index >= 0 && overflow > 0; index -= 1) {
    if (items[index]!.read) {
      dropped.add(items[index]!);
      overflow -= 1;
    }
  }
  return items.filter((item) => !dropped.has(item)).slice(0, MAX_NOTIFICATION_INBOX_ITEMS);
}

export function setNotificationInboxItemRead(id: string, read: boolean): NotificationInboxItem[] {
  const items = loadNotificationInbox().map((item) => (item.id === id ? { ...item, read } : item));
  persist(items);
  return items;
}

export function removeNotificationInboxItem(id: string): NotificationInboxItem[] {
  const items = loadNotificationInbox().filter((item) => item.id !== id);
  persist(items);
  return items;
}

export function markAllNotificationInboxRead(): NotificationInboxItem[] {
  const items = loadNotificationInbox().map((item) => ({ ...item, read: true }));
  persist(items);
  return items;
}
