import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { NotificationBell } from "@/modules/notifications/components/notification-bell";
import {
  clearNotificationInbox,
  pushNotificationInboxItem
} from "@/modules/notifications/lib/notification-inbox";

describe("NotificationBell", () => {
  afterEach(() => {
    clearNotificationInbox();
  });

  it("renders nothing when the inbox has no unread items", () => {
    const { container } = render(<NotificationBell />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the bell with a badge and opens the inbox", async () => {
    pushNotificationInboxItem({
      id: "PR_1:approved",
      title: "PR #1: Aprovada",
      body: "Revisão pendente → Aprovada"
    });

    render(<NotificationBell />);

    const trigger = screen.getByRole("button", { name: /1 alerta não lido/i });
    expect(trigger).toBeInTheDocument();

    fireEvent.click(trigger);

    expect(await screen.findByRole("heading", { name: "Alertas recentes" })).toBeInTheDocument();
    expect(screen.getByText("PR #1: Aprovada")).toBeInTheDocument();
    expect(screen.getByText("Revisão pendente → Aprovada")).toBeInTheDocument();
  });
});
