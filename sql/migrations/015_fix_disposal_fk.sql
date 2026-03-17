-- ============================================================================
-- Migration 015: Fix tire_disposal_log FK and add service_parts FK safety.
--
-- tire_disposal_log.invoice_id -> work_order_id (invoices dropped in 009).
--
-- DunganSoft Technologies, March 2026
-- ============================================================================

ALTER TABLE tire_disposal_log DROP FOREIGN KEY fk_disp_invoice;
ALTER TABLE tire_disposal_log CHANGE COLUMN invoice_id work_order_id INT DEFAULT NULL;
ALTER TABLE tire_disposal_log ADD CONSTRAINT fk_disp_wo
    FOREIGN KEY (work_order_id) REFERENCES work_orders(work_order_id);
