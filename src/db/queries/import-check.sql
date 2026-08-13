SELECT 'duplicate_household_codes' AS check_name, COUNT(*) AS result
FROM (
  SELECT import_code FROM households WHERE import_code IS NOT NULL
  GROUP BY import_code HAVING COUNT(*) > 1
);

SELECT 'imported_members_without_household' AS check_name, COUNT(*) AS result
FROM members m
WHERE m.status = 'active'
  AND NOT EXISTS (
    SELECT 1 FROM household_memberships hm
     WHERE hm.member_id = m.id AND hm.starts_at <= date('now')
       AND (hm.ends_at IS NULL OR hm.ends_at >= date('now'))
  );

SELECT 'imported_dues_without_verification' AS check_name, COUNT(*) AS result
FROM contribution_dues d JOIN households h ON h.id = d.household_id
WHERE h.import_code IS NOT NULL AND d.source IN ('excel','notebook')
  AND (d.verified_at IS NULL OR d.verified_by IS NULL);

SELECT 'confirmed_imports_without_audit' AS check_name, COUNT(*) AS result
FROM imports i LEFT JOIN audit_logs a
  ON a.entity_type = 'import' AND a.entity_id = i.id AND a.action = 'import.confirmed'
WHERE i.status = 'confirmed' AND a.id IS NULL;

SELECT 'confirmed_imports' AS check_name, COUNT(*) AS result
FROM imports WHERE status = 'confirmed';
