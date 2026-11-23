import { z } from "zod";
import type { AiReviewFieldDefaults, PrAiReviewConfigDto } from "@/modules/pr-ai-review/lib/domain";

const loginListSchema = z
  .string()
  .optional()
  .transform((raw) =>
    [
      ...new Set(
        (raw ?? "")
          .split(/[\s,]+/)
          .map((login) => login.trim().replace(/^@/, "").toLowerCase())
          .filter((login) => /^[a-z0-9-]{1,39}$/.test(login))
      )
    ]
  );

const trimmedSchema = z
  .string()
  .optional()
  .transform((raw) => raw?.trim() ?? "");

const envSchema = z.object({
  PR_AI_REVIEW_AUTHORS: loginListSchema,
  PR_AI_REVIEW_REPO_PATTERN: trimmedSchema,
  PR_AI_REVIEW_CWD: trimmedSchema
});

/** Defaults the reviewer falls back to when a field was never edited (stored empty). */
export function readAiReviewEnvDefaults(env: Record<string, string | undefined> = process.env): AiReviewFieldDefaults {
  const parsed = envSchema.parse(env);
  return {
    authorLogins: parsed.PR_AI_REVIEW_AUTHORS,
    repoPattern: parsed.PR_AI_REVIEW_REPO_PATTERN,
    cwd: parsed.PR_AI_REVIEW_CWD || null
  };
}

export type EffectiveAiReviewSettings = AiReviewFieldDefaults;

/** Stored value when the user edited the field; the env default otherwise. */
export function resolveAiReviewSettings(
  config: Pick<PrAiReviewConfigDto, "authorLogins" | "repoPattern" | "cwd" | "defaults">
): EffectiveAiReviewSettings {
  return {
    authorLogins: config.authorLogins.length > 0 ? config.authorLogins : config.defaults.authorLogins,
    repoPattern: config.repoPattern !== "" ? config.repoPattern : config.defaults.repoPattern,
    cwd: config.cwd ?? config.defaults.cwd
  };
}
