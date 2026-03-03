<?php
/**
 * Front Controller.
 *
 * Every HTTP request enters here (via .htaccess rewrite).
 * Bootstraps the application, then delegates to the router.
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
// The autoloader itself must be loaded manually (chicken-and-egg).
require_once BASE_PATH . '/app/Core/Autoloader.php';

$autoloader = new \App\Core\Autoloader(BASE_PATH);
$autoloader->addNamespace('App\\', 'app');
$autoloader->register();

// ---- Boot application ----
$app = new \App\Core\App(BASE_PATH);
$app->boot();

// ---- Router entry point (P1d) ----
// For now, P1a returns a JSON health stub so we can verify the skeleton works.
// This block will be replaced by the router in P1d.

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);

// Strip trailing slash (except root)
if ($uri !== '/' && str_ends_with($uri, '/')) {
    $uri = rtrim($uri, '/');
}

header('Content-Type: application/json; charset=utf-8');

// Temporary route handling (replaced in P1d by App\Http\Router)
if ($uri === '/api/health' && $method === 'GET') {
    $dbHealth = \App\Core\Database::health();
    $overall = $dbHealth['connected'] ? 'ok' : 'degraded';

    echo json_encode([
        'status' => $overall,
        'app' => $app->name(),
        'version' => $app->version(),
        'debug' => $app->isDebug(),
        'timestamp' => date('c'),
        'php' => PHP_VERSION,
        'database' => $dbHealth,
    ], JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    exit;
}

// Default: 404 for any unmatched route
http_response_code(404);
echo json_encode([
    'error' => true,
    'code' => 'NOT_FOUND',
    'message' => 'Route not found: ' . $method . ' ' . $uri,
], JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
