CREATE TABLE `pr_ai_review_config` (
	`id` text PRIMARY KEY DEFAULT 'default' NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`interval_minutes` integer DEFAULT 15 NOT NULL,
	`agent_id` text DEFAULT 'claude' NOT NULL,
	`cwd` text,
	`author_logins` text DEFAULT '[]' NOT NULL,
	`repo_pattern` text DEFAULT '' NOT NULL,
	`prompt_template` text,
	`next_run_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `pr_ai_review_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`cycle_id` text,
	`pr_url` text NOT NULL,
	`repository` text NOT NULL,
	`pr_number` integer NOT NULL,
	`pr_title` text DEFAULT '' NOT NULL,
	`head_sha` text DEFAULT '' NOT NULL,
	`trigger` text NOT NULL,
	`status` text NOT NULL,
	`reason` text,
	`verdict` text,
	`review_url` text,
	`slack_reaction` text,
	`stdout` text,
	`stderr` text,
	`cost_usd` real,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`acked_at` integer
);
--> statement-breakpoint
CREATE INDEX `pr_ai_review_runs_pr_head_idx` ON `pr_ai_review_runs` (`pr_url`,`head_sha`);
--> statement-breakpoint
INSERT INTO `pr_ai_review_config` (`id`, `enabled`, `interval_minutes`, `agent_id`, `cwd`, `author_logins`, `repo_pattern`, `prompt_template`, `next_run_at`, `updated_at`)
SELECT 'default', `enabled`,
	CASE WHEN `interval_minutes` IN (5, 15, 30, 60, 360, 1440) THEN `interval_minutes` ELSE 15 END,
	`agent_id`, `cwd`,
	'["leocaldeirajusfy","felipegmotta","cavanus","davi-graciano-costa"]', 'justracker-*', NULL,
	CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM `routines` WHERE `name` = 'PR Review' ORDER BY `created_at` LIMIT 1;
--> statement-breakpoint
INSERT OR IGNORE INTO `pr_ai_review_config` (`id`, `enabled`, `interval_minutes`, `agent_id`, `cwd`, `author_logins`, `repo_pattern`, `prompt_template`, `next_run_at`, `updated_at`)
VALUES ('default', 0, 15, 'claude', NULL, '[]', '', NULL, CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000);
--> statement-breakpoint
DROP TABLE `routine_runs`;
--> statement-breakpoint
DROP TABLE `routines`;
