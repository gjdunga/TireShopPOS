-- ============================================================================
-- Migration 001: v1.2.0 Baseline
--
-- This is a no-op migration that records the v1.2.0 baseline.
-- All prior migrations (001-016 from v1.0.x and v1.1.x) have been
-- collapsed into tire_pos_schema_full.sql. Future migrations start
-- from 002.
--
-- DunganSoft Technologies, March 2026
-- ============================================================================

-- Record baseline (schema_version table created by base schema)
UPDATE schema_version SET version = '1.2.0', last_migration = '001_v1.2.0_baseline.sql'
WHERE id = 1;
