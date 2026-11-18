CREATE TABLE `pr_review_reminder_schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`pr_url` text NOT NULL,
	`repository` text NOT NULL,
	`number` integer NOT NULL,
	`interval_minutes` integer NOT NULL,
	`message` text,
	`enabled` integer DEFAULT true NOT NULL,
	`next_run_at` integer NOT NULL,
	`last_reminded_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pr_review_reminder_schedules_pr_url_unique` ON `pr_review_reminder_schedules` (`pr_url`);
