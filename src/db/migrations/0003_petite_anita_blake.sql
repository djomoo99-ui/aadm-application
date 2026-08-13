PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`receipt_number` text NOT NULL,
	`household_id` text NOT NULL,
	`member_id` text,
	`amount_cents` integer NOT NULL,
	`unallocated_amount_cents` integer DEFAULT 0 NOT NULL,
	`payment_date` text NOT NULL,
	`method` text DEFAULT 'cash' NOT NULL,
	`status` text DEFAULT 'posted' NOT NULL,
	`recorded_by` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`note` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "payments_amount_positive" CHECK("__new_payments"."amount_cents" > 0),
	CONSTRAINT "payments_unallocated_non_negative" CHECK("__new_payments"."unallocated_amount_cents" >= 0),
	CONSTRAINT "payments_unallocated_not_greater" CHECK("__new_payments"."unallocated_amount_cents" <= "__new_payments"."amount_cents")
);
--> statement-breakpoint
INSERT INTO `__new_payments`("id", "receipt_number", "household_id", "member_id", "amount_cents", "unallocated_amount_cents", "payment_date", "method", "status", "recorded_by", "idempotency_key", "note", "created_at") SELECT "id", "receipt_number", "household_id", "member_id", "amount_cents", 0, "payment_date", "method", "status", "recorded_by", "idempotency_key", "note", "created_at" FROM `payments`;--> statement-breakpoint
DROP TABLE `payments`;--> statement-breakpoint
ALTER TABLE `__new_payments` RENAME TO `payments`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `payments_receipt_unique` ON `payments` (`receipt_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `payments_idempotency_unique` ON `payments` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `payments_household_date_idx` ON `payments` (`household_id`,`payment_date`);--> statement-breakpoint
CREATE INDEX `payments_recorded_by_idx` ON `payments` (`recorded_by`);
