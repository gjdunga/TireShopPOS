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
define('BASE_PATH', dirname(__DIR__));
define('PUBLIC_PATH', __DIR__);

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

// Lazy-load: only parse additional files when the URI requires them.
// Closures in routes/api.php are registered but not executed until dispatch,
// so the file only needs to be loaded before the matching closure runs.
$uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);

// P3 (901 lines): settings, warranties, wheels, fitment, custom fields,
// API keys, recalls, barcodes, labels, notifications, public storefront.
if (preg_match('#^/api/(settings|config|warranty|wheels|fitment|custom-field|api-key|recalls|barcode|labels|notifications|public|website-config)#', $uri)) {
    require_once BASE_PATH . '/php/tire_pos_p3.php';
}

// P6 (352 lines): marketplace, integrations, B2B, directory, distributors.
if (preg_match('#^/api/(integrations|marketplace|b2b|directory|distributors)#', $uri)) {
    require_once BASE_PATH . '/php/tire_pos_p6.php';
}

// VehicleLookupService (845 lines): plate lookup, VIN decode/validate.
if (preg_match('#^/api/vehicles/(lookup|validate)#', $uri)) {
    require_once BASE_PATH . '/php/VehicleLookupService.php';
}

// ---- Create router and load routes ----
$router = new \App\Http\Router();

require BASE_PATH . '/routes/api.php';

// ---- Dispatch ----
$router->dispatch();
