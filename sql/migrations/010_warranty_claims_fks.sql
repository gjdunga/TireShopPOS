-- ============================================================================
-- Migration 010: Add missing FK constraints on warranty_claims
--
-- Migration 009 added work_order_id and position_id columns to
-- warranty_claims but did not create foreign key constraints.
-- This migration adds them.
--
-- DunganSoft Technologies, March 2026
-- ============================================================================

DROP PROCEDURE IF EXISTS _mig010_warranty_fks;
DELIMITER //
CREATE PROCEDURE _mig010_warranty_fks()
BEGIN
    -- FK: warranty_claims.work_order_id -> work_orders.work_order_id
    IF NOT EXISTS (SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'warranty_claims'
        AND CONSTRAINT_NAME = 'fk_wc_wo') THEN
        ALTER TABLE warranty_claims
            ADD CONSTRAINT fk_wc_wo FOREIGN KEY (work_order_id)
                REFERENCES work_orders(work_order_id);
    END IF;

    -- FK: warranty_claims.position_id -> work_order_positions.position_id
    IF NOT EXISTS (SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'warranty_claims'
        AND CONSTRAINT_NAME = 'fk_wc_position') THEN
        ALTER TABLE warranty_claims
            ADD CONSTRAINT fk_wc_position FOREIGN KEY (position_id)
                REFERENCES work_order_positions(position_id);
    END IF;

    -- Index for FK lookups
    IF NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'warranty_claims'
        AND INDEX_NAME = 'idx_wc_wo') THEN
        ALTER TABLE warranty_claims ADD INDEX idx_wc_wo (work_order_id);
    END IF;
END //
DELIMITER ;
CALL _mig010_warranty_fks();
DROP PROCEDURE IF EXISTS _mig010_warranty_fks;
