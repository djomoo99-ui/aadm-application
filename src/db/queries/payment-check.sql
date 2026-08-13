SELECT 'payment_balance_errors' AS check_name, COUNT(*) AS result
FROM payments p
LEFT JOIN (
  SELECT payment_id, SUM(amount_cents) AS allocated
  FROM payment_allocations GROUP BY payment_id
) a ON a.payment_id = p.id
WHERE p.amount_cents <> COALESCE(a.allocated, 0) + p.unallocated_amount_cents;

SELECT 'overpaid_dues' AS check_name, COUNT(*) AS result
FROM contribution_dues
WHERE paid_amount_cents < 0 OR paid_amount_cents > expected_amount_cents;

SELECT 'duplicate_idempotency_keys' AS check_name, COUNT(*) AS result
FROM (
  SELECT idempotency_key FROM payments GROUP BY idempotency_key HAVING COUNT(*) > 1
);

SELECT 'missing_cash_audits' AS check_name, COUNT(*) AS result
FROM payments p
LEFT JOIN audit_logs a
  ON a.entity_type = 'payment' AND a.entity_id = p.id AND a.action = 'payment.cash_recorded'
WHERE p.method = 'cash' AND a.id IS NULL;

SELECT 'posted_payments' AS check_name, COUNT(*) AS result
FROM payments WHERE status = 'posted';

SELECT 'reversal_status_errors' AS check_name, COUNT(*) AS result
FROM payments p
LEFT JOIN payment_reversals pr ON pr.payment_id = p.id
WHERE (p.status = 'reversed' AND pr.id IS NULL)
   OR (p.status = 'posted' AND pr.id IS NOT NULL);

SELECT 'missing_reversal_audits' AS check_name, COUNT(*) AS result
FROM payment_reversals pr
LEFT JOIN audit_logs a
  ON a.entity_type = 'payment' AND a.entity_id = pr.payment_id AND a.action = 'payment.reversed'
WHERE a.id IS NULL;

SELECT 'reversed_payments' AS check_name, COUNT(*) AS result
FROM payments WHERE status = 'reversed';
