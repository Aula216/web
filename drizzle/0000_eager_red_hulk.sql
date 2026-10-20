CREATE TABLE `audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`detail` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_created_at_idx` ON `audit_log` (`created_at`);--> statement-breakpoint
CREATE TABLE `books` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`isbn` text,
	`title` text NOT NULL,
	`author` text DEFAULT 'Autor no registrado' NOT NULL,
	`publisher` text DEFAULT '' NOT NULL,
	`publish_year` text DEFAULT '' NOT NULL,
	`category` text DEFAULT 'General' NOT NULL,
	`shelf` text DEFAULT 'Sin asignar' NOT NULL,
	`cover_url` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `books_isbn_unique` ON `books` (`isbn`);--> statement-breakpoint
CREATE TABLE `copies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`book_id` integer NOT NULL,
	`code` text NOT NULL,
	`status` text DEFAULT 'available' NOT NULL,
	`condition` text DEFAULT 'Bueno' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `copies_code_unique` ON `copies` (`code`);--> statement-breakpoint
CREATE INDEX `copies_book_id_idx` ON `copies` (`book_id`);--> statement-breakpoint
CREATE TABLE `loans` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`copy_id` integer NOT NULL,
	`reader_id` integer NOT NULL,
	`borrowed_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`due_at` text NOT NULL,
	`returned_at` text,
	`notes` text DEFAULT '' NOT NULL,
	`created_by` text DEFAULT 'sistema' NOT NULL,
	FOREIGN KEY (`copy_id`) REFERENCES `copies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reader_id`) REFERENCES `readers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `loans_reader_id_idx` ON `loans` (`reader_id`);--> statement-breakpoint
CREATE INDEX `loans_due_at_idx` ON `loans` (`due_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `loans_one_active_per_copy` ON `loans` (`copy_id`) WHERE "loans"."returned_at" IS NULL;--> statement-breakpoint
CREATE TABLE `readers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`document` text NOT NULL,
	`name` text NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `readers_document_unique` ON `readers` (`document`);--> statement-breakpoint
CREATE INDEX `readers_name_idx` ON `readers` (`name`);