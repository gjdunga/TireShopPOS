<?php
/**
 * Database configuration.
 *
 * All values read from .env. Defaults assume a local MySQL 8.x
 * instance on the standard port with no password (dev only).
 *
 * DunganSoft Technologies, March 2026
 */

use App\Core\Env;

return [

    // PDO driver (only mysql is supported for this application)
    'driver' => 'mysql',

    'host' => Env::get('DB_HOST', '127.0.0.1'),
    'port' => (int) Env::get('DB_PORT', '3306'),
    'database' => Env::get('DB_DATABASE', 'tire_shop'),
    'username' => Env::get('DB_USERNAME', 'root'),
    'password' => Env::get('DB_PASSWORD', ''),

    // Unix socket (overrides host:port when set, used for local testing)
    'socket' => Env::get('DB_SOCKET', ''),

    // Character set: must be utf8mb4 to match schema CREATE TABLE defaults
    'charset' => 'utf8mb4',
    'collation' => 'utf8mb4_unicode_ci',

    // PDO options applied at connection time
    'options' => [
        // Throw exceptions on error (not silent failures)
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,

        // Return associative arrays by default
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,

        // Use native prepared statements (not emulated)
        PDO::ATTR_EMULATE_PREPARES => false,

        // Persistent connections: reduces connection overhead on repeated requests
        // Safe for single-server local deployments. Disable if connection pooling
        // is handled externally (e.g. ProxySQL).
        PDO::ATTR_PERSISTENT => filter_var(
            Env::get('DB_PERSISTENT', 'true'),
            FILTER_VALIDATE_BOOLEAN
        ),

        // Return integer and float columns as native PHP types (not strings)
        PDO::ATTR_STRINGIFY_FETCHES => false,
    ],

    // MySQL session variables set on every new connection.
    // STRICT_TRANS_TABLES: reject invalid data rather than truncating silently.
    // NO_ZERO_DATE/NO_ZERO_IN_DATE: enforce valid dates in schema.
    // ERROR_FOR_DIVISION_BY_ZERO: raise error instead of returning NULL.
    'session_vars' => [
        "SET SESSION sql_mode = 'STRICT_TRANS_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO'",
        "SET SESSION time_zone = '-07:00'", // Mountain Time (Canon City, CO)
    ],

];
