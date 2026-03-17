-- Down: 014_fix_engagement_fks.sql
-- Reverses FK fixes on coupon_usage and storage_billing.

ALTER TABLE coupon_usage DROP FOREIGN KEY fk_cu_wo;
ALTER TABLE coupon_usage CHANGE COLUMN work_order_id invoice_id INT NOT NULL;

ALTER TABLE storage_billing DROP FOREIGN KEY fk_sb_wo;
ALTER TABLE storage_billing CHANGE COLUMN work_order_id invoice_id INT DEFAULT NULL;
