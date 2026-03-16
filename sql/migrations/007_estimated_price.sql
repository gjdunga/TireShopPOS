-- ============================================================================
-- Migration 007: Add estimated_price to work_orders + full_size_string to tires
--
-- estimated_price: preliminary pricing on work orders (refactor: cash handling
-- removed, work orders now carry an estimate instead of linking to invoices).
--
-- full_size_string: human-readable tire size (e.g., "265/70R17") used by
-- CRUD functions, marketplace listings, work order detail, public inventory.
-- The schema stores individual components (width_mm, aspect_ratio, wheel_diameter)
-- and computes size_display in v_tire_inventory, but 30+ CRUD references
-- expect a stored full_size_string column.
--
-- DunganSoft Technologies, March 2026
-- ============================================================================

ALTER TABLE work_orders
    ADD COLUMN IF NOT EXISTS estimated_price DECIMAL(10,2) DEFAULT NULL
    COMMENT 'Preliminary price estimate shown to customer'
    AFTER special_notes;

ALTER TABLE tires
    ADD COLUMN IF NOT EXISTS full_size_string VARCHAR(40) DEFAULT NULL
    COMMENT 'Human-readable size, e.g., 265/70R17'
    AFTER model_name;

-- Backfill full_size_string from existing component columns
UPDATE tires SET full_size_string = CONCAT(width_mm, '/', aspect_ratio, 'R', CAST(wheel_diameter AS UNSIGNED))
WHERE full_size_string IS NULL AND width_mm IS NOT NULL AND size_format = 'metric';

UPDATE tires SET full_size_string = CONCAT(CAST(width_mm/10 AS DECIMAL(4,1)), 'x', CAST(aspect_ratio/10 AS DECIMAL(4,1)), 'R', CAST(wheel_diameter AS UNSIGNED))
WHERE full_size_string IS NULL AND width_mm IS NOT NULL AND size_format = 'flotation';
