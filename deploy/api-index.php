<?php
/**
 * API Front Controller (production deployment).
 *
 * This file lives at: public_html/api/index.php
 * It sets BASE_PATH to the repo root outside the document root,
 * then includes the real front controller.
 *
 * Layout:
 *   /home/bearlyused/domains/pos.bearlyused.net/
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

// Bootstrap autoloader
require_once BASE_PATH . '/app/Core/Autoloader.php';

$autoloader = new \App\Core\Autoloader(BASE_PATH);
$autoloader->addNamespace('App\\', 'app');
$autoloader->register();

// Boot application
$app = new \App\Core\App(BASE_PATH);
$app->boot();

// Load business logic functions
require_once BASE_PATH . '/php/tire_pos_helpers.php';
require_once BASE_PATH . '/php/tire_pos_crud.php';
require_once BASE_PATH . '/php/tire_pos_p3.php';
require_once BASE_PATH . '/php/tire_pos_p5.php';
require_once BASE_PATH . '/php/tire_pos_p6.php';
require_once BASE_PATH . '/php/VehicleLookupService.php';

// Create router and load routes
$router = new \App\Http\Router();

require BASE_PATH . '/routes/api.php';

// Dispatch
$router->dispatch();
