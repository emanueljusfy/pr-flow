CREATE TABLE `routines` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`prompt` text NOT NULL,
	`agent_id` text NOT NULL,
	`schedule_kind` text NOT NULL,
	`interval_minutes` integer,
	`cron_expr` text,
	`cwd` text,
	`notify_slack` integer DEFAULT false NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`next_run_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `routine_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`routine_id` text NOT NULL,
	`status` text NOT NULL,
	`reason` text,
	`stdout` text,
	`stderr` text,
	`slack_skipped` integer,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`acked_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`routine_id`) REFERENCES `routines`(`id`) ON UPDATE no action ON DELETE cascade
);
