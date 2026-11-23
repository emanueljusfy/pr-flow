"use client";

import { useAppNotifications } from "@/modules/notifications/hooks/use-app-notifications";
import { usePrNotificationSync } from "@/modules/notifications/hooks/use-pr-notification-sync";
import { useAiReviewNotifications } from "@/modules/pr-ai-review/hooks/use-ai-review-notifications";

export function AppNotificationProvider() {
  const { deliverAlert } = useAppNotifications();
  usePrNotificationSync(deliverAlert);
  useAiReviewNotifications();
  return null;
}
