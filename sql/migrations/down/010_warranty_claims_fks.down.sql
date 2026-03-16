-- Down: 010_warranty_claims_fks.sql
-- Reverses: FK constraints on warranty_claims.work_order_id and position_id
-- Safe: only drops constraints and index, does not drop data or columns.

DROP PROCEDURE IF EXISTS _down010;
DELIMITER //
CREATE PROCEDURE _down010()
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'warranty_claims'
        AND CONSTRAINT_NAME = 'fk_wc_wo') THEN
        ALTER TABLE warranty_claims DROP FOREIGN KEY fk_wc_wo;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'warranty_claims'
        AND CONSTRAINT_NAME = 'fk_wc_position') THEN
        ALTER TABLE warranty_claims DROP FOREIGN KEY fk_wc_position;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'warranty_claims'
        AND INDEX_NAME = 'idx_wc_wo') THEN
        ALTER TABLE warranty_claims DROP INDEX idx_wc_wo;
    END IF;
END //
DELIMITER ;
CALL _down010();
DROP PROCEDURE IF EXISTS _down010;
