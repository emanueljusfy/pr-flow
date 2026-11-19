"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { deliverPrAlert } from "@/modules/notifications/lib/deliver-pr-alert";
import { pushNotificationInboxItem } from "@/modules/notifications/lib/notification-inbox";
import { loadNotificationPreferences } from "@/modules/notifications/lib/notification-preferences";
import type { PrAlertEvent } from "@/modules/notifications/lib/pr-alert-events";
import { playNotificationSound } from "@/modules/notifications/lib/play-notification-sound";

function readNotificationPermission(): NotificationPermission {
  if (typeof window === "undefined" || typeof Notification === "undefined") {
    return "denied";
  }

  return Notification.permission;
}

export function useAppNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>(readNotificationPermission);
  const [documentVisible, setDocumentVisible] = useState(
    () => typeof document !== "undefined" && document.visibilityState === "visible"
  );

  useEffect(() => {
    const onVisibilityChange = () => {
      setDocumentVisible(document.visibilityState === "visible");
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  const requestPermission = useCallback(async () => {
    if (typeof Notification === "undefined") {
      setPermission("denied");
      return "denied" as NotificationPermission;
    }

    const result = await Notification.requestPermission();
    setPermission(result);
    return result;
  }, []);

  const deliverAlert = useCallback(
    (event: PrAlertEvent) => {
      const delivered = deliverPrAlert(event, {
        permission,
        documentVisible,
        notify: (title, body) => {
          new Notification(title, { body });
        },
        toast: (title, body) => {
          toast(title, { description: body });
        }
      });

      if (!delivered) {
        return;
      }

      pushNotificationInboxItem({
        id: event.id,
        title: event.title,
        body: event.body
      });

      if (loadNotificationPreferences().soundEnabled) {
        playNotificationSound();
      }
    },
    [documentVisible, permission]
  );

  return {
    permission,
    requestPermission,
    deliverAlert
  };
}
