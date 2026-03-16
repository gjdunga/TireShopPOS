-- Down: 001_sessions_table.sql
-- Status: NON-ROLLBACKABLE (foundational schema)
-- The sessions table is required for authentication. Dropping it
-- would lock out all users. Use wipe-and-reinstall instead.
SELECT 'ERROR: Migration 001 is non-rollbackable. Use install.sh option 4 (wipe).' AS message;
