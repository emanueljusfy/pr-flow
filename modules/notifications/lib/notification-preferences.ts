import { z } from "zod";

export type NotificationAlertType =
  | "prStatusChanged"
  | "reviewerQueueNew"
  | "prApproved"
  | "prChangesRequested"
  | "prStale";

export type NotificationPreferences = {
  alerts: Record<NotificationAlertType, boolean>;
  staleDaysThreshold: number;
  pollEnabled: boolean;
  pollIntervalSeconds: number;
  workdayStartHour: number;
  workdayEndHour: number;
  /** Weekdays when short poll is active (0 = Sunday … 6 = Saturday). */
  workdays: number[];
  soundEnabled: boolean;
};

const STORAGE_KEY = "pr-flow:notification-preferences";
export const NOTIFICATION_PREFERENCES_UPDATED_EVENT = "pr-flow:notification-preferences-updated";

export const MIN_POLL_INTERVAL_SECONDS = 30;
export const DEFAULT_POLL_INTERVAL_SECONDS = 60;
export const FALLBACK_POLL_INTERVAL_MS = 2 * 60 * 1000;

const alertTypeSchema = z.enum([
  "prStatusChanged",
  "reviewerQueueNew",
  "prApproved",
  "prChangesRequested",
  "prStale"
]);

const notificationPreferencesSchema = z.object({
  alerts: z
    .record(z.string(), z.boolean())
    .optional()
    .transform((value) => value ?? {}),
  staleDaysThreshold: z.number().positive().optional(),
  pollEnabled: z.boolean().optional(),
  pollIntervalSeconds: z.number().int().positive().optional(),
  workdayStartHour: z.number().int().min(0).max(23).optional(),
  workdayEndHour: z.number().int().min(0).max(24).optional(),
  workdays: z.array(z.number().int().min(0).max(6)).optional(),
  soundEnabled: z.boolean().optional()
});

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  alerts: {
    prStatusChanged: true,
    reviewerQueueNew: true,
    prApproved: true,
    prChangesRequested: true,
    prStale: false
  },
  staleDaysThreshold: 3,
  pollEnabled: true,
  pollIntervalSeconds: DEFAULT_POLL_INTERVAL_SECONDS,
  workdayStartHour: 9,
  workdayEndHour: 18,
  workdays: [1, 2, 3, 4, 5],
  soundEnabled: true
};

function normalizeWorkdays(workdays: number[] | undefined): number[] {
  if (!workdays || workdays.length === 0) {
    return [...DEFAULT_NOTIFICATION_PREFERENCES.workdays];
  }

  const unique = [...new Set(workdays)].filter((day) => day >= 0 && day <= 6).sort((a, b) => a - b);
  return unique.length > 0 ? unique : [...DEFAULT_NOTIFICATION_PREFERENCES.workdays];
}

function clampPollIntervalSeconds(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < MIN_POLL_INTERVAL_SECONDS) {
    return DEFAULT_NOTIFICATION_PREFERENCES.pollIntervalSeconds;
  }

  return Math.floor(value);
}

function mergeWithDefaults(partial: unknown): NotificationPreferences {
  const base = DEFAULT_NOTIFICATION_PREFERENCES;
  const parsed = notificationPreferencesSchema.safeParse(partial);
  if (!parsed.success) {
    return base;
  }

  const candidate = parsed.data;
  const alerts = { ...base.alerts };

  for (const [key, value] of Object.entries(candidate.alerts)) {
    const alertType = alertTypeSchema.safeParse(key);
    if (alertType.success && typeof value === "boolean") {
      alerts[alertType.data] = value;
    }
  }

  const workdayStartHour =
    candidate.workdayStartHour ?? base.workdayStartHour;
  let workdayEndHour = candidate.workdayEndHour ?? base.workdayEndHour;
  if (workdayEndHour <= workdayStartHour) {
    workdayEndHour = base.workdayEndHour;
  }

  return {
    alerts,
    staleDaysThreshold:
      candidate.staleDaysThreshold && candidate.staleDaysThreshold > 0
        ? candidate.staleDaysThreshold
        : base.staleDaysThreshold,
    pollEnabled: candidate.pollEnabled ?? base.pollEnabled,
    pollIntervalSeconds: clampPollIntervalSeconds(candidate.pollIntervalSeconds),
    workdayStartHour,
    workdayEndHour,
    workdays: normalizeWorkdays(candidate.workdays),
    soundEnabled: candidate.soundEnabled ?? base.soundEnabled
  };
}

export function loadNotificationPreferences(): NotificationPreferences {
  if (typeof window === "undefined") {
    return DEFAULT_NOTIFICATION_PREFERENCES;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return DEFAULT_NOTIFICATION_PREFERENCES;
    }

    return mergeWithDefaults(JSON.parse(raw) as unknown);
  } catch {
    return DEFAULT_NOTIFICATION_PREFERENCES;
  }
}

export function saveNotificationPreferences(preferences: NotificationPreferences): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const normalized = mergeWithDefaults(preferences);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    window.dispatchEvent(new Event(NOTIFICATION_PREFERENCES_UPDATED_EVENT));
  } catch {
    // Ignore quota or privacy mode errors.
  }
}

export function clearNotificationPreferences(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(STORAGE_KEY);
}

export function isAlertTypeEnabled(
  preferences: NotificationPreferences,
  alertType: NotificationAlertType
): boolean {
  return preferences.alerts[alertType];
}

/** Local-timezone check: weekday in `workdays` and hour in [start, end). */
export function isWithinBusinessHours(
  now: Date,
  preferences: Pick<
    NotificationPreferences,
    "workdayStartHour" | "workdayEndHour" | "workdays"
  > = DEFAULT_NOTIFICATION_PREFERENCES
): boolean {
  if (!preferences.workdays.includes(now.getDay())) {
    return false;
  }

  const hour = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
  return hour >= preferences.workdayStartHour && hour < preferences.workdayEndHour;
}

export function resolveNotificationPollIntervalMs(
  preferences: NotificationPreferences,
  now: Date = new Date()
): number {
  if (preferences.pollEnabled && isWithinBusinessHours(now, preferences)) {
    return Math.max(preferences.pollIntervalSeconds, MIN_POLL_INTERVAL_SECONDS) * 1000;
  }

  return FALLBACK_POLL_INTERVAL_MS;
}

export function shouldSyncPrsFromGithub(
  preferences: NotificationPreferences,
  now: Date = new Date(),
  documentVisible = typeof document !== "undefined" && document.visibilityState === "visible"
): boolean {
  return preferences.pollEnabled && isWithinBusinessHours(now, preferences) && documentVisible;
}
