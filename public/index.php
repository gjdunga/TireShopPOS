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

// ---- Helper: read JSON request body ----
function jsonBody(): array {
    $raw = file_get_contents('php://input');
    if ($raw === '' || $raw === false) {
        return [];
    }
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

// ---- Helper: send JSON response ----
function jsonResponse(array $data, int $status = 200): never {
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    exit;
}

// Temporary route handling (replaced in P1d by App\Http\Router)
if ($uri === '/api/health' && $method === 'GET') {
    $dbHealth = \App\Core\Database::health();
    $overall = $dbHealth['connected'] ? 'ok' : 'degraded';

    // Clean up expired sessions while we're here
    $cleaned = 0;
    if ($dbHealth['connected']) {
        try { $cleaned = \App\Core\Session::cleanup(); } catch (\Throwable $e) {}
    }

    jsonResponse([
        'status' => $overall,
        'app' => $app->name(),
        'version' => $app->version(),
        'debug' => $app->isDebug(),
        'timestamp' => date('c'),
        'php' => PHP_VERSION,
        'database' => $dbHealth,
        'expired_sessions_cleaned' => $cleaned,
    ]);
}

// ---- Auth routes (P1c) ----

if ($uri === '/api/auth/login' && $method === 'POST') {
    $result = \App\Http\Auth::login(jsonBody());
    $status = $result['status'] ?? ($result['success'] ? 200 : 400);
    unset($result['status']);
    jsonResponse($result, $status);
}

if ($uri === '/api/auth/logout' && $method === 'POST') {
    $token = \App\Core\Session::tokenFromRequest();
    $result = \App\Http\Auth::logout($token);
    $status = $result['status'] ?? 200;
    unset($result['status']);
    jsonResponse($result, $status);
}

if ($uri === '/api/auth/password' && $method === 'POST') {
    $token = \App\Core\Session::tokenFromRequest();
    $result = \App\Http\Auth::changePassword($token, jsonBody());
    $status = $result['status'] ?? ($result['success'] ? 200 : 400);
    unset($result['status']);
    jsonResponse($result, $status);
}

if ($uri === '/api/auth/session' && $method === 'GET') {
    $token = \App\Core\Session::tokenFromRequest();
    if ($token === null) {
        jsonResponse(['success' => false, 'error' => true, 'code' => 'NOT_AUTHENTICATED', 'message' => 'No token provided.'], 401);
    }
    $session = \App\Core\Session::validate($token);
    if ($session === null) {
        jsonResponse(['success' => false, 'error' => true, 'code' => 'NOT_AUTHENTICATED', 'message' => 'Invalid or expired session.'], 401);
    }
    $permissions = \App\Core\Database::query(
        "SELECT p.permission_key FROM role_permissions rp
         JOIN users u ON rp.role_id = u.role_id
         JOIN permissions p ON rp.permission_id = p.permission_id
         WHERE u.user_id = ? AND u.is_active = 1",
        [(int) $session['user_id']]
    );
    jsonResponse([
        'success' => true,
        'data' => [
            'user_id' => (int) $session['user_id'],
            'username' => $session['username'],
            'display_name' => $session['display_name'],
            'role' => $session['role_name'],
            'session_created' => $session['created_at'],
            'session_expires' => $session['expires_at'],
            'permissions' => array_column($permissions, 'permission_key'),
        ],
    ]);
}

// Default: 404 for any unmatched route
jsonResponse([
    'error' => true,
    'code' => 'NOT_FOUND',
    'message' => 'Route not found: ' . $method . ' ' . $uri,
], 404);
