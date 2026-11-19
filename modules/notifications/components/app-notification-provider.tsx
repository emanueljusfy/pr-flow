"use client";

import { useAppNotifications } from "@/modules/notifications/hooks/use-app-notifications";
import { usePrNotificationSync } from "@/modules/notifications/hooks/use-pr-notification-sync";
import { useRoutineRunNotifications } from "@/modules/routines/hooks/use-routine-run-notifications";

export function AppNotificationProvider() {
  const { deliverAlert } = useAppNotifications();
  usePrNotificationSync(deliverAlert);
  useRoutineRunNotifications();
  return null;
}
