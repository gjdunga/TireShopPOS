-- ============================================================================
-- Migration 007: Add estimated_price to work_orders + full_size_string to tires
--
-- estimated_price: preliminary pricing on work orders (refactor: cash handling
-- removed, work orders now carry an estimate instead of linking to invoices).
--
-- full_size_string: human-readable tire size (e.g., "265/70R17") used by
-- CRUD functions, marketplace listings, work order detail, public inventory.
--
-- DunganSoft Technologies, March 2026
-- ============================================================================

-- Use procedures to safely add columns (MySQL 8.0 lacks ADD COLUMN IF NOT EXISTS)
DROP PROCEDURE IF EXISTS _mig007;
DELIMITER //
CREATE PROCEDURE _mig007()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'work_orders' AND COLUMN_NAME = 'estimated_price') THEN
        ALTER TABLE work_orders ADD COLUMN estimated_price DECIMAL(10,2) DEFAULT NULL
            COMMENT 'Preliminary price estimate shown to customer' AFTER special_notes;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tires' AND COLUMN_NAME = 'full_size_string') THEN
        ALTER TABLE tires ADD COLUMN full_size_string VARCHAR(40) DEFAULT NULL
            COMMENT 'Human-readable size, e.g., 265/70R17' AFTER model_name;
    END IF;
END //
DELIMITER ;
CALL _mig007();
DROP PROCEDURE IF EXISTS _mig007;

-- Backfill full_size_string from existing component columns
UPDATE tires SET full_size_string = CONCAT(width_mm, '/', aspect_ratio, 'R', CAST(wheel_diameter AS UNSIGNED))
WHERE full_size_string IS NULL AND width_mm IS NOT NULL AND size_format = 'metric';

UPDATE tires SET full_size_string = CONCAT(CAST(width_mm/10 AS DECIMAL(4,1)), 'x', CAST(aspect_ratio/10 AS DECIMAL(4,1)), 'R', CAST(wheel_diameter AS UNSIGNED))
WHERE full_size_string IS NULL AND width_mm IS NOT NULL AND size_format = 'flotation';
