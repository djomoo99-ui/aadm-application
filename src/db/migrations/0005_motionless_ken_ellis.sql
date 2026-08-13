PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_reminders` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`kind` text NOT NULL,
	`period_label` text NOT NULL,
	`message` text NOT NULL,
	`recipient_phone` text NOT NULL,
	`status` text DEFAULT 'prepared' NOT NULL,
	`created_by` text NOT NULL,
	`sent_by` text,
	`idempotency_key` text NOT NULL,
	`sent_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "reminders_amount_non_negative" CHECK("__new_reminders"."amount_cents" >= 0)
);--> statement-breakpoint
INSERT INTO `__new_reminders`
  (`id`, `household_id`, `amount_cents`, `kind`, `period_label`, `message`,
   `recipient_phone`, `status`, `created_by`, `sent_by`, `idempotency_key`, `sent_at`, `created_at`)
SELECT r.`id`, r.`household_id`, r.`amount_cents`, 'overdue', r.`period_label`, r.`message`,
       COALESCE(h.`phone`, ''), r.`status`, r.`created_by`, NULL, 'legacy:' || r.`id`, r.`sent_at`, r.`created_at`
  FROM `reminders` r JOIN `households` h ON h.`id` = r.`household_id`;--> statement-breakpoint
DROP TABLE `reminders`;--> statement-breakpoint
ALTER TABLE `__new_reminders` RENAME TO `reminders`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `reminders_household_date_idx` ON `reminders` (`household_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `reminders_idempotency_unique` ON `reminders` (`idempotency_key`);
