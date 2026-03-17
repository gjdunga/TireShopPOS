-- ============================================================================
-- Migration 002: Widen plate_lookup_cache.body_style to VARCHAR(120).
--
-- NHTSA returns values like:
--   "Sport Utility Vehicle (SUV)/Multi-Purpose Vehicle (MPV)" (53 chars)
-- The original VARCHAR(50) truncated these, causing SQL error 22001.
--
-- DunganSoft Technologies, March 2026
-- ============================================================================

ALTER TABLE plate_lookup_cache MODIFY COLUMN body_style VARCHAR(120) DEFAULT NULL;
