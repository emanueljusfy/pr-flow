"use client";

import { useEffect, useState } from "react";

/**
 * Current time, refreshed every `intervalMs`. Starts as `null` so server and
 * first client render match; time-dependent UI fills in after mount.
 */
export function useNow(intervalMs = 60_000): Date | null {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);

  return now;
}
