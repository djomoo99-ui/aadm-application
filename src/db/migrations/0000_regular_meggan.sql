CREATE TABLE `access_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`member_number` text NOT NULL,
	`declared_name` text NOT NULL,
	`phone` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`reviewed_by` text,
	`reviewed_at` text,
	`review_note` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `access_requests_status_date_idx` ON `access_requests` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `access_requests_member_idx` ON `access_requests` (`member_number`);--> statement-breakpoint
CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_by` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_profile_id` text,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text,
	`old_values` text,
	`new_values` text,
	`ip_hash` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_logs_actor_date_idx` ON `audit_logs` (`actor_profile_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_logs_entity_idx` ON `audit_logs` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `contribution_dues` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`rule_id` text NOT NULL,
	`due_date` text NOT NULL,
	`expected_amount_cents` integer NOT NULL,
	`child_count_snapshot` integer DEFAULT 0 NOT NULL,
	`paid_amount_cents` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'upcoming' NOT NULL,
	`source` text DEFAULT 'system' NOT NULL,
	`verified_at` text,
	`verified_by` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`rule_id`) REFERENCES `contribution_rules`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "contribution_dues_expected_non_negative" CHECK("contribution_dues"."expected_amount_cents" >= 0),
	CONSTRAINT "contribution_dues_paid_non_negative" CHECK("contribution_dues"."paid_amount_cents" >= 0),
	CONSTRAINT "contribution_dues_children_non_negative" CHECK("contribution_dues"."child_count_snapshot" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `contribution_dues_household_date_unique` ON `contribution_dues` (`household_id`,`due_date`);--> statement-breakpoint
CREATE INDEX `contribution_dues_date_status_idx` ON `contribution_dues` (`due_date`,`status`);--> statement-breakpoint
CREATE INDEX `contribution_dues_household_idx` ON `contribution_dues` (`household_id`);--> statement-breakpoint
CREATE TABLE `contribution_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`base_amount_cents` integer NOT NULL,
	`child_amount_cents` integer DEFAULT 1000 NOT NULL,
	`child_max_age` integer DEFAULT 18 NOT NULL,
	`effective_from` text NOT NULL,
	`effective_to` text,
	`created_by` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "contribution_rules_base_non_negative" CHECK("contribution_rules"."base_amount_cents" >= 0),
	CONSTRAINT "contribution_rules_child_non_negative" CHECK("contribution_rules"."child_amount_cents" >= 0),
	CONSTRAINT "contribution_rules_child_age_valid" CHECK("contribution_rules"."child_max_age" BETWEEN 0 AND 30)
);
--> statement-breakpoint
CREATE INDEX `contribution_rules_period_idx` ON `contribution_rules` (`effective_from`,`effective_to`);--> statement-breakpoint
CREATE INDEX `contribution_rules_category_idx` ON `contribution_rules` (`category`);--> statement-breakpoint
CREATE TABLE `household_memberships` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`member_id` text NOT NULL,
	`relationship` text NOT NULL,
	`starts_at` text NOT NULL,
	`ends_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `household_memberships_household_idx` ON `household_memberships` (`household_id`);--> statement-breakpoint
CREATE INDEX `household_memberships_member_idx` ON `household_memberships` (`member_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `household_memberships_period_unique` ON `household_memberships` (`household_id`,`member_id`,`starts_at`);--> statement-breakpoint
CREATE TABLE `household_rule_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`rule_id` text NOT NULL,
	`starts_at` text NOT NULL,
	`ends_at` text,
	`override_amount_cents` integer,
	`reason` text,
	`created_by` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`rule_id`) REFERENCES `contribution_rules`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "household_rule_assignments_override_non_negative" CHECK("household_rule_assignments"."override_amount_cents" IS NULL OR "household_rule_assignments"."override_amount_cents" >= 0)
);
--> statement-breakpoint
CREATE INDEX `household_rule_assignments_household_idx` ON `household_rule_assignments` (`household_id`,`starts_at`);--> statement-breakpoint
CREATE TABLE `households` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`phone` text,
	`joined_at` text NOT NULL,
	`left_at` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `households_name_idx` ON `households` (`name`);--> statement-breakpoint
CREATE INDEX `households_phone_idx` ON `households` (`phone`);--> statement-breakpoint
CREATE INDEX `households_status_idx` ON `households` (`status`);--> statement-breakpoint
CREATE TABLE `imports` (
	`id` text PRIMARY KEY NOT NULL,
	`file_name` text NOT NULL,
	`status` text NOT NULL,
	`total_rows` integer DEFAULT 0 NOT NULL,
	`accepted_rows` integer DEFAULT 0 NOT NULL,
	`rejected_rows` integer DEFAULT 0 NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "imports_counts_non_negative" CHECK("imports"."total_rows" >= 0 AND "imports"."accepted_rows" >= 0 AND "imports"."rejected_rows" >= 0)
);
--> statement-breakpoint
CREATE INDEX `imports_status_date_idx` ON `imports` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `member_qr_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`member_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`revoked_at` text,
	`revoked_by` text,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `member_qr_codes_token_unique` ON `member_qr_codes` (`token_hash`);--> statement-breakpoint
CREATE INDEX `member_qr_codes_member_status_idx` ON `member_qr_codes` (`member_id`,`status`);--> statement-breakpoint
CREATE TABLE `members` (
	`id` text PRIMARY KEY NOT NULL,
	`member_number` text NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`gender` text DEFAULT 'unspecified' NOT NULL,
	`birth_date` text,
	`phone` text,
	`joined_at` text NOT NULL,
	`left_at` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `members_number_unique` ON `members` (`member_number`);--> statement-breakpoint
CREATE INDEX `members_name_idx` ON `members` (`last_name`,`first_name`);--> statement-breakpoint
CREATE INDEX `members_phone_idx` ON `members` (`phone`);--> statement-breakpoint
CREATE INDEX `members_status_idx` ON `members` (`status`);--> statement-breakpoint
CREATE TABLE `payment_allocations` (
	`id` text PRIMARY KEY NOT NULL,
	`payment_id` text NOT NULL,
	`contribution_due_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`contribution_due_id`) REFERENCES `contribution_dues`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "payment_allocations_amount_positive" CHECK("payment_allocations"."amount_cents" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payment_allocations_unique` ON `payment_allocations` (`payment_id`,`contribution_due_id`);--> statement-breakpoint
CREATE INDEX `payment_allocations_due_idx` ON `payment_allocations` (`contribution_due_id`);--> statement-breakpoint
CREATE TABLE `payment_reversals` (
	`id` text PRIMARY KEY NOT NULL,
	`payment_id` text NOT NULL,
	`reason` text NOT NULL,
	`reversed_by` text NOT NULL,
	`reversed_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payment_reversals_payment_unique` ON `payment_reversals` (`payment_id`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`receipt_number` text NOT NULL,
	`household_id` text NOT NULL,
	`member_id` text,
	`amount_cents` integer NOT NULL,
	`payment_date` text NOT NULL,
	`method` text DEFAULT 'cash' NOT NULL,
	`status` text DEFAULT 'posted' NOT NULL,
	`recorded_by` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`note` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "payments_amount_positive" CHECK("payments"."amount_cents" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payments_receipt_unique` ON `payments` (`receipt_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `payments_idempotency_unique` ON `payments` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `payments_household_date_idx` ON `payments` (`household_id`,`payment_date`);--> statement-breakpoint
CREATE INDEX `payments_recorded_by_idx` ON `payments` (`recorded_by`);--> statement-breakpoint
CREATE TABLE `profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`auth_user_id` text NOT NULL,
	`member_id` text,
	`phone` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`approved_by` text,
	`approved_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `profiles_auth_user_id_unique` ON `profiles` (`auth_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `profiles_member_id_unique` ON `profiles` (`member_id`);--> statement-breakpoint
CREATE INDEX `profiles_phone_idx` ON `profiles` (`phone`);--> statement-breakpoint
CREATE INDEX `profiles_status_idx` ON `profiles` (`status`);--> statement-breakpoint
CREATE TABLE `reminders` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`period_label` text NOT NULL,
	`message` text NOT NULL,
	`status` text DEFAULT 'prepared' NOT NULL,
	`created_by` text NOT NULL,
	`sent_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "reminders_amount_non_negative" CHECK("reminders"."amount_cents" >= 0)
);
--> statement-breakpoint
CREATE INDEX `reminders_household_date_idx` ON `reminders` (`household_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `roles` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `roles_code_unique` ON `roles` (`code`);--> statement-breakpoint
CREATE TABLE `rule_due_months` (
	`rule_id` text NOT NULL,
	`month_number` integer NOT NULL,
	`weekday_rule` text DEFAULT 'second_sunday' NOT NULL,
	PRIMARY KEY(`rule_id`, `month_number`),
	FOREIGN KEY (`rule_id`) REFERENCES `contribution_rules`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "rule_due_months_valid" CHECK("rule_due_months"."month_number" BETWEEN 1 AND 12)
);
--> statement-breakpoint
CREATE TABLE `user_roles` (
	`profile_id` text NOT NULL,
	`role_id` text NOT NULL,
	`assigned_by` text,
	`assigned_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`revoked_at` text,
	PRIMARY KEY(`profile_id`, `role_id`),
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `user_roles_role_idx` ON `user_roles` (`role_id`);