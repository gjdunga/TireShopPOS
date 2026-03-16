-- ============================================================================
-- Migration 012: Rate limiting + optimistic locking support
--
-- rate_limit_hits: sliding window counter for request rate limiting.
-- No schema changes for optimistic locking (uses existing updated_at columns).
--
-- DunganSoft Technologies, March 2026
-- ============================================================================

CREATE TABLE IF NOT EXISTS rate_limit_hits (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    scope_key   VARCHAR(120) NOT NULL COMMENT 'ip:1.2.3.4 or user:42',
    hit_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX idx_rl_scope (scope_key, hit_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Cleanup event: purge hits older than 1 hour (runs daily)
-- Note: requires event_scheduler=ON in MySQL. Safe to skip if not available.
DELIMITER //
CREATE EVENT IF NOT EXISTS purge_rate_limit_hits
ON SCHEDULE EVERY 1 HOUR
DO
BEGIN
    DELETE FROM rate_limit_hits WHERE hit_at < DATE_SUB(NOW(), INTERVAL 2 HOUR);
END//
DELIMITER ;
