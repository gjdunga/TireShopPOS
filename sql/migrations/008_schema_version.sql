-- ============================================================================
-- Migration 008: Schema version tracking
--
-- Creates the schema_version and schema_migrations tables that track
-- install history, applied migrations, database engine, and upgrade path.
--
-- Compatible with MySQL 8.0+ and MariaDB 10.6+.
--
-- DunganSoft Technologies, March 2026
-- ============================================================================

CREATE TABLE IF NOT EXISTS schema_version (
    id              INT NOT NULL DEFAULT 1 PRIMARY KEY,
    app_version     VARCHAR(20) NOT NULL COMMENT 'Application version at install/upgrade',
    schema_version  VARCHAR(20) NOT NULL COMMENT 'Schema version (matches SQL file header)',
    db_engine       VARCHAR(40) DEFAULT NULL COMMENT 'MySQL or MariaDB',
    db_engine_version VARCHAR(40) DEFAULT NULL COMMENT 'e.g., 8.0.36 or 10.11.6',
    installed_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'First install timestamp',
    last_upgraded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_migration  VARCHAR(80) DEFAULT NULL COMMENT 'Filename of last applied migration',
    total_migrations INT NOT NULL DEFAULT 0,
    total_skipped   INT NOT NULL DEFAULT 0,
    installer_user  VARCHAR(60) DEFAULT NULL COMMENT 'OS user who ran the installer',
    CONSTRAINT chk_singleton CHECK (id = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS schema_migrations (
    migration_id    INT AUTO_INCREMENT PRIMARY KEY,
    filename        VARCHAR(120) NOT NULL COMMENT 'e.g., 001_sessions_table.sql',
    checksum        VARCHAR(64) DEFAULT NULL COMMENT 'SHA-256 of the migration file at apply time',
    applied_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    duration_ms     INT DEFAULT NULL COMMENT 'Execution time in milliseconds',
    success         TINYINT(1) NOT NULL DEFAULT 1,
    skipped         TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 = was available but not applied',
    skip_reason     VARCHAR(255) DEFAULT NULL COMMENT 'Why it was skipped (e.g., already applied)',
    error_message   TEXT DEFAULT NULL COMMENT 'Error output if success = 0',
    applied_by      VARCHAR(60) DEFAULT NULL COMMENT 'OS user who applied this migration',
    app_version     VARCHAR(20) DEFAULT NULL COMMENT 'App version when this ran',

    UNIQUE KEY uq_filename (filename)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
