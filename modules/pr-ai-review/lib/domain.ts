export const AI_REVIEW_CONFIG_ID = "default";

export const AI_REVIEW_INTERVAL_PRESETS = [5, 15, 30, 60, 360, 1440] as const;
export type AiReviewIntervalMinutes = (typeof AI_REVIEW_INTERVAL_PRESETS)[number];

export const AI_REVIEW_OUTPUT_TRUNCATE_CHARS = 100_000;
export const AI_REVIEW_RUN_TIMEOUT_MS = 12 * 60 * 1000;
/** Grace after agent timeout before a `running` row is treated as orphaned (process crash / restart). */
export const AI_REVIEW_STALE_RUN_GRACE_MS = 2 * 60 * 1000;
export const AI_REVIEW_STALE_RUN_MS = AI_REVIEW_RUN_TIMEOUT_MS + AI_REVIEW_STALE_RUN_GRACE_MS;
export const AI_REVIEW_STALE_RUN_REASON = "stale";
export const AI_REVIEW_LOGS_POLL_MS = 3_000;

export type AiReviewVerdict = "APPROVE" | "COMMENT" | "REQUEST_CHANGES";
export type AiReviewRunStatus = "running" | "succeeded" | "failed";
export type AiReviewTrigger = "cron" | "manual";
export type AiReviewSlackReaction = "reacted" | "already_reacted" | "not_found" | "error" | "skipped";

export type PrAiReviewConfigDto = {
  enabled: boolean;
  intervalMinutes: number;
  agentId: string;
  cwd: string | null;
  authorLogins: string[];
  repoPattern: string;
  promptTemplate: string;
  /** True when `promptTemplate` is the built-in default (nothing stored). */
  promptIsDefault: boolean;
  nextRunAt: string;
  updatedAt: string;
};

export type PrAiReviewRunDto = {
  id: string;
  cycleId: string | null;
  prUrl: string;
  repository: string;
  prNumber: number;
  prTitle: string;
  headSha: string;
  trigger: AiReviewTrigger;
  status: AiReviewRunStatus;
  reason: string | null;
  verdict: AiReviewVerdict | null;
  reviewUrl: string | null;
  slackReaction: AiReviewSlackReaction | null;
  stdout: string | null;
  stderr: string | null;
  costUsd: number | null;
  startedAt: string;
  finishedAt: string | null;
  ackedAt: string | null;
};

export type AiReviewAgentInfo = {
  id: string;
  label: string;
  binary: string;
  installed: boolean;
};

/** PR fields the reviewer needs; a subset of the reviewer queue entry. */
export type AiReviewPr = {
  url: string;
  repository: string;
  number: number;
  title: string;
  authorLogin: string;
  headSha: string;
};
