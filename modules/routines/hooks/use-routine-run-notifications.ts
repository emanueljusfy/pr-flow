"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { pushNotificationInboxItem } from "@/modules/notifications/lib/notification-inbox";
import { playNotificationSound } from "@/modules/notifications/lib/play-notification-sound";
import { ptBR } from "@/modules/messages/pt-BR";
import type { RoutineRunDto } from "@/modules/routines/lib/domain";
import {
  hasRoutineRunStartBeenNotified,
  markRoutineRunStartNotified,
  seedRoutineRunStartNotifications
} from "@/modules/routines/lib/routine-run-ui";

const POLL_MS = 30_000;

export function notifyRoutineRunStarted(run: Pick<RoutineRunDto, "id" | "routineId" | "routineName">): void {
  if (hasRoutineRunStartBeenNotified(run.id)) {
    return;
  }
  markRoutineRunStartNotified(run.id);
  const name = run.routineName ?? run.routineId;
  const title = ptBR.routines.alertStarted(name);
  const body = ptBR.routines.alertStartedBody;
  pushNotificationInboxItem({
    id: `routine-run-start:${run.id}`,
    title,
    body
  });
  toast(title, { description: body });
}

export function useRoutineRunNotifications(): void {
  const seededRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const [unreadRes, recentRes] = await Promise.all([
          fetch("/api/routines/runs?unread=1&limit=20"),
          fetch("/api/routines/runs?limit=20")
        ]);
        if (!unreadRes.ok || !recentRes.ok || cancelled) {
          return;
        }

        const unread = (await unreadRes.json()) as RoutineRunDto[];
        const recent = (await recentRes.json()) as RoutineRunDto[];
        if (cancelled) {
          return;
        }

        const running = recent.filter((run) => run.status === "running");

        if (!seededRef.current) {
          seedRoutineRunStartNotifications(running.map((run) => run.id));
          seededRef.current = true;
        } else {
          for (const run of running) {
            notifyRoutineRunStarted(run);
          }
        }

        if (unread.length === 0) {
          return;
        }

        const ids: string[] = [];
        for (const run of unread) {
          if (run.status !== "succeeded" && run.status !== "failed") {
            continue;
          }
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

        if (ids.length > 0) {
          await fetch("/api/routines/runs/ack", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ runIds: ids })
          });
        }
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
