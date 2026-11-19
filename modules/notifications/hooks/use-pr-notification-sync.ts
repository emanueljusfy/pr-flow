"use client";

import { useCallback, useEffect, useRef } from "react";
import type { MonitoredPr, PrApiResponse, ReviewerQueueApiResponse, ReviewerQueuePr } from "@/modules/prs/lib/domain";
import {
  loadPrMonitorLastSync,
  PR_MONITOR_SYNC_UPDATED_EVENT,
  savePrMonitorLastSync
} from "@/modules/prs/lib/pr-monitor-cache";
import {
  loadPrReviewerQueueLastSync,
  savePrReviewerQueueLastSync
} from "@/modules/prs/lib/pr-reviewer-queue-cache";
import {
  loadNotificationPreferences,
  NOTIFICATION_PREFERENCES_UPDATED_EVENT,
  resolveNotificationPollIntervalMs,
  shouldSyncPrsFromGithub
} from "@/modules/notifications/lib/notification-preferences";
import {
  detectPrMonitorAlerts,
  detectReviewerQueueAlerts,
  type PrAlertEvent
} from "@/modules/notifications/lib/pr-alert-events";

async function fetchMonitor(): Promise<PrApiResponse | null> {
  try {
    const result = await fetch("/api/prs", { method: "GET", cache: "no-store" });
    const body = (await result.json()) as PrApiResponse;
    if (result.ok && body.status === "ok") {
      savePrMonitorLastSync(body);
    }
    return body;
  } catch {
    return null;
  }
}

async function syncMonitorFromGithub(): Promise<PrApiResponse | null> {
  try {
    const result = await fetch("/api/prs", { method: "POST", cache: "no-store" });
    const body = (await result.json()) as PrApiResponse;
    if (result.ok && body.status === "ok") {
      savePrMonitorLastSync(body);
    }
    return body;
  } catch {
    return null;
  }
}

async function fetchReviewerQueue(): Promise<ReviewerQueueApiResponse | null> {
  try {
    const result = await fetch("/api/prs/reviewer-queue", { method: "GET", cache: "no-store" });
    const body = (await result.json()) as ReviewerQueueApiResponse;
    if (result.ok && body.status === "ok") {
      savePrReviewerQueueLastSync(body);
    }
    return body;
  } catch {
    return null;
  }
}

export function usePrNotificationSync(deliverAlert: (event: PrAlertEvent) => void) {
  const monitorRef = useRef<MonitoredPr[] | null>(null);
  const queueRef = useRef<ReviewerQueuePr[] | null>(null);
  const deliverRef = useRef(deliverAlert);

  deliverRef.current = deliverAlert;

  const evaluateAlerts = useCallback(() => {
    const preferences = loadNotificationPreferences();
    const monitor = loadPrMonitorLastSync();
    const queue = loadPrReviewerQueueLastSync();

    if (monitor?.status === "ok") {
      const alerts = detectPrMonitorAlerts(monitorRef.current, monitor.data, preferences);
      for (const alert of alerts) {
        deliverRef.current(alert);
      }
      monitorRef.current = monitor.data;
    }

    if (queue?.status === "ok") {
      const alerts = detectReviewerQueueAlerts(queueRef.current, queue.data, preferences);
      for (const alert of alerts) {
        deliverRef.current(alert);
      }
      queueRef.current = queue.data;
    }
  }, []);

  const syncAll = useCallback(async () => {
    const preferences = loadNotificationPreferences();
    const now = new Date();
    const documentVisible =
      typeof document !== "undefined" && document.visibilityState === "visible";

    if (shouldSyncPrsFromGithub(preferences, now, documentVisible)) {
      await Promise.all([syncMonitorFromGithub(), fetchReviewerQueue()]);
    } else {
      await Promise.all([fetchMonitor(), fetchReviewerQueue()]);
    }

    evaluateAlerts();
  }, [evaluateAlerts]);

  useEffect(() => {
    const cachedMonitor = loadPrMonitorLastSync();
    const cachedQueue = loadPrReviewerQueueLastSync();
    monitorRef.current = cachedMonitor?.status === "ok" ? cachedMonitor.data : null;
    queueRef.current = cachedQueue?.status === "ok" ? cachedQueue.data : null;

    let cancelled = false;
    let timeoutId: number | undefined;

    const clearScheduled = () => {
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
        timeoutId = undefined;
      }
    };

    const scheduleNext = () => {
      clearScheduled();
      if (cancelled) {
        return;
      }

      const preferences = loadNotificationPreferences();
      const delayMs = resolveNotificationPollIntervalMs(preferences, new Date());
      timeoutId = window.setTimeout(() => {
        void (async () => {
          await syncAll();
          if (!cancelled) {
            scheduleNext();
          }
        })();
      }, delayMs);
    };

    void syncAll().then(() => {
      if (!cancelled) {
        scheduleNext();
      }
    });

    const onSyncUpdated = () => {
      evaluateAlerts();
    };

    const onPreferencesUpdated = () => {
      scheduleNext();
    };

    window.addEventListener(PR_MONITOR_SYNC_UPDATED_EVENT, onSyncUpdated);
    window.addEventListener(NOTIFICATION_PREFERENCES_UPDATED_EVENT, onPreferencesUpdated);

    return () => {
      cancelled = true;
      clearScheduled();
      window.removeEventListener(PR_MONITOR_SYNC_UPDATED_EVENT, onSyncUpdated);
      window.removeEventListener(NOTIFICATION_PREFERENCES_UPDATED_EVENT, onPreferencesUpdated);
    };
  }, [evaluateAlerts, syncAll]);
}

export function countPendingReviews(): number {
  const queue = loadPrReviewerQueueLastSync();
  if (queue?.status !== "ok") {
    return 0;
  }

  return queue.data.filter((pr) => pr.myReviewStatus === "pending").length;
}
