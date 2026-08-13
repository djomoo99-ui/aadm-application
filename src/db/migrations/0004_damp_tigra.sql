ALTER TABLE `households` ADD `import_code` text;--> statement-breakpoint
CREATE UNIQUE INDEX `households_import_code_unique` ON `households` (`import_code`);--> statement-breakpoint
INSERT OR IGNORE INTO contribution_rules
  (id, name, category, base_amount_cents, child_amount_cents, child_max_age, effective_from)
VALUES
  ('rule_aadm_man', 'Tarif AADM homme depuis 2021', 'single_man', 2000, 1000, 18, '2021-01-01'),
  ('rule_aadm_woman', 'Tarif AADM femme depuis 2021', 'single_woman', 1000, 1000, 18, '2021-01-01'),
  ('rule_aadm_couple', 'Tarif AADM couple depuis 2021', 'couple', 3000, 1000, 18, '2021-01-01');--> statement-breakpoint
INSERT OR IGNORE INTO rule_due_months (rule_id, month_number, weekday_rule)
SELECT r.id, m.month_number, 'second_sunday'
FROM contribution_rules r
CROSS JOIN (
  SELECT 3 AS month_number UNION ALL SELECT 6 UNION ALL SELECT 9 UNION ALL SELECT 12
) m
WHERE r.id IN ('rule_aadm_man', 'rule_aadm_woman', 'rule_aadm_couple');
