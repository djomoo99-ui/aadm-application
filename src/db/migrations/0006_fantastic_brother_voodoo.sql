CREATE TABLE `association_meetings` (
	`id` text PRIMARY KEY NOT NULL,
	`meeting_date` text NOT NULL,
	`year` integer NOT NULL,
	`month_number` integer NOT NULL,
	`label` text NOT NULL,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`source` text DEFAULT 'system' NOT NULL,
	`created_by` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "association_meetings_year_valid" CHECK("association_meetings"."year" BETWEEN 2021 AND 2100),
	CONSTRAINT "association_meetings_month_valid" CHECK("association_meetings"."month_number" BETWEEN 1 AND 12)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `association_meetings_date_unique` ON `association_meetings` (`meeting_date`);--> statement-breakpoint
CREATE INDEX `association_meetings_year_idx` ON `association_meetings` (`year`,`meeting_date`);--> statement-breakpoint
CREATE TABLE `due_generation_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`year` integer NOT NULL,
	`created_due_count` integer DEFAULT 0 NOT NULL,
	`skipped_due_count` integer DEFAULT 0 NOT NULL,
	`created_meeting_count` integer DEFAULT 0 NOT NULL,
	`created_by` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "due_generation_runs_year_valid" CHECK("due_generation_runs"."year" BETWEEN 2021 AND 2100),
	CONSTRAINT "due_generation_runs_counts_non_negative" CHECK("due_generation_runs"."created_due_count" >= 0 AND "due_generation_runs"."skipped_due_count" >= 0 AND "due_generation_runs"."created_meeting_count" >= 0)
);
--> statement-breakpoint
CREATE INDEX `due_generation_runs_year_idx` ON `due_generation_runs` (`year`,`created_at`);