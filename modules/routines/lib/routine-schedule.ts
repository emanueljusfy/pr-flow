import { parseExpression } from "cron-parser";
import { resolveSummaryCronTimezone } from "@/modules/cron-scheduling/lib/summary-timezone";
import {
  PRESET_INTERVAL_MINUTES,
  type PresetIntervalMinutes,
  type ScheduleKind
} from "@/modules/routines/lib/domain";

export function isPresetIntervalMinutes(value: number): value is PresetIntervalMinutes {
  return (PRESET_INTERVAL_MINUTES as readonly number[]).includes(value);
}

export function computeNextPresetRunAt(
  from: Date,
  intervalMinutes: PresetIntervalMinutes
): Date {
  return new Date(from.getTime() + intervalMinutes * 60_000);
}

export function isValidCronExpression(cronExpr: string, env = process.env): boolean {
  try {
    parseExpression(cronExpr, { tz: resolveSummaryCronTimezone(env) });
    return true;
  } catch {
    return false;
  }
}

export function computeNextCronRunAt(from: Date, cronExpr: string, env = process.env): Date {
  const interval = parseExpression(cronExpr, {
    currentDate: from,
    tz: resolveSummaryCronTimezone(env)
  });
  return interval.next().toDate();
}

export function computeNextRunAt(input: {
  scheduleKind: ScheduleKind;
  intervalMinutes?: number | null;
  cronExpr?: string | null;
  from?: Date;
  env?: NodeJS.ProcessEnv;
}): Date {
  const from = input.from ?? new Date();
  if (input.scheduleKind === "preset") {
    if (!input.intervalMinutes || !isPresetIntervalMinutes(input.intervalMinutes)) {
      throw new Error("intervalMinutes inválido para preset.");
    }
    return computeNextPresetRunAt(from, input.intervalMinutes);
  }

  if (!input.cronExpr) {
    throw new Error("cronExpr obrigatório para schedule cron.");
  }
  return computeNextCronRunAt(from, input.cronExpr, input.env);
}
