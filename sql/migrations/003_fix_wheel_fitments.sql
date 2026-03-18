-- ============================================================================
-- Migration 003: Fix wheel_fitments column names, add is_oem.
--
-- Schema had year_from/year_to but all PHP and frontend code used
-- year_start/year_end (consistent with lkp_torque_specs). The is_oem
-- column was referenced in PHP INSERT and frontend display but never
-- existed in the table.
--
-- DunganSoft Technologies, March 2026
-- ============================================================================

ALTER TABLE wheel_fitments
    CHANGE COLUMN year_from year_start SMALLINT UNSIGNED DEFAULT NULL,
    CHANGE COLUMN year_to   year_end   SMALLINT UNSIGNED DEFAULT NULL,
    ADD COLUMN is_oem TINYINT(1) NOT NULL DEFAULT 0 AFTER trim_level;
