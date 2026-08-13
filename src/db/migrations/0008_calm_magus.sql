ALTER TABLE `alert_scan_runs` ADD `trigger` text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE `alert_scan_runs` ADD `run_key` text;--> statement-breakpoint
CREATE UNIQUE INDEX `alert_scan_runs_run_key_unique` ON `alert_scan_runs` (`run_key`);