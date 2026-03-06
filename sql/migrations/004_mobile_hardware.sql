-- ============================================================================
-- Migration 004: Mobile and Hardware (Phase 4)
-- Adds notification_log for customer communications.
-- DunganSoft Technologies, March 2026
-- ============================================================================

CREATE TABLE IF NOT EXISTS notification_log (
    notification_id     INT AUTO_INCREMENT PRIMARY KEY,
    customer_id         INT NOT NULL,
    channel             ENUM('sms','email','internal') NOT NULL DEFAULT 'internal',
    notification_type   VARCHAR(40) NOT NULL COMMENT 'appointment_reminder, retorque_reminder, wo_status, deposit_expiring, custom',
    subject             VARCHAR(255) DEFAULT NULL,
    body                TEXT NOT NULL,
    status              ENUM('pending','sent','failed') NOT NULL DEFAULT 'pending',
    sent_at             DATETIME DEFAULT NULL,
    sent_by             INT DEFAULT NULL,
    error_message       VARCHAR(255) DEFAULT NULL,
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_nl_customer FOREIGN KEY (customer_id) REFERENCES customers(customer_id),
    CONSTRAINT fk_nl_user     FOREIGN KEY (sent_by) REFERENCES users(user_id),
    INDEX idx_nl_customer (customer_id),
    INDEX idx_nl_status (status),
    INDEX idx_nl_type (notification_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
