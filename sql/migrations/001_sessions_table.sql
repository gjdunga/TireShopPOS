-- Migration 001: Sessions table + audit_log enum extension
-- Database-backed sessions for API authentication.
-- Tokens are 64-char hex strings (32 bytes, cryptographically random).
-- DunganSoft Technologies, March 2026

CREATE TABLE IF NOT EXISTS sessions (
    session_id      INT AUTO_INCREMENT PRIMARY KEY,
    user_id         INT NOT NULL,
    token           VARCHAR(64) NOT NULL UNIQUE,
    ip_address      VARCHAR(45) DEFAULT NULL,
    user_agent      VARCHAR(255) DEFAULT NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at      DATETIME NOT NULL,
    last_active_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_session_user FOREIGN KEY (user_id) REFERENCES users(user_id),
    INDEX idx_session_token (token),
    INDEX idx_session_user (user_id),
    INDEX idx_session_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Extend audit_log action enum to support auth events
ALTER TABLE audit_log
    MODIFY COLUMN action ENUM(
        'INSERT','UPDATE','DELETE','STATUS_CHANGE',
        'LOGIN','LOGOUT','FAILED_LOGIN',
        'PASSWORD_CHANGE','SESSION_CREATE','SESSION_DESTROY'
    ) NOT NULL;
