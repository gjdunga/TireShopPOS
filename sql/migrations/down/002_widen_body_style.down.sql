-- Down: 002_widen_body_style.sql
ALTER TABLE plate_lookup_cache MODIFY COLUMN body_style VARCHAR(50) DEFAULT NULL;
