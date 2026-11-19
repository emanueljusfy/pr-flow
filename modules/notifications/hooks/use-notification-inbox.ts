"use client";

import { useCallback, useEffect, useState } from "react";
import {
  countUnreadNotificationInbox,
  loadNotificationInbox,
  markAllNotificationInboxRead,
  NOTIFICATION_INBOX_UPDATED_EVENT,
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

  return {
    items,
    unreadCount: countUnreadNotificationInbox(items),
    markAllRead,
    refresh
  };
}
