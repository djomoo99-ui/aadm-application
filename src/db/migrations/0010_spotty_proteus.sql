CREATE TABLE `member_activity_periods` (
	`id` text PRIMARY KEY NOT NULL,
	`member_id` text NOT NULL,
	`status` text NOT NULL,
	`starts_at` text NOT NULL,
	`ends_at` text,
	`reason` text NOT NULL,
	`changed_by` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "member_activity_periods_dates_valid" CHECK("member_activity_periods"."ends_at" IS NULL OR "member_activity_periods"."ends_at" >= "member_activity_periods"."starts_at")
);
--> statement-breakpoint
CREATE INDEX `member_activity_periods_member_idx` ON `member_activity_periods` (`member_id`,`starts_at`);--> statement-breakpoint
DROP INDEX `contribution_dues_household_office_date_unique`;--> statement-breakpoint
ALTER TABLE `contribution_dues` ADD `member_id` text REFERENCES members(id);--> statement-breakpoint
ALTER TABLE `contribution_dues` ADD `contribution_kind` text DEFAULT 'legacy_household' NOT NULL;--> statement-breakpoint
ALTER TABLE `contribution_dues` ADD `age_snapshot` integer;--> statement-breakpoint
ALTER TABLE `contribution_dues` ADD `working_snapshot` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `contribution_dues_member_office_date_kind_unique` ON `contribution_dues` (`member_id`,`office_id`,`due_date`,`contribution_kind`);--> statement-breakpoint
CREATE INDEX `contribution_dues_member_idx` ON `contribution_dues` (`member_id`,`due_date`);--> statement-breakpoint
UPDATE `contribution_rules`
SET `effective_to` = '2020-12-31'
WHERE `id` IN ('rule_aadm_man', 'rule_aadm_woman', 'rule_aadm_couple')
  AND (`effective_to` IS NULL OR `effective_to` >= '2021-01-01');--> statement-breakpoint
INSERT OR IGNORE INTO `contribution_rules`
  (`id`, `name`, `category`, `base_amount_cents`, `child_amount_cents`, `child_max_age`, `effective_from`)
VALUES
  ('rule_aadm_repatriation_2021', 'Caisse annuelle de rapatriement depuis 2021', 'annual_repatriation', 2000, 1000, 18, '2021-01-01'),
  ('rule_aadm_working_man_2021', 'Cotisation trimestrielle des hommes actifs depuis 2021', 'quarterly_working_man', 2000, 0, 18, '2021-01-01');--> statement-breakpoint
INSERT OR IGNORE INTO `rule_due_months` (`rule_id`, `month_number`, `weekday_rule`)
VALUES
  ('rule_aadm_repatriation_2021', 3, 'office_first_meeting'),
  ('rule_aadm_working_man_2021', 3, 'office_meeting'),
  ('rule_aadm_working_man_2021', 6, 'office_meeting'),
  ('rule_aadm_working_man_2021', 9, 'office_meeting'),
  ('rule_aadm_working_man_2021', 12, 'office_meeting');
