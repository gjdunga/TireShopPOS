-- Down: 012_rate_limit.sql
-- Reverses: rate_limit_hits table and purge event.
-- Safe: only infrastructure table, no business data.

DROP EVENT IF EXISTS purge_rate_limit_hits;
DROP TABLE IF EXISTS rate_limit_hits;
