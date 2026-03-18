-- ============================================================================
-- Migration 003: Add columns referenced by CRUD but missing from schema.
--
-- Found by systematic integration audit. Each column is used in PHP
-- INSERT/UPDATE/SELECT statements but was never added to the table.
--
-- DunganSoft Technologies, March 2026
-- ============================================================================

-- notification_log: track who triggered the notification
ALTER TABLE notification_log
    ADD COLUMN sent_by INT DEFAULT NULL AFTER error_message,
    ADD CONSTRAINT fk_nl_sent_by FOREIGN KEY (sent_by) REFERENCES users(user_id);

-- b2b_network_inventory: listing categorization and limits
ALTER TABLE b2b_network_inventory
    ADD COLUMN listing_type ENUM('sell','wholesale','trade') NOT NULL DEFAULT 'sell' AFTER wheel_id,
    ADD COLUMN max_quantity SMALLINT UNSIGNED DEFAULT NULL AFTER min_order_qty,
    ADD COLUMN description TEXT DEFAULT NULL AFTER max_quantity;

-- directory_listings: optional profile data (JSON)
ALTER TABLE directory_listings
    ADD COLUMN profile_data JSON DEFAULT NULL AFTER notes;

-- integration_sync_log: entity tracking for sync operations
-- (entity_type and entity_id referenced in INSERT but not in schema)
ALTER TABLE integration_sync_log
    ADD COLUMN entity_type VARCHAR(40) DEFAULT NULL AFTER duration_ms,
    ADD COLUMN entity_id INT DEFAULT NULL AFTER entity_type;

-- integration_credentials: expiration and audit trail
ALTER TABLE integration_credentials
    ADD COLUMN expires_at DATETIME DEFAULT NULL AFTER environment,
    ADD COLUMN updated_by INT DEFAULT NULL AFTER expires_at,
    ADD CONSTRAINT fk_ic_updated_by FOREIGN KEY (updated_by) REFERENCES users(user_id);
