<?php
/**
 * Front Controller.
 *
 * Every HTTP request enters here (via .htaccess rewrite).
 * Bootstraps the application, loads route definitions, and dispatches.
 *
 * This is the ONLY PHP file in /public. Everything else
 * lives outside the web root for security.
 *
 * DunganSoft Technologies, March 2026
 */

declare(strict_types=1);

// ---- Define base paths ----
// In production, deploy/api-index.php pre-defines these before including us.
// In dev (php -S), this file is the entry point so we define them here.
if (!defined('BASE_PATH'))  define('BASE_PATH', dirname(__DIR__));
if (!defined('PUBLIC_PATH')) define('PUBLIC_PATH', __DIR__);

// ---- Bootstrap autoloader ----
require_once BASE_PATH . '/app/Core/Autoloader.php';

$autoloader = new \App\Core\Autoloader(BASE_PATH);
$autoloader->addNamespace('App\\', 'app');
$autoloader->register();

// ---- Boot application ----
$app = new \App\Core\App(BASE_PATH);
$app->boot();

// ---- Load business logic functions ----
// Core helpers + CRUD: loaded on every request (auth, customers, vehicles,
// tires, work orders, appointments, purchase orders, vendors, reports).
require_once BASE_PATH . '/php/tire_pos_helpers.php';
require_once BASE_PATH . '/php/tire_pos_crud.php';
require_once BASE_PATH . '/php/InputValidator.php';

// Lazy-load: only parse additional files when the URI requires them.
// Closures in routes/api.php are registered but not executed until dispatch,
// so the file only needs to be loaded before the matching closure runs.
// Resolve the route for lazy-loading decisions
if (isset($_GET['_']) && $_GET['_'] !== '') {
    $uri = urldecode($_GET['_']);
    if (!str_starts_with($uri, '/api')) $uri = '/api' . $uri;
} else {
    $uri = str_replace('/index.php', '', parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH));
}

// P3 (935 lines): settings, warranties, wheels, fitment, custom fields,
// API keys, recalls, barcodes, labels, notifications, public storefront.
if (preg_match('#^/api/(settings|config|warranty|wheels|fitment|custom-field|api-key|recalls|barcode|labels|notifications|public|website-config)#', $uri)) {
    require_once BASE_PATH . '/php/tire_pos_p3.php';
}

// P6 (374 lines): marketplace, integrations, B2B, directory, distributors.
if (preg_match('#^/api/(integrations|marketplace|b2b|directory|distributors)#', $uri)) {
    require_once BASE_PATH . '/php/tire_pos_p6.php';
}

// VehicleLookupService (794 lines): plate lookup, VIN decode/validate.
// PlateProviders routes use inline require_once and don't need this gate.
if (preg_match('#^/api/vehicles/(lookup|validate)#', $uri)) {
    require_once BASE_PATH . '/php/VehicleLookupService.php';
}

// ---- Create router and load routes ----
$router = new \App\Http\Router();

require BASE_PATH . '/routes/api.php';

// ---- Dispatch ----
$router->dispatch();
