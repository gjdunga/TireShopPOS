-- ============================================================================
-- Migration 013: Webhook endpoints and delivery log
--
-- Outbound: webhook_endpoints stores subscriber URLs with HMAC secrets
--   and event subscriptions. webhook_deliveries logs every delivery attempt.
-- Inbound: webhook_inbound_log records incoming webhook payloads from
--   external providers (Flowroute, marketplace platforms, etc.).
--
-- DunganSoft Technologies, March 2026
-- ============================================================================

CREATE TABLE IF NOT EXISTS webhook_endpoints (
    endpoint_id     INT AUTO_INCREMENT PRIMARY KEY,
    url             VARCHAR(500) NOT NULL COMMENT 'Target URL for outbound POST',
    secret          VARCHAR(120) NOT NULL COMMENT 'HMAC-SHA256 signing secret',
    label           VARCHAR(120) DEFAULT NULL COMMENT 'Human-friendly name',
    events          JSON NOT NULL COMMENT '["WO_CREATE","WO_COMPLETE",...]',
    is_active       TINYINT(1) NOT NULL DEFAULT 1,
    created_by      INT DEFAULT NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_whe_user FOREIGN KEY (created_by) REFERENCES users(user_id),
    INDEX idx_whe_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS webhook_deliveries (
    delivery_id     BIGINT AUTO_INCREMENT PRIMARY KEY,
    endpoint_id     INT NOT NULL,
    event_type      VARCHAR(40) NOT NULL,
    payload         JSON NOT NULL,
    status          ENUM('pending','sent','failed') NOT NULL DEFAULT 'pending',
    response_code   SMALLINT DEFAULT NULL,
    response_body   TEXT DEFAULT NULL COMMENT 'First 1000 chars of response',
    attempts        TINYINT NOT NULL DEFAULT 0,
    max_attempts    TINYINT NOT NULL DEFAULT 3,
    next_retry_at   DATETIME DEFAULT NULL,
    error_message   VARCHAR(255) DEFAULT NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at    DATETIME DEFAULT NULL,

    CONSTRAINT fk_whd_endpoint FOREIGN KEY (endpoint_id) REFERENCES webhook_endpoints(endpoint_id) ON DELETE CASCADE,
    INDEX idx_whd_status (status, next_retry_at),
    INDEX idx_whd_endpoint (endpoint_id),
    INDEX idx_whd_event (event_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS webhook_inbound_log (
    inbound_id      BIGINT AUTO_INCREMENT PRIMARY KEY,
    provider        VARCHAR(40) NOT NULL COMMENT 'flowroute, facebook_marketplace, etc.',
    event_type      VARCHAR(60) DEFAULT NULL,
    payload         JSON NOT NULL,
    headers         JSON DEFAULT NULL COMMENT 'Relevant request headers',
    signature_valid TINYINT(1) DEFAULT NULL COMMENT '1=verified, 0=failed, NULL=no sig',
    processed       TINYINT(1) NOT NULL DEFAULT 0,
    process_result  VARCHAR(255) DEFAULT NULL,
    remote_ip       VARCHAR(45) DEFAULT NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_whi_provider (provider, created_at),
    INDEX idx_whi_processed (processed)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
