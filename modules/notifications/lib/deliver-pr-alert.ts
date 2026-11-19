import type { PrAlertEvent } from "@/modules/notifications/lib/pr-alert-events";

const ALERT_COOLDOWN_MS = 5 * 60 * 1000;

const recentAlerts = new Map<string, number>();

export function clearRecentAlertIds(): void {
  recentAlerts.clear();
}

function isDebounced(eventId: string, now: number): boolean {
  const lastAt = recentAlerts.get(eventId);
  if (lastAt !== undefined && now - lastAt < ALERT_COOLDOWN_MS) {
    return true;
  }

  recentAlerts.set(eventId, now);
  return false;
}

export function shouldDeliverBrowserNotification(
  permission: NotificationPermission,
  documentVisible: boolean
): boolean {
  return permission === "granted" && !documentVisible;
}

export type DeliverPrAlertOptions = {
  permission: NotificationPermission;
  documentVisible: boolean;
  notify: (title: string, body: string) => void;
  toast: (title: string, body: string) => void;
  now?: number;
};

/** Returns true when the alert was delivered (not suppressed by cooldown). */
export function deliverPrAlert(event: PrAlertEvent, options: DeliverPrAlertOptions): boolean {
  const now = options.now ?? Date.now();
  if (isDebounced(event.id, now)) {
    return false;
  }

  if (shouldDeliverBrowserNotification(options.permission, options.documentVisible)) {
    options.notify(event.title, event.body);
    return true;
  }

  options.toast(event.title, event.body);
  return true;
}
