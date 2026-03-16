-- ============================================================================
-- Migration 009: Remove deprecated invoice/cash tables, add work order
--                financial model (deposit, line items, tax calculation)
--
-- PRE-BETA: This migration drops tables and columns. Not reversible.
--
-- What is removed:
--   Tables: invoices, invoice_line_items, payments, deposits, refunds,
--           cash_drawers, cash_drawer_transactions
--   Views:  v_deposits_active, v_invoice_summary, v_refund_summary,
--           v_pending_refunds, v_cash_drawer_today
--   Columns: work_orders.invoice_id, purchase_orders.invoice_id,
--            waivers.invoice_id, tire_disposal_log.invoice_id,
--            marketplace_orders.invoice_id
--   FKs on above columns
--
-- What is added:
--   work_orders: deposit and tax calculation columns
--   work_order_positions: unit_price column
--   work_order_line_items: new table for services, fees, parts
--   warranty_claims: reworked to reference work_orders
--
-- What is rewritten:
--   v_quarterly_fee_report, v_service_usage, v_vehicle_history,
--   v_purchase_orders_open: rebuilt without invoice JOINs
--
-- DunganSoft Technologies, March 2026
-- ============================================================================

-- ---------------------------------------------------------------
-- Phase 1: Drop deprecated views (must go before tables they ref)
-- ---------------------------------------------------------------
DROP VIEW IF EXISTS v_deposits_active;
DROP VIEW IF EXISTS v_invoice_summary;
DROP VIEW IF EXISTS v_refund_summary;
DROP VIEW IF EXISTS v_pending_refunds;
DROP VIEW IF EXISTS v_cash_drawer_today;
-- These four will be recreated below without invoice JOINs:
DROP VIEW IF EXISTS v_quarterly_fee_report;
DROP VIEW IF EXISTS v_service_usage;
DROP VIEW IF EXISTS v_vehicle_history;
DROP VIEW IF EXISTS v_purchase_orders_open;

-- ---------------------------------------------------------------
-- Phase 2: Drop FKs from live tables that reference invoices
-- ---------------------------------------------------------------
DROP PROCEDURE IF EXISTS _mig009_drop_fks;
DELIMITER //
CREATE PROCEDURE _mig009_drop_fks()
BEGIN
    -- work_orders.invoice_id FK + column
    IF EXISTS (SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'work_orders'
        AND CONSTRAINT_NAME = 'fk_wo_invoice') THEN
        ALTER TABLE work_orders DROP FOREIGN KEY fk_wo_invoice;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'work_orders'
        AND COLUMN_NAME = 'invoice_id') THEN
        ALTER TABLE work_orders DROP COLUMN invoice_id;
    END IF;

    -- purchase_orders.invoice_id FK + column
    IF EXISTS (SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'purchase_orders'
        AND CONSTRAINT_NAME = 'fk_po_invoice') THEN
        ALTER TABLE purchase_orders DROP FOREIGN KEY fk_po_invoice;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'purchase_orders'
        AND COLUMN_NAME = 'invoice_id') THEN
        ALTER TABLE purchase_orders DROP COLUMN invoice_id;
    END IF;

    -- waivers.invoice_id FK + column
    IF EXISTS (SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'waivers'
        AND CONSTRAINT_NAME = 'fk_waiver_invoice') THEN
        ALTER TABLE waivers DROP FOREIGN KEY fk_waiver_invoice;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'waivers'
        AND COLUMN_NAME = 'invoice_id') THEN
        ALTER TABLE waivers DROP COLUMN invoice_id;
    END IF;

    -- tire_disposal_log.invoice_id FK + column
    IF EXISTS (SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tire_disposal_log'
        AND CONSTRAINT_NAME = 'fk_disp_invoice') THEN
        ALTER TABLE tire_disposal_log DROP FOREIGN KEY fk_disp_invoice;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tire_disposal_log'
        AND COLUMN_NAME = 'invoice_id') THEN
        ALTER TABLE tire_disposal_log DROP COLUMN invoice_id;
    END IF;

    -- warranty_claims: drop invoice_id and line_id FKs
    IF EXISTS (SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'warranty_claims'
        AND CONSTRAINT_NAME = 'fk_wc_invoice') THEN
        ALTER TABLE warranty_claims DROP FOREIGN KEY fk_wc_invoice;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'warranty_claims'
        AND CONSTRAINT_NAME = 'fk_wc_line') THEN
        ALTER TABLE warranty_claims DROP FOREIGN KEY fk_wc_line;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'warranty_claims'
        AND COLUMN_NAME = 'invoice_id') THEN
        ALTER TABLE warranty_claims DROP COLUMN invoice_id;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'warranty_claims'
        AND COLUMN_NAME = 'line_id') THEN
        ALTER TABLE warranty_claims DROP COLUMN line_id;
    END IF;

    -- warranty_claims: add work_order_id + position_id if not present
    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'warranty_claims'
        AND COLUMN_NAME = 'work_order_id') THEN
        ALTER TABLE warranty_claims
            ADD COLUMN work_order_id INT DEFAULT NULL
                COMMENT 'Work order where tire was installed'
                AFTER claim_id,
            ADD COLUMN position_id INT DEFAULT NULL
                COMMENT 'Wheel position from that work order'
                AFTER work_order_id;
    END IF;

    -- marketplace_orders.invoice_id FK + column
    IF EXISTS (SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'marketplace_orders'
        AND CONSTRAINT_NAME = 'fk_mo_invoice') THEN
        ALTER TABLE marketplace_orders DROP FOREIGN KEY fk_mo_invoice;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'marketplace_orders'
        AND COLUMN_NAME = 'invoice_id') THEN
        ALTER TABLE marketplace_orders DROP COLUMN invoice_id;
    END IF;
END //
DELIMITER ;
CALL _mig009_drop_fks();
DROP PROCEDURE IF EXISTS _mig009_drop_fks;

-- ---------------------------------------------------------------
-- Phase 3: Drop deprecated tables (order matters for FKs)
-- ---------------------------------------------------------------
SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS cash_drawer_transactions;
DROP TABLE IF EXISTS cash_drawers;
DROP TABLE IF EXISTS refunds;
DROP TABLE IF EXISTS deposits;
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS invoice_line_items;
DROP TABLE IF EXISTS invoices;
SET FOREIGN_KEY_CHECKS = 1;

-- ---------------------------------------------------------------
-- Phase 4: Add work order financial model
-- ---------------------------------------------------------------
DROP PROCEDURE IF EXISTS _mig009_wo_finance;
DELIMITER //
CREATE PROCEDURE _mig009_wo_finance()
BEGIN
    -- Deposit tracking
    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'work_orders'
        AND COLUMN_NAME = 'deposit_amount') THEN
        ALTER TABLE work_orders
            ADD COLUMN deposit_amount     DECIMAL(10,2) DEFAULT NULL
                COMMENT 'Customer deposit paid toward this job' AFTER estimated_price,
            ADD COLUMN deposit_received_at DATETIME DEFAULT NULL AFTER deposit_amount,
            ADD COLUMN deposit_method      ENUM('cash','credit_card','debit_card','check','other')
                DEFAULT NULL AFTER deposit_received_at,
            ADD COLUMN deposit_received_by INT DEFAULT NULL AFTER deposit_method;
    END IF;

    -- Tax and subtotal fields
    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'work_orders'
        AND COLUMN_NAME = 'subtotal_materials') THEN
        ALTER TABLE work_orders
            ADD COLUMN subtotal_materials DECIMAL(10,2) NOT NULL DEFAULT 0.00
                COMMENT 'Sum of tire prices + taxable parts' AFTER deposit_received_by,
            ADD COLUMN subtotal_labor     DECIMAL(10,2) NOT NULL DEFAULT 0.00
                COMMENT 'Sum of service/labor charges (NOT taxed)' AFTER subtotal_materials,
            ADD COLUMN subtotal_fees      DECIMAL(10,2) NOT NULL DEFAULT 0.00
                COMMENT 'Government and environmental fees' AFTER subtotal_labor,
            ADD COLUMN tax_rate           DECIMAL(5,4) NOT NULL DEFAULT 0.0000
                COMMENT 'Tax rate applied to taxable subtotal (e.g., 0.0790)' AFTER subtotal_fees,
            ADD COLUMN tax_amount         DECIMAL(10,2) NOT NULL DEFAULT 0.00
                COMMENT 'Calculated: taxable_subtotal * tax_rate' AFTER tax_rate,
            ADD COLUMN total_estimate     DECIMAL(10,2) NOT NULL DEFAULT 0.00
                COMMENT 'materials + labor + fees + tax' AFTER tax_amount;
    END IF;

    -- unit_price on work_order_positions (captures tire price at WO creation)
    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'work_order_positions'
        AND COLUMN_NAME = 'unit_price') THEN
        ALTER TABLE work_order_positions
            ADD COLUMN unit_price DECIMAL(8,2) DEFAULT NULL
                COMMENT 'Tire retail price at time of work order creation'
                AFTER tire_id_new;
    END IF;
END //
DELIMITER ;
CALL _mig009_wo_finance();
DROP PROCEDURE IF EXISTS _mig009_wo_finance;

-- ---------------------------------------------------------------
-- Phase 5: Work order line items (services, fees, parts)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS work_order_line_items (
    line_id         INT AUTO_INCREMENT PRIMARY KEY,
    work_order_id   INT NOT NULL,
    line_type       ENUM('labor','part','fee','warranty','disposal','other') NOT NULL,
    description     VARCHAR(255) NOT NULL,
    quantity        DECIMAL(6,2) NOT NULL DEFAULT 1.00,
    unit_price      DECIMAL(8,2) NOT NULL DEFAULT 0.00,
    line_total      DECIMAL(10,2) NOT NULL DEFAULT 0.00
        COMMENT 'quantity * unit_price',
    is_taxable      TINYINT(1) NOT NULL DEFAULT 0
        COMMENT '1 = included in taxable subtotal (materials, parts). 0 = labor, fees',
    service_id      INT DEFAULT NULL COMMENT 'Links to service_catalog if labor',
    fee_config_id   INT DEFAULT NULL COMMENT 'Links to fee_configuration if fee',
    tire_id         INT DEFAULT NULL COMMENT 'Links to tire if part/warranty',
    warranty_policy_id INT DEFAULT NULL COMMENT 'Links to warranty_policies if warranty line',
    warranty_expires_at DATE DEFAULT NULL
        COMMENT 'Expiry date for warranty coverage',
    warranty_terms  TEXT DEFAULT NULL
        COMMENT 'Warranty terms text captured at time of sale',
    display_order   SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_woli_wo       FOREIGN KEY (work_order_id) REFERENCES work_orders(work_order_id),
    CONSTRAINT fk_woli_service  FOREIGN KEY (service_id) REFERENCES service_catalog(service_id),
    CONSTRAINT fk_woli_tire     FOREIGN KEY (tire_id) REFERENCES tires(tire_id),
    CONSTRAINT fk_woli_policy   FOREIGN KEY (warranty_policy_id) REFERENCES warranty_policies(policy_id),
    INDEX idx_woli_wo (work_order_id),
    INDEX idx_woli_type (line_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------
-- Phase 6: Recreate views without invoice dependencies
-- ---------------------------------------------------------------

CREATE OR REPLACE VIEW v_vehicle_history AS
SELECT v.vehicle_id, v.vin, v.year, v.make, v.model,
       wo.work_order_id, wo.wo_number, wo.status AS wo_status,
       wo.customer_complaint, wo.completed_at,
       wo.total_estimate,
       c.customer_id, c.first_name, c.last_name
FROM vehicles v
LEFT JOIN work_orders wo ON v.vehicle_id = wo.vehicle_id
LEFT JOIN customers c ON wo.customer_id = c.customer_id
ORDER BY wo.created_at DESC;

CREATE OR REPLACE VIEW v_purchase_orders_open AS
SELECT po.po_id, po.po_number, po.status,
       v.vendor_name, v.contact_name,
       po.order_date, po.expected_delivery,
       (SELECT COUNT(*) FROM po_line_items pli WHERE pli.po_id = po.po_id) AS line_count,
       (SELECT COALESCE(SUM(pli.quantity_ordered * pli.unit_cost), 0) FROM po_line_items pli WHERE pli.po_id = po.po_id) AS total_cost
FROM purchase_orders po
JOIN vendors v ON po.vendor_id = v.vendor_id
WHERE po.status IN ('draft', 'submitted', 'partial');

CREATE OR REPLACE VIEW v_service_usage AS
SELECT sc.service_id, sc.service_code, sc.service_name,
       COUNT(woli.line_id) AS usage_count,
       COALESCE(SUM(woli.line_total), 0) AS total_revenue
FROM service_catalog sc
LEFT JOIN work_order_line_items woli ON sc.service_id = woli.service_id
GROUP BY sc.service_id, sc.service_code, sc.service_name;

CREATE OR REPLACE VIEW v_quarterly_fee_report AS
SELECT YEAR(wo.created_at) AS sale_year,
       QUARTER(wo.created_at) AS sale_quarter,
       fc.fee_key, fc.fee_label,
       COUNT(woli.line_id) AS fee_count,
       COALESCE(SUM(woli.line_total), 0) AS fee_total
FROM work_order_line_items woli
JOIN fee_configuration fc ON woli.fee_config_id = fc.fee_id
JOIN work_orders wo ON woli.work_order_id = wo.work_order_id
WHERE woli.line_type = 'fee'
GROUP BY sale_year, sale_quarter, fc.fee_key, fc.fee_label;
