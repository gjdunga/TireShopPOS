<?php
/**
 * Application configuration.
 *
 * Values reference Env::get() so they're driven by .env at runtime.
 * Defaults are safe for production (debug off, Denver timezone).
 *
 * DunganSoft Technologies, March 2026
 */

use App\Core\Env;

return [

    // Application display name
    'name' => Env::get('APP_NAME', 'Tire Shop POS'),

    // Schema version (matches tire_pos_schema_full.sql header)
    'version' => '2.4',

    // Debug mode: true shows detailed errors, false returns generic messages
    // NEVER set true in production
    'debug' => filter_var(Env::get('APP_DEBUG', 'false'), FILTER_VALIDATE_BOOLEAN),

    // PHP timezone (Canon City, Colorado = America/Denver)
    'timezone' => Env::get('APP_TIMEZONE', 'America/Denver'),

    // Base URL for the application (used in receipt URLs, email links, etc.)
    'url' => Env::get('APP_URL', 'http://localhost'),

    // Logging
    'log_level' => Env::get('APP_LOG_LEVEL', 'error'),

    // CORS allowed origin (* = any, or specific domain like https://pos.example.com)
    'cors_origin' => Env::get('CORS_ORIGIN', '*'),

];
