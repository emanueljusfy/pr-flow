import { afterEach, describe, expect, it } from "vitest";
import {
  clearNotificationInbox,
  countUnreadNotificationInbox,
  loadNotificationInbox,
  markAllNotificationInboxRead,
  MAX_NOTIFICATION_INBOX_ITEMS,
  pushNotificationInboxItem,
  removeNotificationInboxItem,
  setNotificationInboxItemRead
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

  it("marks one item read or unread", () => {
    pushNotificationInboxItem({ id: "a", title: "A", body: "one" });
    pushNotificationInboxItem({ id: "b", title: "B", body: "two" });

    setNotificationInboxItemRead("a", true);
    expect(loadNotificationInbox().find((item) => item.id === "a")?.read).toBe(true);
    expect(loadNotificationInbox().find((item) => item.id === "b")?.read).toBe(false);

    setNotificationInboxItemRead("a", false);
    expect(countUnreadNotificationInbox()).toBe(2);
  });

  it("removes one item", () => {
    pushNotificationInboxItem({ id: "a", title: "A", body: "one" });
    pushNotificationInboxItem({ id: "b", title: "B", body: "two" });

    removeNotificationInboxItem("a");
    expect(loadNotificationInbox().map((item) => item.id)).toEqual(["b"]);
  });

  it("evicts the oldest read items before unread ones when full", () => {
    pushNotificationInboxItem({ id: "old-unread", title: "U", body: "b", createdAt: 0 });
    for (let index = 1; index < MAX_NOTIFICATION_INBOX_ITEMS; index += 1) {
      pushNotificationInboxItem({ id: `id-${index}`, title: "T", body: "b", createdAt: index });
    }
    setNotificationInboxItemRead("id-5", true);

    pushNotificationInboxItem({ id: "new", title: "N", body: "b", createdAt: 999 });

    const ids = loadNotificationInbox().map((item) => item.id);
    expect(ids).toHaveLength(MAX_NOTIFICATION_INBOX_ITEMS);
    expect(ids).toContain("old-unread");
    expect(ids).not.toContain("id-5");
    expect(ids[0]).toBe("new");
  });
});
