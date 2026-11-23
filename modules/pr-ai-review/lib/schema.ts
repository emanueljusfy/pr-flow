import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const prAiReviewConfig = sqliteTable("pr_ai_review_config", {
  id: text("id").primaryKey().default("default"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  intervalMinutes: integer("interval_minutes").notNull().default(15),
  agentId: text("agent_id").notNull().default("claude"),
  cwd: text("cwd"),
  /** JSON array of GitHub logins; empty admits any author. */
  authorLogins: text("author_logins").notNull().default("[]"),
  /** Comma-separated globs over the repo name (no owner); empty admits any repo. */
  repoPattern: text("repo_pattern").notNull().default(""),
  /** Null means the built-in default template. */
  promptTemplate: text("prompt_template"),
  nextRunAt: integer("next_run_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull()
});

export const prAiReviewRuns = sqliteTable(
  "pr_ai_review_runs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    cycleId: text("cycle_id"),
    prUrl: text("pr_url").notNull(),
    repository: text("repository").notNull(),
    prNumber: integer("pr_number").notNull(),
    prTitle: text("pr_title").notNull().default(""),
    headSha: text("head_sha").notNull().default(""),
    trigger: text("trigger").notNull(),
    status: text("status").notNull(),
    reason: text("reason"),
    verdict: text("verdict"),
    reviewUrl: text("review_url"),
    slackReaction: text("slack_reaction"),
    stdout: text("stdout"),
    stderr: text("stderr"),
    costUsd: real("cost_usd"),
    startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
    finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
    ackedAt: integer("acked_at", { mode: "timestamp_ms" })
  },
  (table) => [index("pr_ai_review_runs_pr_head_idx").on(table.prUrl, table.headSha)]
);

export type PrAiReviewConfigRow = typeof prAiReviewConfig.$inferSelect;
export type PrAiReviewRunRow = typeof prAiReviewRuns.$inferSelect;
