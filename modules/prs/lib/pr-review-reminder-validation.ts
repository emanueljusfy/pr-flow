import { z } from "zod";
import { isPrReviewReminderScheduleInterval } from "@/modules/prs/lib/core/pr-review-reminder";

export const prReviewReminderScheduleIntervalSchema = z
  .number()
  .int()
  .refine(isPrReviewReminderScheduleInterval, {
    message: "Frequência de lembrete inválida."
  });

export const prReviewReminderBodySchema = z.object({
  url: z.string().url("URL da PR inválida."),
  repository: z
    .string()
    .trim()
    .regex(/^[^/]+\/[^/]+$/, "Repositório inválido. Use owner/repo."),
  number: z.coerce.number().int().positive("Número da PR inválido."),
  message: z
    .string()
    .trim()
    .min(1, "Mensagem de lembrete vazia.")
    .max(65536, "Mensagem de lembrete muito longa.")
    .optional(),
  pendingReviewers: z.array(z.string().trim().min(1)).max(50).optional(),
  scheduleIntervalMinutes: prReviewReminderScheduleIntervalSchema.optional()
});

export const prReviewReminderCancelBodySchema = z.object({
  url: z.string().url("URL da PR inválida.")
});

export type PrReviewReminderBody = z.infer<typeof prReviewReminderBodySchema>;
export type PrReviewReminderCancelBody = z.infer<typeof prReviewReminderCancelBodySchema>;
