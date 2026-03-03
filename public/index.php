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
// Procedural helpers bridged to use Database::pdo() via getDB() shim.
// These functions are called by route handlers behind RBAC middleware.
require_once BASE_PATH . '/php/tire_pos_helpers.php';

// ---- Create router and load routes ----
$router = new \App\Http\Router();

require BASE_PATH . '/routes/api.php';

// ---- Dispatch ----
$router->dispatch();
