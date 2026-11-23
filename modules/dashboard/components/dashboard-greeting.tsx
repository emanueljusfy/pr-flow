"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { useNow } from "@/hooks/use-now";
import {
  formatDashboardDateline,
  greetingForHour
} from "@/modules/dashboard/lib/dashboard-greeting";

export function DashboardGreeting() {
  const now = useNow();

  return (
    <div className="flex min-h-12 flex-col justify-end gap-1" data-testid="dashboard-greeting">
      {now ? (
        <>
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--app-text-muted)]">
            {formatDashboardDateline(now)}
          </p>
          <p className="text-2xl font-semibold tracking-tight text-[var(--app-text)]">
            {greetingForHour(now.getHours())}
          </p>
        </>
      ) : (
        <>
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-7 w-32" />
        </>
      )}
    </div>
  );
}
