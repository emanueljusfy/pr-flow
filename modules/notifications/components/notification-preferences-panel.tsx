"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import { ptBR } from "@/modules/messages/pt-BR";
import { useAppNotifications } from "@/modules/notifications/hooks/use-app-notifications";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  MIN_POLL_INTERVAL_SECONDS,
  loadNotificationPreferences,
  saveNotificationPreferences,
  type NotificationAlertType,
  type NotificationPreferences
} from "@/modules/notifications/lib/notification-preferences";

const copy = ptBR.notifications;

const ALERT_LABELS: Record<NotificationAlertType, string> = {
  prStatusChanged: copy.alertPrStatusChanged,
  reviewerQueueNew: copy.alertReviewerQueueNew,
  prApproved: copy.alertPrApproved,
  prChangesRequested: copy.alertPrChangesRequested,
  prStale: copy.alertPrStale
};

export function NotificationPreferencesPanel() {
  const { permission, requestPermission } = useAppNotifications();
  const [preferences, setPreferences] = useState<NotificationPreferences>(
    DEFAULT_NOTIFICATION_PREFERENCES
  );

  useEffect(() => {
    setPreferences(loadNotificationPreferences());
  }, []);

  const toggleAlert = useCallback((alertType: NotificationAlertType) => {
    setPreferences((current) => ({
      ...current,
      alerts: {
        ...current.alerts,
        [alertType]: !current.alerts[alertType]
      }
    }));
  }, []);

  const save = useCallback(() => {
    saveNotificationPreferences(preferences);
    toast.success(copy.prefsSaved);
  }, [preferences]);

  const permissionHint =
    permission === "granted"
      ? copy.prefsPermissionGranted
      : permission === "denied"
        ? copy.prefsPermissionDenied
        : copy.prefsPermissionDefault;

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <p className="text-sm text-[var(--app-text-muted)]">{permissionHint}</p>

      <Surface className="flex flex-col gap-3 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--app-text-muted)]">
          {copy.alertsSection}
        </p>
        {(Object.keys(ALERT_LABELS) as NotificationAlertType[]).map((alertType) => (
          <label
            key={alertType}
            className="flex cursor-pointer items-start gap-3 text-sm text-[var(--app-text)]"
          >
            <input
              type="checkbox"
              checked={preferences.alerts[alertType]}
              onChange={() => toggleAlert(alertType)}
              className="mt-0.5 size-4 accent-[var(--brand)]"
            />
            <span>{ALERT_LABELS[alertType]}</span>
          </label>
        ))}

        {preferences.alerts.prStale && (
          <label className="flex items-center gap-3 text-sm text-[var(--app-text-muted)]">
            <span className="shrink-0">{copy.staleDaysLabel}</span>
            <input
              type="number"
              min={1}
              max={30}
              value={preferences.staleDaysThreshold}
              onChange={(event) => {
                const value = Number.parseInt(event.target.value, 10);
                if (Number.isNaN(value) || value < 1) {
                  return;
                }
                setPreferences((current) => ({
                  ...current,
                  staleDaysThreshold: value
                }));
              }}
              className="w-16 rounded-md border border-[var(--app-border)] bg-transparent px-2 py-1"
            />
          </label>
        )}
      </Surface>

      <Surface className="flex flex-col gap-3 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--app-text-muted)]">
          {copy.monitoringSection}
        </p>
        <label className="flex cursor-pointer items-start gap-3 text-sm text-[var(--app-text)]">
          <input
            type="checkbox"
            checked={preferences.pollEnabled}
            onChange={() =>
              setPreferences((current) => ({
                ...current,
                pollEnabled: !current.pollEnabled
              }))
            }
            className="mt-0.5 size-4 accent-[var(--brand)]"
          />
          <span>{copy.pollEnabled}</span>
        </label>
        <label className="flex items-center gap-3 text-sm text-[var(--app-text-muted)]">
          <span className="shrink-0">{copy.pollIntervalSeconds}</span>
          <input
            type="number"
            min={MIN_POLL_INTERVAL_SECONDS}
            max={600}
            value={preferences.pollIntervalSeconds}
            disabled={!preferences.pollEnabled}
            onChange={(event) => {
              const value = Number.parseInt(event.target.value, 10);
              if (Number.isNaN(value) || value < MIN_POLL_INTERVAL_SECONDS) {
                return;
              }
              setPreferences((current) => ({
                ...current,
                pollIntervalSeconds: value
              }));
            }}
            className="w-20 rounded-md border border-[var(--app-border)] bg-transparent px-2 py-1 disabled:opacity-50"
          />
        </label>
        <div className="flex flex-wrap items-center gap-3 text-sm text-[var(--app-text-muted)]">
          <label className="flex items-center gap-2">
            <span className="shrink-0">{copy.workdayStartHour}</span>
            <input
              type="number"
              min={0}
              max={23}
              value={preferences.workdayStartHour}
              disabled={!preferences.pollEnabled}
              onChange={(event) => {
                const value = Number.parseInt(event.target.value, 10);
                if (Number.isNaN(value) || value < 0 || value > 23) {
                  return;
                }
                setPreferences((current) => ({
                  ...current,
                  workdayStartHour: value
                }));
              }}
              className="w-16 rounded-md border border-[var(--app-border)] bg-transparent px-2 py-1 disabled:opacity-50"
            />
          </label>
          <label className="flex items-center gap-2">
            <span className="shrink-0">{copy.workdayEndHour}</span>
            <input
              type="number"
              min={1}
              max={24}
              value={preferences.workdayEndHour}
              disabled={!preferences.pollEnabled}
              onChange={(event) => {
                const value = Number.parseInt(event.target.value, 10);
                if (Number.isNaN(value) || value < 1 || value > 24) {
                  return;
                }
                setPreferences((current) => ({
                  ...current,
                  workdayEndHour: value
                }));
              }}
              className="w-16 rounded-md border border-[var(--app-border)] bg-transparent px-2 py-1 disabled:opacity-50"
            />
          </label>
        </div>
        <label className="flex cursor-pointer items-start gap-3 text-sm text-[var(--app-text)]">
          <input
            type="checkbox"
            checked={preferences.soundEnabled}
            onChange={() =>
              setPreferences((current) => ({
                ...current,
                soundEnabled: !current.soundEnabled
              }))
            }
            className="mt-0.5 size-4 accent-[var(--brand)]"
          />
          <span>{copy.soundEnabled}</span>
        </label>
      </Surface>

      <div className="flex flex-wrap items-center justify-between gap-2">
        {permission !== "granted" && permission !== "denied" ? (
          <Button type="button" variant="outline" onClick={() => void requestPermission()}>
            {copy.allowBrowserNotifications}
          </Button>
        ) : (
          <span />
        )}
        <Button type="button" onClick={save}>
          {copy.savePreferences}
        </Button>
      </div>
    </div>
  );
}
