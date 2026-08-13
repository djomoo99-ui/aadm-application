PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_auth_rate_limit` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`count` integer NOT NULL,
	`last_request` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_auth_rate_limit`("id", "key", "count", "last_request") SELECT lower(hex(randomblob(16))), "key", "count", "last_request" FROM `auth_rate_limit`;--> statement-breakpoint
DROP TABLE `auth_rate_limit`;--> statement-breakpoint
ALTER TABLE `__new_auth_rate_limit` RENAME TO `auth_rate_limit`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `auth_rate_limit_key_unique` ON `auth_rate_limit` (`key`);
