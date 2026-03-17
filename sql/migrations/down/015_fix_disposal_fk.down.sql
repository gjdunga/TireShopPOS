-- Down: 015_fix_disposal_fk.sql
ALTER TABLE tire_disposal_log DROP FOREIGN KEY fk_disp_wo;
ALTER TABLE tire_disposal_log CHANGE COLUMN work_order_id invoice_id INT DEFAULT NULL;
