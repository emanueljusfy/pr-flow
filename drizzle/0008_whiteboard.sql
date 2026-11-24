CREATE TABLE `whiteboard_records` (
	`id` text PRIMARY KEY NOT NULL,
	`type_name` text NOT NULL,
	`record` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `whiteboard_meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
