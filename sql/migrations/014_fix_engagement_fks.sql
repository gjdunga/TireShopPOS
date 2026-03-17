-- ============================================================================
-- Migration 014: Fix broken FKs on coupon_usage and storage_billing.
--
-- Migration 009 dropped invoices/payments but left FKs pointing to them.
-- coupon_usage.invoice_id -> work_order_id (links redemption to WO)
-- storage_billing.invoice_id -> work_order_id (links billing to WO)
--
-- DunganSoft Technologies, March 2026
-- ============================================================================

-- coupon_usage: drop invoice FK, rename column, add WO FK
ALTER TABLE coupon_usage DROP FOREIGN KEY fk_cu_invoice;
ALTER TABLE coupon_usage CHANGE COLUMN invoice_id work_order_id INT NOT NULL;
ALTER TABLE coupon_usage ADD CONSTRAINT fk_cu_wo
    FOREIGN KEY (work_order_id) REFERENCES work_orders(work_order_id);

-- storage_billing: drop invoice FK, rename column, add WO FK
ALTER TABLE storage_billing DROP FOREIGN KEY fk_sb_invoice;
ALTER TABLE storage_billing CHANGE COLUMN invoice_id work_order_id INT DEFAULT NULL
    COMMENT 'Linked to work order when billed';
ALTER TABLE storage_billing ADD CONSTRAINT fk_sb_wo
    FOREIGN KEY (work_order_id) REFERENCES work_orders(work_order_id);
