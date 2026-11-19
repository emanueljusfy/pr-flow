import { afterEach, describe, expect, it } from "vitest";
import {
  clearNotificationInbox,
  countUnreadNotificationInbox,
  loadNotificationInbox,
  markAllNotificationInboxRead,
  MAX_NOTIFICATION_INBOX_ITEMS,
  pushNotificationInboxItem
} from "@/modules/notifications/lib/notification-inbox";

describe("notification inbox", () => {
  afterEach(() => {
    clearNotificationInbox();
  });

  it("pushes unread items newest-first and counts unread", () => {
    pushNotificationInboxItem({ id: "a", title: "A", body: "one", createdAt: 1 });
    pushNotificationInboxItem({ id: "b", title: "B", body: "two", createdAt: 2 });

    const items = loadNotificationInbox();
    expect(items.map((item) => item.id)).toEqual(["b", "a"]);
    expect(countUnreadNotificationInbox(items)).toBe(2);
  });

  it("replaces an existing id instead of duplicating", () => {
    pushNotificationInboxItem({ id: "a", title: "Old", body: "x", createdAt: 1 });
    pushNotificationInboxItem({ id: "a", title: "New", body: "y", createdAt: 2 });

    const items = loadNotificationInbox();
    expect(items).toHaveLength(1);
    expect(items[0]?.title).toBe("New");
  });

  it("caps the inbox size", () => {
    for (let index = 0; index < MAX_NOTIFICATION_INBOX_ITEMS + 5; index += 1) {
      pushNotificationInboxItem({
        id: `id-${index}`,
        title: `T${index}`,
        body: "b",
        createdAt: index
      });
    }

    expect(loadNotificationInbox()).toHaveLength(MAX_NOTIFICATION_INBOX_ITEMS);
  });

  it("marks all items as read", () => {
    pushNotificationInboxItem({ id: "a", title: "A", body: "one" });
    pushNotificationInboxItem({ id: "b", title: "B", body: "two" });

    const items = markAllNotificationInboxRead();
    expect(items.every((item) => item.read)).toBe(true);
    expect(countUnreadNotificationInbox(items)).toBe(0);
  });
});
