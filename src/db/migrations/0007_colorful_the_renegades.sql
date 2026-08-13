CREATE TABLE `alert_scan_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`detected_count` integer DEFAULT 0 NOT NULL,
	`opened_count` integer DEFAULT 0 NOT NULL,
	`reopened_count` integer DEFAULT 0 NOT NULL,
	`auto_resolved_count` integer DEFAULT 0 NOT NULL,
	`run_by` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "alert_scan_runs_counts_non_negative" CHECK("alert_scan_runs"."detected_count" >= 0 AND "alert_scan_runs"."opened_count" >= 0 AND "alert_scan_runs"."reopened_count" >= 0 AND "alert_scan_runs"."auto_resolved_count" >= 0)
);
--> statement-breakpoint
CREATE INDEX `alert_scan_runs_date_idx` ON `alert_scan_runs` (`created_at`);--> statement-breakpoint
CREATE TABLE `office_alerts` (
	`id` text PRIMARY KEY NOT NULL,
	`fingerprint` text NOT NULL,
	`type` text NOT NULL,
	`severity` text NOT NULL,
	`title` text NOT NULL,
	`message` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`source` text DEFAULT 'scan' NOT NULL,
	`last_scan_id` text,
	`first_detected_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`last_seen_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`resolved_at` text,
	`resolved_by` text,
	`resolution_note` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `office_alerts_fingerprint_unique` ON `office_alerts` (`fingerprint`);--> statement-breakpoint
CREATE INDEX `office_alerts_status_severity_idx` ON `office_alerts` (`status`,`severity`,`last_seen_at`);--> statement-breakpoint
CREATE INDEX `office_alerts_entity_idx` ON `office_alerts` (`entity_type`,`entity_id`);