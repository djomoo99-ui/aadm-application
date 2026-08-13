CREATE TABLE `auth_account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `auth_user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_account_provider_unique` ON `auth_account` (`provider_id`,`account_id`);--> statement-breakpoint
CREATE INDEX `auth_account_user_idx` ON `auth_account` (`user_id`);--> statement-breakpoint
CREATE TABLE `auth_rate_limit` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`last_request` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `auth_session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `auth_user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_session_token_unique` ON `auth_session` (`token`);--> statement-breakpoint
CREATE INDEX `auth_session_user_idx` ON `auth_session` (`user_id`);--> statement-breakpoint
CREATE INDEX `auth_session_expires_idx` ON `auth_session` (`expires_at`);--> statement-breakpoint
CREATE TABLE `auth_user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`phone` text NOT NULL,
	`member_number` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_user_email_unique` ON `auth_user` (`email`);--> statement-breakpoint
CREATE INDEX `auth_user_member_number_idx` ON `auth_user` (`member_number`);--> statement-breakpoint
CREATE TABLE `auth_verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `auth_verification_identifier_idx` ON `auth_verification` (`identifier`);--> statement-breakpoint
ALTER TABLE `access_requests` ADD `auth_user_id` text NOT NULL REFERENCES auth_user(id);--> statement-breakpoint
CREATE UNIQUE INDEX `access_requests_auth_user_unique` ON `access_requests` (`auth_user_id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`auth_user_id` text NOT NULL,
	`member_id` text,
	`phone` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`approved_by` text,
	`approved_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`auth_user_id`) REFERENCES `auth_user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_profiles`("id", "auth_user_id", "member_id", "phone", "status", "approved_by", "approved_at", "created_at", "updated_at") SELECT "id", "auth_user_id", "member_id", "phone", "status", "approved_by", "approved_at", "created_at", "updated_at" FROM `profiles`;--> statement-breakpoint
DROP TABLE `profiles`;--> statement-breakpoint
ALTER TABLE `__new_profiles` RENAME TO `profiles`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `profiles_auth_user_id_unique` ON `profiles` (`auth_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `profiles_member_id_unique` ON `profiles` (`member_id`);--> statement-breakpoint
CREATE INDEX `profiles_phone_idx` ON `profiles` (`phone`);--> statement-breakpoint
CREATE INDEX `profiles_status_idx` ON `profiles` (`status`);