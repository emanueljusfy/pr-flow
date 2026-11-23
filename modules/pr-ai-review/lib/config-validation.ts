import { z } from "zod";
import { isKnownAgentId } from "@/modules/pr-ai-review/lib/agent-registry";
import { isUsableCwd } from "@/modules/pr-ai-review/lib/agent-runner";
import { AI_REVIEW_INTERVAL_PRESETS } from "@/modules/pr-ai-review/lib/domain";
import { hasRequiredPlaceholder } from "@/modules/pr-ai-review/lib/prompt-template";
import type { AiReviewConfigPatch } from "@/modules/pr-ai-review/lib/repository";

export const AI_REVIEW_CONFIG_MESSAGES = {
  invalidBody: "Corpo da requisição inválido.",
  missingPlaceholder: "O prompt precisa conter {{pr_url}}.",
  interval: `O intervalo deve ser um de: ${AI_REVIEW_INTERVAL_PRESETS.join(", ")} minutos.`,
  agent: "Agente desconhecido.",
  cwd: "O diretório de trabalho precisa ser um caminho absoluto que exista."
} as const;

const loginSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/^@/, ""))
  .pipe(z.string().regex(/^[A-Za-z0-9-]{1,39}$/));

const configPutSchema = z
  .object({
    enabled: z.boolean(),
    intervalMinutes: z.number().int(),
    agentId: z.string().trim().min(1),
    cwd: z.string().trim().nullable(),
    authorLogins: z.array(loginSchema).max(50),
    repoPattern: z.string().trim().max(500),
    promptTemplate: z.string().max(50_000).nullable()
  })
  .partial()
  .strict();

export type AiReviewConfigInput = z.input<typeof configPutSchema>;

export type ConfigValidationResult =
  | { ok: true; patch: AiReviewConfigPatch }
  | { ok: false; error: string };

export function validateAiReviewConfigInput(body: unknown): ConfigValidationResult {
  const parsed = configPutSchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, error: AI_REVIEW_CONFIG_MESSAGES.invalidBody };
  }
  const input = parsed.data;
  const patch: AiReviewConfigPatch = {};

  if (input.intervalMinutes !== undefined) {
    if (!(AI_REVIEW_INTERVAL_PRESETS as readonly number[]).includes(input.intervalMinutes)) {
      return { ok: false, error: AI_REVIEW_CONFIG_MESSAGES.interval };
    }
    patch.intervalMinutes = input.intervalMinutes;
  }
  if (input.agentId !== undefined) {
    if (!isKnownAgentId(input.agentId)) {
      return { ok: false, error: AI_REVIEW_CONFIG_MESSAGES.agent };
    }
    patch.agentId = input.agentId;
  }
  if (input.cwd !== undefined) {
    const cwd = input.cwd === "" ? null : input.cwd;
    if (cwd !== null && !isUsableCwd(cwd)) {
      return { ok: false, error: AI_REVIEW_CONFIG_MESSAGES.cwd };
    }
    patch.cwd = cwd;
  }
  if (input.promptTemplate !== undefined) {
    if (input.promptTemplate !== null && !hasRequiredPlaceholder(input.promptTemplate)) {
      return { ok: false, error: AI_REVIEW_CONFIG_MESSAGES.missingPlaceholder };
    }
    patch.promptTemplate = input.promptTemplate;
  }
  if (input.authorLogins !== undefined) {
    patch.authorLogins = [...new Set(input.authorLogins.map((login) => login.toLowerCase()))];
  }
  if (input.repoPattern !== undefined) {
    patch.repoPattern = input.repoPattern;
  }
  if (input.enabled !== undefined) {
    patch.enabled = input.enabled;
  }
  return { ok: true, patch };
}
