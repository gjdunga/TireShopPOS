-- ============================================================================
-- Migration 006: Marketplace Integration (Phase 6)
-- 7 new tables: integration_credentials, integration_sync_log,
-- marketplace_listings, marketplace_orders, marketplace_order_items,
-- b2b_network_inventory, directory_listings
--
-- DunganSoft Technologies, March 2026
-- ============================================================================

-- 1. Integration Credentials (encrypted API keys, tokens, secrets)
CREATE TABLE IF NOT EXISTS integration_credentials (
    credential_id   INT AUTO_INCREMENT PRIMARY KEY,
    integration     VARCHAR(40) NOT NULL COMMENT 'atd, tbc, ntw, ebay, b2b',
    credential_key  VARCHAR(60) NOT NULL COMMENT 'api_key, client_id, client_secret, access_token, refresh_token',
    credential_value TEXT NOT NULL COMMENT 'Encrypted or plain depending on deployment',
    environment     ENUM('sandbox','production') NOT NULL DEFAULT 'sandbox',
    is_active       TINYINT(1) NOT NULL DEFAULT 1,
    expires_at      DATETIME DEFAULT NULL,
    updated_by      INT DEFAULT NULL,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_ic_user FOREIGN KEY (updated_by) REFERENCES users(user_id),
    UNIQUE INDEX idx_ic_unique (integration, credential_key, environment),
    INDEX idx_ic_integration (integration)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 2. Integration Sync Log (audit trail for all external API calls)
CREATE TABLE IF NOT EXISTS integration_sync_log (
    sync_id         INT AUTO_INCREMENT PRIMARY KEY,
    integration     VARCHAR(40) NOT NULL,
    action          VARCHAR(60) NOT NULL COMMENT 'list_product, import_order, update_inventory, search_catalog',
    direction       ENUM('outbound','inbound') NOT NULL DEFAULT 'outbound',
    status          ENUM('pending','success','failed','partial') NOT NULL DEFAULT 'pending',
    request_summary VARCHAR(255) DEFAULT NULL,
    response_code   SMALLINT DEFAULT NULL,
    response_summary VARCHAR(255) DEFAULT NULL,
    error_message   TEXT DEFAULT NULL,
    entity_type     VARCHAR(40) DEFAULT NULL COMMENT 'tire, wheel, order',
    entity_id       INT DEFAULT NULL,
    duration_ms     INT UNSIGNED DEFAULT NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_isl_integration (integration, created_at),
    INDEX idx_isl_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 3. Marketplace Listings (tires/wheels listed on external platforms)
CREATE TABLE IF NOT EXISTS marketplace_listings (
    listing_id      INT AUTO_INCREMENT PRIMARY KEY,
    platform        VARCHAR(40) NOT NULL COMMENT 'ebay, craigslist, facebook, offerup, b2b',
    tire_id         INT DEFAULT NULL,
    wheel_id        INT DEFAULT NULL,
    external_id     VARCHAR(120) DEFAULT NULL COMMENT 'eBay item ID, CL post ID, etc.',
    title           VARCHAR(255) NOT NULL,
    description     TEXT DEFAULT NULL,
    price           DECIMAL(8,2) NOT NULL,
    status          ENUM('draft','active','sold','expired','removed') NOT NULL DEFAULT 'draft',
    listed_at       DATETIME DEFAULT NULL,
    expires_at      DATETIME DEFAULT NULL,
    external_url    VARCHAR(500) DEFAULT NULL,
    sync_status     ENUM('pending','synced','error') NOT NULL DEFAULT 'pending',
    last_synced_at  DATETIME DEFAULT NULL,
    created_by      INT NOT NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_ml_tire  FOREIGN KEY (tire_id)  REFERENCES tires(tire_id),
    CONSTRAINT fk_ml_wheel FOREIGN KEY (wheel_id) REFERENCES wheels(wheel_id),
    CONSTRAINT fk_ml_user  FOREIGN KEY (created_by) REFERENCES users(user_id),
    INDEX idx_ml_platform (platform, status),
    INDEX idx_ml_tire (tire_id),
    INDEX idx_ml_wheel (wheel_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 4. Marketplace Orders (orders pulled from external platforms)
CREATE TABLE IF NOT EXISTS marketplace_orders (
    order_id        INT AUTO_INCREMENT PRIMARY KEY,
    platform        VARCHAR(40) NOT NULL,
    external_order_id VARCHAR(120) NOT NULL,
    buyer_name      VARCHAR(120) DEFAULT NULL,
    buyer_email     VARCHAR(120) DEFAULT NULL,
    buyer_phone     VARCHAR(30) DEFAULT NULL,
    buyer_address   TEXT DEFAULT NULL,
    order_total     DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    platform_fees   DECIMAL(8,2) NOT NULL DEFAULT 0.00,
    shipping_cost   DECIMAL(8,2) NOT NULL DEFAULT 0.00,
    status          ENUM('pending','confirmed','shipped','completed','cancelled','refunded')
                        NOT NULL DEFAULT 'pending',
    invoice_id      INT DEFAULT NULL COMMENT 'Linked POS invoice when processed',
    notes           TEXT DEFAULT NULL,
    ordered_at      DATETIME NOT NULL,
    imported_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_mo_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(invoice_id),
    UNIQUE INDEX idx_mo_external (platform, external_order_id),
    INDEX idx_mo_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 5. Marketplace Order Items
CREATE TABLE IF NOT EXISTS marketplace_order_items (
    item_id         INT AUTO_INCREMENT PRIMARY KEY,
    order_id        INT NOT NULL,
    listing_id      INT DEFAULT NULL,
    tire_id         INT DEFAULT NULL,
    wheel_id        INT DEFAULT NULL,
    description     VARCHAR(255) NOT NULL,
    quantity        SMALLINT UNSIGNED NOT NULL DEFAULT 1,
    unit_price      DECIMAL(8,2) NOT NULL,
    line_total      DECIMAL(10,2) NOT NULL,

    CONSTRAINT fk_moi_order   FOREIGN KEY (order_id)   REFERENCES marketplace_orders(order_id),
    CONSTRAINT fk_moi_listing FOREIGN KEY (listing_id) REFERENCES marketplace_listings(listing_id),
    CONSTRAINT fk_moi_tire    FOREIGN KEY (tire_id)    REFERENCES tires(tire_id),
    CONSTRAINT fk_moi_wheel   FOREIGN KEY (wheel_id)   REFERENCES wheels(wheel_id),
    INDEX idx_moi_order (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 6. B2B Network Inventory (shared inventory between participating shops)
CREATE TABLE IF NOT EXISTS b2b_network_inventory (
    b2b_id          INT AUTO_INCREMENT PRIMARY KEY,
    tire_id         INT DEFAULT NULL,
    wheel_id        INT DEFAULT NULL,
    listing_type    ENUM('sell','buy','both') NOT NULL DEFAULT 'sell',
    wholesale_price DECIMAL(8,2) NOT NULL,
    min_quantity    SMALLINT UNSIGNED NOT NULL DEFAULT 1,
    max_quantity    SMALLINT UNSIGNED DEFAULT NULL,
    visible         TINYINT(1) NOT NULL DEFAULT 1 COMMENT 'Visible to other shops on network',
    description     VARCHAR(255) DEFAULT NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_b2b_tire  FOREIGN KEY (tire_id)  REFERENCES tires(tire_id),
    CONSTRAINT fk_b2b_wheel FOREIGN KEY (wheel_id) REFERENCES wheels(wheel_id),
    INDEX idx_b2b_visible (visible, listing_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 7. Directory Listings (shop profile on national tire directories)
CREATE TABLE IF NOT EXISTS directory_listings (
    directory_id    INT AUTO_INCREMENT PRIMARY KEY,
    directory_name  VARCHAR(80) NOT NULL COMMENT 'e.g. TireConnect, TireBuyer, local directories',
    listing_url     VARCHAR(500) DEFAULT NULL,
    listing_status  ENUM('pending','active','suspended','removed') NOT NULL DEFAULT 'pending',
    profile_data    JSON DEFAULT NULL COMMENT 'Submitted shop profile data',
    last_verified   DATE DEFAULT NULL,
    notes           TEXT DEFAULT NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
