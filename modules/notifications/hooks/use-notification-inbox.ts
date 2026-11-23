"use client";

import { useCallback, useEffect, useState } from "react";
import {
  clearNotificationInbox,
  countUnreadNotificationInbox,
  loadNotificationInbox,
  markAllNotificationInboxRead,
  NOTIFICATION_INBOX_UPDATED_EVENT,
  removeNotificationInboxItem,
  setNotificationInboxItemRead,
  type NotificationInboxItem
} from "@/modules/notifications/lib/notification-inbox";

export function useNotificationInbox() {
  const [items, setItems] = useState<NotificationInboxItem[]>([]);

  const refresh = useCallback(() => {
    setItems(loadNotificationInbox());
  }, []);

  useEffect(() => {
    refresh();

    const onUpdated = () => {
      refresh();
    };

    window.addEventListener(NOTIFICATION_INBOX_UPDATED_EVENT, onUpdated);
    return () => window.removeEventListener(NOTIFICATION_INBOX_UPDATED_EVENT, onUpdated);
  }, [refresh]);

  const markAllRead = useCallback(() => {
    setItems(markAllNotificationInboxRead());
  }, []);

  const setRead = useCallback((id: string, read: boolean) => {
    setItems(setNotificationInboxItemRead(id, read));
  }, []);

  const remove = useCallback((id: string) => {
    setItems(removeNotificationInboxItem(id));
  }, []);

  const clearAll = useCallback(() => {
    clearNotificationInbox();
    setItems([]);
  }, []);

  return {
    items,
    unreadCount: countUnreadNotificationInbox(items),
    markAllRead,
    setRead,
    remove,
    clearAll,
    refresh
  };
}
