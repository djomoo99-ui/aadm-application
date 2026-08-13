PRAGMA foreign_keys = ON;

SELECT 'tables' AS check_name, COUNT(*) AS result
FROM sqlite_master
WHERE type = 'table' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'sqlite_%';

SELECT 'roles' AS check_name, COUNT(*) AS result FROM roles;
SELECT 'households' AS check_name, COUNT(*) AS result FROM households;
SELECT 'members' AS check_name, COUNT(*) AS result FROM members;
SELECT 'dues' AS check_name, COUNT(*) AS result FROM contribution_dues;

SELECT
  h.name AS household,
  SUM(d.expected_amount_cents) AS expected_cents,
  SUM(d.paid_amount_cents) AS paid_cents,
  SUM(d.expected_amount_cents - d.paid_amount_cents) AS remaining_cents
FROM households h
JOIN contribution_dues d ON d.household_id = h.id
GROUP BY h.id, h.name;
