SELECT 'sent_without_confirmation_data' AS check_name, COUNT(*) AS result
FROM reminders
WHERE status = 'sent' AND (sent_at IS NULL OR sent_by IS NULL);

SELECT 'prepared_with_sent_data' AS check_name, COUNT(*) AS result
FROM reminders
WHERE status = 'prepared' AND (sent_at IS NOT NULL OR sent_by IS NOT NULL);

SELECT 'sent_without_audit' AS check_name, COUNT(*) AS result
FROM reminders r LEFT JOIN audit_logs a
  ON a.entity_type = 'reminder' AND a.entity_id = r.id AND a.action = 'reminder.marked_sent'
WHERE r.status = 'sent' AND a.id IS NULL;

SELECT 'duplicate_reminder_keys' AS check_name, COUNT(*) AS result
FROM (
  SELECT idempotency_key FROM reminders GROUP BY idempotency_key HAVING COUNT(*) > 1
);

SELECT 'prepared_reminders' AS check_name, COUNT(*) AS result
FROM reminders WHERE status = 'prepared';

SELECT 'sent_reminders' AS check_name, COUNT(*) AS result
FROM reminders WHERE status = 'sent';

