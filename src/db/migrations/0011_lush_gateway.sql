PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_contribution_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`base_amount_cents` integer NOT NULL,
	`female_amount_cents` integer DEFAULT 2000 NOT NULL,
	`child_amount_cents` integer DEFAULT 1000 NOT NULL,
	`child_max_age` integer DEFAULT 18 NOT NULL,
	`effective_from` text NOT NULL,
	`effective_to` text,
	`created_by` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "contribution_rules_base_non_negative" CHECK("__new_contribution_rules"."base_amount_cents" >= 0),
	CONSTRAINT "contribution_rules_female_non_negative" CHECK("__new_contribution_rules"."female_amount_cents" >= 0),
	CONSTRAINT "contribution_rules_child_non_negative" CHECK("__new_contribution_rules"."child_amount_cents" >= 0),
	CONSTRAINT "contribution_rules_child_age_valid" CHECK("__new_contribution_rules"."child_max_age" BETWEEN 0 AND 30)
);
--> statement-breakpoint
INSERT INTO `__new_contribution_rules`("id", "name", "category", "base_amount_cents", "female_amount_cents", "child_amount_cents", "child_max_age", "effective_from", "effective_to", "created_by", "created_at") SELECT "id", "name", "category", "base_amount_cents", 2000, "child_amount_cents", "child_max_age", "effective_from", "effective_to", "created_by", "created_at" FROM `contribution_rules`;--> statement-breakpoint
DROP TABLE `contribution_rules`;--> statement-breakpoint
ALTER TABLE `__new_contribution_rules` RENAME TO `contribution_rules`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `contribution_rules_period_idx` ON `contribution_rules` (`effective_from`,`effective_to`);--> statement-breakpoint
CREATE INDEX `contribution_rules_category_idx` ON `contribution_rules` (`category`);--> statement-breakpoint
UPDATE `contribution_rules`
SET `base_amount_cents` = 6000, `female_amount_cents` = 2000, `child_amount_cents` = 1000
WHERE `id` = 'rule_aadm_repatriation_2021';
