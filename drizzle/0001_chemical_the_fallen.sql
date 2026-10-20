CREATE TABLE `collaborators` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`position` text DEFAULT 'Encargado de biblioteca' NOT NULL,
	`role` text DEFAULT 'staff' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`requested_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`approved_at` text,
	`approved_by` text,
	`last_seen_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `collaborators_email_unique` ON `collaborators` (`email`);--> statement-breakpoint
CREATE INDEX `collaborators_status_idx` ON `collaborators` (`status`);--> statement-breakpoint
CREATE TABLE `inventory_checks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` integer NOT NULL,
	`copy_id` integer NOT NULL,
	`result` text DEFAULT 'present' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`checked_by` text NOT NULL,
	`checked_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `inventory_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`copy_id`) REFERENCES `copies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inventory_checks_session_copy_unique` ON `inventory_checks` (`session_id`,`copy_id`);--> statement-breakpoint
CREATE INDEX `inventory_checks_session_idx` ON `inventory_checks` (`session_id`);--> statement-breakpoint
CREATE TABLE `inventory_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`started_by` text NOT NULL,
	`started_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`closed_by` text,
	`closed_at` text
);
--> statement-breakpoint
CREATE INDEX `inventory_sessions_status_idx` ON `inventory_sessions` (`status`);