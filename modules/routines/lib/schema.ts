import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const routines = sqliteTable("routines", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  prompt: text("prompt").notNull(),
  agentId: text("agent_id").notNull(),
  scheduleKind: text("schedule_kind").notNull(),
  intervalMinutes: integer("interval_minutes"),
  cronExpr: text("cron_expr"),
  cwd: text("cwd"),
  notifySlack: integer("notify_slack", { mode: "boolean" }).notNull().default(false),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  nextRunAt: integer("next_run_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date())
});

export const routineRuns = sqliteTable("routine_runs", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  routineId: text("routine_id")
    .notNull()
    .references(() => routines.id, { onDelete: "cascade" }),
  status: text("status").notNull(),
  reason: text("reason"),
  stdout: text("stdout"),
  stderr: text("stderr"),
  slackSkipped: integer("slack_skipped", { mode: "boolean" }),
  startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
  finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
  ackedAt: integer("acked_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date())
});

export type RoutineRow = typeof routines.$inferSelect;
export type RoutineRunRow = typeof routineRuns.$inferSelect;
