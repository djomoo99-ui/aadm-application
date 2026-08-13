CREATE TABLE `household_office_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`office_id` text NOT NULL,
	`starts_at` text NOT NULL,
	`ends_at` text,
	`reason` text NOT NULL,
	`changed_by` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`office_id`) REFERENCES `offices`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `household_office_period_idx` ON `household_office_assignments` (`household_id`,`starts_at`);--> statement-breakpoint
CREATE INDEX `household_office_office_idx` ON `household_office_assignments` (`office_id`,`starts_at`);--> statement-breakpoint
CREATE TABLE `offices` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`city` text NOT NULL,
	`kind` text DEFAULT 'local' NOT NULL,
	`meeting_ordinal` integer DEFAULT 2 NOT NULL,
	`meeting_weekday` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "offices_ordinal_valid" CHECK("offices"."meeting_ordinal" BETWEEN 1 AND 5),
	CONSTRAINT "offices_weekday_valid" CHECK("offices"."meeting_weekday" BETWEEN 0 AND 6)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `offices_code_unique` ON `offices` (`code`);--> statement-breakpoint
CREATE INDEX `offices_status_city_idx` ON `offices` (`status`,`city`);--> statement-breakpoint
INSERT OR IGNORE INTO `offices` (`id`,`code`,`name`,`city`,`kind`,`meeting_ordinal`,`meeting_weekday`,`status`) VALUES ('office_paris','PARIS','Bureau central de Paris','Paris','central',2,0,'active');--> statement-breakpoint
DROP INDEX `association_meetings_date_unique`;--> statement-breakpoint
ALTER TABLE `association_meetings` ADD `office_id` text DEFAULT 'office_paris' NOT NULL REFERENCES offices(id);--> statement-breakpoint
CREATE UNIQUE INDEX `association_meetings_office_date_unique` ON `association_meetings` (`office_id`,`meeting_date`);--> statement-breakpoint
ALTER TABLE `contribution_dues` ADD `office_id` text DEFAULT 'office_paris' NOT NULL REFERENCES offices(id);--> statement-breakpoint
DROP INDEX `contribution_dues_household_date_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `contribution_dues_household_office_date_unique` ON `contribution_dues` (`household_id`,`office_id`,`due_date`);--> statement-breakpoint
CREATE INDEX `contribution_dues_office_idx` ON `contribution_dues` (`office_id`,`due_date`);--> statement-breakpoint
ALTER TABLE `due_generation_runs` ADD `office_id` text REFERENCES offices(id);--> statement-breakpoint
UPDATE `due_generation_runs` SET `office_id` = 'office_paris' WHERE `office_id` IS NULL;--> statement-breakpoint
ALTER TABLE `households` ADD `office_id` text DEFAULT 'office_paris' NOT NULL REFERENCES offices(id);--> statement-breakpoint
CREATE INDEX `households_office_idx` ON `households` (`office_id`);--> statement-breakpoint
INSERT OR IGNORE INTO `household_office_assignments` (`id`,`household_id`,`office_id`,`starts_at`,`reason`) SELECT 'office_initial_' || id, id, office_id, joined_at, 'Rattachement initial lors de la migration multi-bureaux' FROM households;--> statement-breakpoint
ALTER TABLE `office_alerts` ADD `office_id` text REFERENCES offices(id);--> statement-breakpoint
UPDATE `office_alerts` SET `office_id` = CASE
 WHEN `entity_type` = 'household' THEN (SELECT `office_id` FROM `households` WHERE `id` = `office_alerts`.`entity_id`)
 WHEN `entity_type` = 'contribution_due' THEN (SELECT `office_id` FROM `contribution_dues` WHERE `id` = `office_alerts`.`entity_id`)
 WHEN `entity_type` = 'association_meeting' THEN (SELECT `office_id` FROM `association_meetings` WHERE `id` = `office_alerts`.`entity_id`)
 ELSE 'office_paris' END
WHERE `office_id` IS NULL;--> statement-breakpoint
ALTER TABLE `payments` ADD `office_id` text DEFAULT 'office_paris' NOT NULL REFERENCES offices(id);--> statement-breakpoint
ALTER TABLE `profiles` ADD `office_id` text DEFAULT 'office_paris' NOT NULL REFERENCES offices(id);--> statement-breakpoint
ALTER TABLE `profiles` ADD `central_access` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX `profiles_office_idx` ON `profiles` (`office_id`);--> statement-breakpoint
UPDATE profiles SET central_access = true WHERE id IN (SELECT ur.profile_id FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE r.code = 'admin' AND ur.revoked_at IS NULL);--> statement-breakpoint
ALTER TABLE `reminders` ADD `office_id` text DEFAULT 'office_paris' NOT NULL REFERENCES offices(id);
