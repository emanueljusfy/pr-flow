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

export function pushNotificationInboxItem(input: {
  id: string;
  title: string;
  body: string;
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
      createdAt: Date.now(),
      read: false
    },
    ...existing
  ].slice(0, MAX_NOTIFICATION_INBOX_ITEMS);
  persist(next);
}
