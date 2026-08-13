UPDATE `contribution_dues`
SET `expected_amount_cents` = CASE
      WHEN `age_snapshot` IS NULL THEN `expected_amount_cents`
      WHEN `age_snapshot` < 18 THEN 1000
      WHEN (SELECT `gender` FROM `members` WHERE `members`.`id` = `contribution_dues`.`member_id`) = 'female' THEN 2000
      WHEN (SELECT `gender` FROM `members` WHERE `members`.`id` = `contribution_dues`.`member_id`) = 'male' THEN 6000
      ELSE `expected_amount_cents`
    END,
    `status` = CASE
      WHEN `status` IN ('exempt', 'to_verify') THEN `status`
      WHEN `paid_amount_cents` >= CASE
        WHEN `age_snapshot` IS NULL THEN `expected_amount_cents`
        WHEN `age_snapshot` < 18 THEN 1000
        WHEN (SELECT `gender` FROM `members` WHERE `members`.`id` = `contribution_dues`.`member_id`) = 'female' THEN 2000
        WHEN (SELECT `gender` FROM `members` WHERE `members`.`id` = `contribution_dues`.`member_id`) = 'male' THEN 6000
        ELSE `expected_amount_cents`
      END THEN 'paid'
      WHEN `paid_amount_cents` > 0 THEN 'partial'
      WHEN `due_date` < date('now') THEN 'overdue'
      ELSE 'upcoming'
    END,
    `updated_at` = CURRENT_TIMESTAMP
WHERE `contribution_kind` = 'annual_repatriation'
  AND `due_date` >= '2021-01-01';
