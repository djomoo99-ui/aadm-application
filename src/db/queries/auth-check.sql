SELECT 'auth_tables' AS check_name, COUNT(*) AS result
FROM sqlite_master
WHERE type = 'table'
  AND name IN ('auth_user', 'auth_session', 'auth_account', 'auth_verification', 'auth_rate_limit');

SELECT 'orphan_profiles' AS check_name, COUNT(*) AS result
FROM profiles p
LEFT JOIN auth_user u ON u.id = p.auth_user_id
WHERE u.id IS NULL;

SELECT 'orphan_access_requests' AS check_name, COUNT(*) AS result
FROM access_requests ar
LEFT JOIN auth_user u ON u.id = ar.auth_user_id
WHERE u.id IS NULL;

SELECT 'pending_accounts' AS check_name, COUNT(*) AS result
FROM profiles
WHERE status = 'pending';

SELECT 'active_accounts' AS check_name, COUNT(*) AS result
FROM profiles
WHERE status = 'active';

