import type { RoutineRunDto, RoutineRunStatus } from "@/modules/routines/lib/domain";

export const ROUTINE_LOGS_POLL_MS = 3_000;

const startNotifiedRunIds = new Set<string>();

export function resetRoutineRunStartNotificationsForTests(): void {
  startNotifiedRunIds.clear();
}

export function hasRoutineRunStartBeenNotified(runId: string): boolean {
  return startNotifiedRunIds.has(runId);
}

export function markRoutineRunStartNotified(runId: string): void {
  startNotifiedRunIds.add(runId);
}

/** On first poll after mount, seed without toasting already-running runs. */
export function seedRoutineRunStartNotifications(runIds: string[]): void {
  for (const id of runIds) {
    startNotifiedRunIds.add(id);
  }
}

export function routineHasRunningRun(runs: RoutineRunDto[], routineId: string): boolean {
  return runs.some((run) => run.routineId === routineId && run.status === "running");
}

export function isTerminalRoutineRunStatus(status: RoutineRunStatus): boolean {
  return status === "succeeded" || status === "failed";
}
