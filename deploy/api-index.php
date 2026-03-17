<?php
/**
 * API Front Controller (production deployment).
 *
 * This file lives at: public_html/api/index.php
 * It sets BASE_PATH to the repo root outside the document root,
 * then includes the real front controller which handles lazy-loading.
 *
 * Layout:
 *   /home/<user>/domains/<domain>/
 *     app/               <- git clone (BASE_PATH points here)
 *     public_html/       <- document root
 *       api/index.php    <- this file
 *
 * DunganSoft Technologies, March 2026
 */

declare(strict_types=1);

// The repo clone is two levels up from public_html/api/, then into app/
// public_html/api/index.php -> ../../app
define('BASE_PATH', dirname(__DIR__, 2) . '/app');
define('PUBLIC_PATH', dirname(__DIR__));

// Verify the repo exists at the expected path
if (!is_dir(BASE_PATH . '/app/Core')) {
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode([
        'error' => true,
        'code' => 'DEPLOY_ERROR',
        'message' => 'Application not found at expected path. Run deploy.sh.',
    ]);
    exit(1);
}

// Delegate to the real front controller (which handles autoloading,
// lazy-loading of business logic, routing, and dispatch).
require BASE_PATH . '/public/index.php';
