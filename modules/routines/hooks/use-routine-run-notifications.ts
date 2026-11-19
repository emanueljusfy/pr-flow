"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { pushNotificationInboxItem } from "@/modules/notifications/lib/notification-inbox";
import { playNotificationSound } from "@/modules/notifications/lib/play-notification-sound";
import { ptBR } from "@/modules/messages/pt-BR";
import type { RoutineRunDto } from "@/modules/routines/lib/domain";

const POLL_MS = 30_000;

export function useRoutineRunNotifications(): void {
  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const response = await fetch("/api/routines/runs?unread=1&limit=20");
        if (!response.ok || cancelled) {
          return;
        }
        const runs = (await response.json()) as RoutineRunDto[];
        if (runs.length === 0 || cancelled) {
          return;
        }

        const ids: string[] = [];
        for (const run of runs) {
          const name = run.routineName ?? run.routineId;
          const title =
            run.status === "succeeded"
              ? ptBR.routines.alertSucceeded(name)
              : ptBR.routines.alertFailed(name);
          const body = run.reason ?? (run.status === "succeeded" ? "Concluída." : "Falhou.");
          pushNotificationInboxItem({
            id: `routine-run:${run.id}`,
            title,
            body
          });
          toast(title, { description: body });
          ids.push(run.id);
        }

        if (ids.length > 0) {
          playNotificationSound();
        }

        await fetch("/api/routines/runs/ack", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ runIds: ids })
        });
      } catch {
        // Ignore transient poll errors.
      }
    }

    void poll();
    const timer = window.setInterval(() => {
      void poll();
    }, POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);
}
