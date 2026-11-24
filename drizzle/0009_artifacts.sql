CREATE TABLE `artifacts` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `artifact_tabs` (
	`id` text PRIMARY KEY NOT NULL,
	`artifact_id` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`position` integer NOT NULL,
	`revision` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`artifact_id`) REFERENCES `artifacts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `artifact_tabs_artifact_idx` ON `artifact_tabs` (`artifact_id`);
--> statement-breakpoint
CREATE TABLE `artifact_versions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`artifact_id` text NOT NULL,
	`number` integer NOT NULL,
	`source` text NOT NULL,
	`restored_from` integer,
	`title` text NOT NULL,
	`tabs` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`artifact_id`) REFERENCES `artifacts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `artifact_versions_artifact_id_number_unique` ON `artifact_versions` (`artifact_id`,`number`);
