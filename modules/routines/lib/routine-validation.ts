import path from "node:path";
import { z } from "zod";
import { isKnownAgentId } from "@/modules/routines/lib/agent-registry";
import { PRESET_INTERVAL_MINUTES } from "@/modules/routines/lib/domain";
import { isValidCronExpression } from "@/modules/routines/lib/routine-schedule";

const presetIntervalSchema = z.union(
  PRESET_INTERVAL_MINUTES.map((value) => z.literal(value)) as [
    z.ZodLiteral<(typeof PRESET_INTERVAL_MINUTES)[number]>,
    ...z.ZodLiteral<(typeof PRESET_INTERVAL_MINUTES)[number]>[]
  ]
);

const createBaseSchema = z.object({
  name: z.string().trim().min(1).max(120),
  prompt: z.string().trim().min(1).max(50_000),
  agentId: z.string().trim().min(1),
  scheduleKind: z.enum(["preset", "cron"]),
  intervalMinutes: z.number().int().optional().nullable(),
  cronExpr: z.string().trim().optional().nullable(),
  cwd: z.string().trim().optional().nullable(),
  notifySlack: z.boolean().optional().default(false),
  enabled: z.boolean().optional().default(true)
});

export type CreateRoutineInput = z.input<typeof createBaseSchema>;
export type ValidatedCreateRoutineInput = z.output<typeof createBaseSchema> & {
  intervalMinutes: number | null;
  cronExpr: string | null;
  cwd: string | null;
};

export type UpdateRoutineInput = Partial<CreateRoutineInput>;

/**
 * Create/update only require an absolute path. Existence is checked at run time
 * (`assertRoutineCwd`) so Docker can accept host paths that are mounted later
 * (e.g. JUSFY_ROOT) without failing the save.
 */
function cwdError(cwd: string | null | undefined): string | null {
  if (cwd == null || cwd === "") {
    return null;
  }
  if (!path.isAbsolute(cwd)) {
    return "cwd deve ser um caminho absoluto.";
  }
  return null;
}

function scheduleErrors(input: {
  scheduleKind: "preset" | "cron";
  intervalMinutes?: number | null;
  cronExpr?: string | null;
}): Record<string, string> {
  const errors: Record<string, string> = {};
  if (input.scheduleKind === "preset") {
    const parsed = presetIntervalSchema.safeParse(input.intervalMinutes);
    if (!parsed.success) {
      errors.intervalMinutes = `intervalMinutes deve ser um de: ${PRESET_INTERVAL_MINUTES.join(", ")}.`;
    }
  } else {
    const expr = input.cronExpr?.trim() ?? "";
    if (!expr) {
      errors.cronExpr = "cronExpr é obrigatório para schedule cron.";
    } else if (!isValidCronExpression(expr)) {
      errors.cronExpr = "Expressão cron inválida.";
    }
  }
  return errors;
}

function fieldErrorsFromZod(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !errors[key]) {
      errors[key] = issue.message;
    }
  }
  return errors;
}

export function validateCreateRoutineInput(
  input: unknown
): { ok: true; value: ValidatedCreateRoutineInput } | { ok: false; errors: Record<string, string> } {
  const parsed = createBaseSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errors: fieldErrorsFromZod(parsed.error) };
  }

  const value = parsed.data;
  const errors: Record<string, string> = {};

  if (!isKnownAgentId(value.agentId)) {
    errors.agentId = "agentId desconhecido. Use um adapter registrado.";
  }

  Object.assign(errors, scheduleErrors(value));

  const cwdErr = cwdError(value.cwd);
  if (cwdErr) {
    errors.cwd = cwdErr;
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      ...value,
      intervalMinutes: value.scheduleKind === "preset" ? (value.intervalMinutes ?? null) : null,
      cronExpr: value.scheduleKind === "cron" ? (value.cronExpr?.trim() ?? null) : null,
      cwd: value.cwd?.trim() ? value.cwd.trim() : null
    }
  };
}

export function validateUpdateRoutineInput(
  input: unknown
):
  | { ok: true; value: Partial<ValidatedCreateRoutineInput> }
  | { ok: false; errors: Record<string, string> } {
  const partialSchema = createBaseSchema.partial();
  const parsed = partialSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errors: fieldErrorsFromZod(parsed.error) };
  }

  const value = parsed.data;
  const errors: Record<string, string> = {};

  if (value.agentId !== undefined && !isKnownAgentId(value.agentId)) {
    errors.agentId = "agentId desconhecido. Use um adapter registrado.";
  }

  if (value.scheduleKind !== undefined) {
    Object.assign(
      errors,
      scheduleErrors({
        scheduleKind: value.scheduleKind,
        intervalMinutes: value.intervalMinutes,
        cronExpr: value.cronExpr
      })
    );
  } else if (value.intervalMinutes !== undefined || value.cronExpr !== undefined) {
    // schedule fields without kind — reject ambiguous update
    errors.scheduleKind = "Informe scheduleKind ao alterar a frequência.";
  }

  if (value.cwd !== undefined) {
    const cwdErr = cwdError(value.cwd);
    if (cwdErr) {
      errors.cwd = cwdErr;
    }
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  const next: Partial<ValidatedCreateRoutineInput> = { ...value };
  if (value.cwd !== undefined) {
    next.cwd = value.cwd?.trim() ? value.cwd.trim() : null;
  }
  if (value.scheduleKind === "preset") {
    next.cronExpr = null;
    next.intervalMinutes = value.intervalMinutes ?? null;
  }
  if (value.scheduleKind === "cron") {
    next.intervalMinutes = null;
    next.cronExpr = value.cronExpr?.trim() ?? null;
  }

  return { ok: true, value: next };
}

export const ackRunsSchema = z.object({
  runIds: z.array(z.string().uuid()).min(1).max(100)
});

export function validateAckRunsInput(
  input: unknown
): { ok: true; value: { runIds: string[] } } | { ok: false; errors: Record<string, string> } {
  const parsed = ackRunsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errors: fieldErrorsFromZod(parsed.error) };
  }
  return { ok: true, value: parsed.data };
}
