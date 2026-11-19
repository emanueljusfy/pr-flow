export type ScheduleKind = "preset" | "cron";

export type RoutineDto = {
  id: string;
  name: string;
  prompt: string;
  agentId: string;
  scheduleKind: ScheduleKind;
  intervalMinutes: number | null;
  cronExpr: string | null;
  cwd: string | null;
  notifySlack: boolean;
  enabled: boolean;
  nextRunAt: string;
  createdAt: string;
  updatedAt: string;
};

export type RoutineRunStatus = "running" | "succeeded" | "failed";

export type RoutineRunDto = {
  id: string;
  routineId: string;
  routineName?: string;
  status: RoutineRunStatus;
  reason: string | null;
  stdout: string | null;
  stderr: string | null;
  slackSkipped: boolean | null;
  startedAt: string;
  finishedAt: string | null;
  ackedAt: string | null;
};

export type RoutineAgentInfo = {
  id: string;
  label: string;
  binary: string;
  installed: boolean;
};

export const PRESET_INTERVAL_MINUTES = [5, 15, 30, 60, 360, 1440] as const;
export type PresetIntervalMinutes = (typeof PRESET_INTERVAL_MINUTES)[number];

export const ROUTINE_OUTPUT_TRUNCATE_CHARS = 100_000;
export const ROUTINE_RUN_TIMEOUT_MS = 12 * 60 * 1000;
