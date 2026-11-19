import { afterEach, describe, expect, it } from "vitest";
import {
  clearNotificationPreferences,
  DEFAULT_NOTIFICATION_PREFERENCES,
  isAlertTypeEnabled,
  isWithinBusinessHours,
  loadNotificationPreferences,
  resolveNotificationPollIntervalMs,
  saveNotificationPreferences,
  shouldSyncPrsFromGithub,
  FALLBACK_POLL_INTERVAL_MS
} from "@/modules/notifications/lib/notification-preferences";

describe("notification preferences", () => {
  afterEach(() => {
    clearNotificationPreferences();
  });

  it("returns defaults when nothing is stored", () => {
    expect(loadNotificationPreferences()).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
  });

  it("persists toggles, stale threshold, and monitoring prefs", () => {
    saveNotificationPreferences({
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      alerts: {
        ...DEFAULT_NOTIFICATION_PREFERENCES.alerts,
        prApproved: false,
        prStale: true
      },
      staleDaysThreshold: 5,
      pollEnabled: false,
      pollIntervalSeconds: 90,
      workdayStartHour: 8,
      workdayEndHour: 17,
      soundEnabled: false
    });

    const loaded = loadNotificationPreferences();
    expect(loaded.alerts.prApproved).toBe(false);
    expect(loaded.alerts.prStale).toBe(true);
    expect(loaded.staleDaysThreshold).toBe(5);
    expect(loaded.pollEnabled).toBe(false);
    expect(loaded.pollIntervalSeconds).toBe(90);
    expect(loaded.workdayStartHour).toBe(8);
    expect(loaded.workdayEndHour).toBe(17);
    expect(loaded.soundEnabled).toBe(false);
  });

  it("reports whether a given alert type is enabled", () => {
    const prefs = loadNotificationPreferences();
    expect(isAlertTypeEnabled(prefs, "reviewerQueueNew")).toBe(true);
    expect(isAlertTypeEnabled(prefs, "prStale")).toBe(false);
  });

  it("merges partial stored data with defaults", () => {
    window.localStorage.setItem(
      "pr-flow:notification-preferences",
      JSON.stringify({ alerts: { prApproved: false } })
    );

    const loaded = loadNotificationPreferences();
    expect(loaded.alerts.prApproved).toBe(false);
    expect(loaded.alerts.prStatusChanged).toBe(true);
    expect(loaded.staleDaysThreshold).toBe(3);
    expect(loaded.pollEnabled).toBe(true);
    expect(loaded.pollIntervalSeconds).toBe(60);
    expect(loaded.soundEnabled).toBe(true);
  });

  it("clamps poll interval below the minimum back to the default", () => {
    saveNotificationPreferences({
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      pollIntervalSeconds: 10
    });

    expect(loadNotificationPreferences().pollIntervalSeconds).toBe(60);
  });
});

describe("isWithinBusinessHours", () => {
  const prefs = DEFAULT_NOTIFICATION_PREFERENCES;

  it("is true on a weekday inside the window", () => {
    // Wednesday 2026-03-18 10:30 local
    const now = new Date(2026, 2, 18, 10, 30, 0);
    expect(isWithinBusinessHours(now, prefs)).toBe(true);
  });

  it("is false before start hour and at/after end hour", () => {
    expect(isWithinBusinessHours(new Date(2026, 2, 18, 8, 59, 0), prefs)).toBe(false);
    expect(isWithinBusinessHours(new Date(2026, 2, 18, 18, 0, 0), prefs)).toBe(false);
  });

  it("is false on weekends with default workdays", () => {
    expect(isWithinBusinessHours(new Date(2026, 2, 21, 12, 0, 0), prefs)).toBe(false);
    expect(isWithinBusinessHours(new Date(2026, 2, 22, 12, 0, 0), prefs)).toBe(false);
  });
});

describe("resolveNotificationPollIntervalMs / shouldSyncPrsFromGithub", () => {
  it("uses the configured short interval during business hours when poll is enabled", () => {
    const prefs = {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      pollIntervalSeconds: 45
    };
    const now = new Date(2026, 2, 18, 11, 0, 0);
    expect(resolveNotificationPollIntervalMs(prefs, now)).toBe(45_000);
    expect(shouldSyncPrsFromGithub(prefs, now, true)).toBe(true);
  });

  it("falls back outside business hours or when the tab is hidden", () => {
    const prefs = DEFAULT_NOTIFICATION_PREFERENCES;
    const evening = new Date(2026, 2, 18, 20, 0, 0);
    expect(resolveNotificationPollIntervalMs(prefs, evening)).toBe(FALLBACK_POLL_INTERVAL_MS);
    expect(shouldSyncPrsFromGithub(prefs, evening, true)).toBe(false);

    const morning = new Date(2026, 2, 18, 10, 0, 0);
    expect(shouldSyncPrsFromGithub(prefs, morning, false)).toBe(false);
  });
});
