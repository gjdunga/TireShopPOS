-- ============================================================================
-- Migration 003: Add columns referenced by CRUD but missing from schema.
--
-- Idempotent: checks column existence before adding. Safe to re-run.
--
-- DunganSoft Technologies, March 2026
-- ============================================================================

DELIMITER //
CREATE PROCEDURE IF NOT EXISTS _migration_003()
BEGIN
    -- notification_log.sent_by
    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notification_log' AND COLUMN_NAME = 'sent_by')
    THEN
        ALTER TABLE notification_log ADD COLUMN sent_by INT DEFAULT NULL AFTER error_message;
        ALTER TABLE notification_log ADD CONSTRAINT fk_nl_sent_by FOREIGN KEY (sent_by) REFERENCES users(user_id);
    END IF;

    -- b2b_network_inventory.listing_type
    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'b2b_network_inventory' AND COLUMN_NAME = 'listing_type')
    THEN
        ALTER TABLE b2b_network_inventory
            ADD COLUMN listing_type ENUM('sell','wholesale','trade') NOT NULL DEFAULT 'sell' AFTER wheel_id,
            ADD COLUMN max_quantity SMALLINT UNSIGNED DEFAULT NULL AFTER min_order_qty,
            ADD COLUMN description TEXT DEFAULT NULL AFTER max_quantity;
    END IF;

    -- directory_listings.profile_data
    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'directory_listings' AND COLUMN_NAME = 'profile_data')
    THEN
        ALTER TABLE directory_listings ADD COLUMN profile_data JSON DEFAULT NULL AFTER notes;
    END IF;

    -- integration_sync_log.entity_type
    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'integration_sync_log' AND COLUMN_NAME = 'entity_type')
    THEN
        ALTER TABLE integration_sync_log
            ADD COLUMN entity_type VARCHAR(40) DEFAULT NULL AFTER duration_ms,
            ADD COLUMN entity_id INT DEFAULT NULL AFTER entity_type;
    END IF;

    -- integration_credentials.expires_at
    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'integration_credentials' AND COLUMN_NAME = 'expires_at')
    THEN
        ALTER TABLE integration_credentials
            ADD COLUMN expires_at DATETIME DEFAULT NULL AFTER environment,
            ADD COLUMN updated_by INT DEFAULT NULL AFTER expires_at;
        ALTER TABLE integration_credentials
            ADD CONSTRAINT fk_ic_updated_by FOREIGN KEY (updated_by) REFERENCES users(user_id);
    END IF;
END //
DELIMITER ;

CALL _migration_003();
DROP PROCEDURE IF EXISTS _migration_003;
