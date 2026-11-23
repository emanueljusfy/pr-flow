import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotificationPreferencesPanel } from "@/modules/notifications/components/notification-preferences-panel";
import {
  clearNotificationPreferences,
  loadNotificationPreferences
} from "@/modules/notifications/lib/notification-preferences";

vi.mock("@/modules/notifications/hooks/use-app-notifications", () => ({
  useAppNotifications: () => ({
    permission: "default",
    requestPermission: vi.fn()
  })
}));

describe("NotificationPreferencesPanel", () => {
  afterEach(() => {
    clearNotificationPreferences();
  });

  it("lets the user disable alert types and persist them", () => {
    render(<NotificationPreferencesPanel />);

    fireEvent.click(screen.getByRole("checkbox", { name: /PR aprovada/i }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar preferências" }));

    expect(loadNotificationPreferences().alerts.prApproved).toBe(false);
  });

  it("lets the user toggle sound and poll monitoring prefs", () => {
    render(<NotificationPreferencesPanel />);

    fireEvent.click(screen.getByRole("checkbox", { name: /Alerta sonoro/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Sync rápido no expediente/i }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar preferências" }));

    const loaded = loadNotificationPreferences();
    expect(loaded.soundEnabled).toBe(false);
    expect(loaded.pollEnabled).toBe(false);
  });
});

