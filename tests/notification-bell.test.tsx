import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { NotificationBell } from "@/modules/notifications/components/notification-bell";
import {
  clearNotificationInbox,
  loadNotificationInbox,
  pushNotificationInboxItem
} from "@/modules/notifications/lib/notification-inbox";

describe("NotificationBell", () => {
  afterEach(() => {
    clearNotificationInbox();
  });

  it("keeps the bell visible when the inbox is empty", async () => {
    render(<NotificationBell />);

    const trigger = screen.getByRole("button", { name: /nenhum não lido/i });
    fireEvent.click(trigger);

    expect(await screen.findByText("Nenhum alerta recente.")).toBeInTheDocument();
  });

  it("shows the bell with a badge and opens the inbox without marking items read", async () => {
    pushNotificationInboxItem({
      id: "PR_1:approved",
      title: "PR #1: Aprovada",
      body: "Revisão pendente → Aprovada"
    });

    render(<NotificationBell />);

    fireEvent.click(screen.getByRole("button", { name: /1 alerta não lido/i }));

    expect(await screen.findByRole("heading", { name: "Alertas recentes" })).toBeInTheDocument();
    expect(screen.getByText("PR #1: Aprovada")).toBeInTheDocument();
    expect(screen.getByText("Revisão pendente → Aprovada")).toBeInTheDocument();
    expect(loadNotificationInbox()[0]?.read).toBe(false);
  });

  it("marks a single item read and unread, and keeps the bell after reading", async () => {
    pushNotificationInboxItem({ id: "a", title: "Alerta A", body: "a" });

    render(<NotificationBell />);
    fireEvent.click(screen.getByRole("button", { name: /1 alerta não lido/i }));

    const item = (await screen.findByText("Alerta A")).closest("li")!;
    fireEvent.click(within(item).getByRole("button", { name: "Marcar como lida" }));

    expect(loadNotificationInbox()[0]?.read).toBe(true);
    expect(screen.getByRole("button", { name: /nenhum não lido/i })).toBeInTheDocument();
    expect(screen.getByText("Alerta A")).toBeInTheDocument();

    fireEvent.click(within(item).getByRole("button", { name: "Marcar como não lida" }));
    expect(loadNotificationInbox()[0]?.read).toBe(false);
  });

  it("deletes a single item and clears all", async () => {
    pushNotificationInboxItem({ id: "a", title: "Alerta A", body: "a" });
    pushNotificationInboxItem({ id: "b", title: "Alerta B", body: "b" });

    render(<NotificationBell />);
    fireEvent.click(screen.getByRole("button", { name: /2 alertas não lidos/i }));

    const itemA = (await screen.findByText("Alerta A")).closest("li")!;
    fireEvent.click(within(itemA).getByRole("button", { name: "Apagar alerta" }));

    expect(screen.queryByText("Alerta A")).not.toBeInTheDocument();
    expect(loadNotificationInbox().map((item) => item.id)).toEqual(["b"]);

    fireEvent.click(screen.getByRole("button", { name: "Limpar tudo" }));
    expect(loadNotificationInbox()).toEqual([]);
    expect(screen.getByText("Nenhum alerta recente.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /nenhum não lido/i })).toBeInTheDocument();
  });
});
