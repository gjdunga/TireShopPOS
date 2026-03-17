-- Down: 016_drop_dead_billing.sql
-- NON-ROLLBACKABLE: original tables had FKs to dropped invoices/payments tables.
-- Recreating them would require those tables to exist. If you need AR/AP,
-- design new tables against the work order model.
SELECT 'NON-ROLLBACKABLE: billing tables had broken FKs to dropped invoices/payments' AS warning;
