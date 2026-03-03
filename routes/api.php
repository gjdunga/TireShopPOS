<?php
declare(strict_types=1);

/**
 * API Route Definitions.
 *
 * All routes are registered on the $router instance passed from index.php.
 * Handler signature: function(array $params, array $body): array
 *
 * $params = path parameters (e.g. {id} -> $params['id'])
 * $body   = parsed JSON request body
 *
 * Return values:
 *   - Array with 'success' key: sent as-is (for Auth responses)
 *   - Any other array: wrapped in { success: true, data: ... }
 *   - null: sends 204 No Content
 *
 * DunganSoft Technologies, March 2026
 */

use App\Core\Database;
use App\Core\Session;
use App\Http\Auth;
use App\Http\Router;

/** @var Router $router */

// ============================================================================
// Health
// ============================================================================

$router->get('/api/health', function () use ($app) {
    $dbHealth = Database::health();
    $overall = $dbHealth['connected'] ? 'ok' : 'degraded';

    $cleaned = 0;
    if ($dbHealth['connected']) {
        try { $cleaned = Session::cleanup(); } catch (\Throwable $e) {}
    }

    return [
        'status' => $overall,
        'app' => $app->name(),
        'version' => $app->version(),
        'debug' => $app->isDebug(),
        'timestamp' => date('c'),
        'php' => PHP_VERSION,
        'database' => $dbHealth,
        'expired_sessions_cleaned' => $cleaned,
    ];
});

// ============================================================================
// Auth
// ============================================================================

$router->post('/api/auth/login', function (array $params, array $body) {
    return Auth::login($body);
});

$router->post('/api/auth/logout', function () {
    $token = Session::tokenFromRequest();
    return Auth::logout($token);
});

$router->post('/api/auth/password', function (array $params, array $body) {
    $token = Session::tokenFromRequest();
    return Auth::changePassword($token, $body);
});

$router->get('/api/auth/session', function () {
    $token = Session::tokenFromRequest();

    if ($token === null) {
        Router::sendError('NOT_AUTHENTICATED', 'No token provided.', 401);
    }

    $session = Session::validate($token);

    if ($session === null) {
        Router::sendError('NOT_AUTHENTICATED', 'Invalid or expired session.', 401);
    }

    $permissions = Database::query(
        "SELECT p.permission_key FROM role_permissions rp
         JOIN users u ON rp.role_id = u.role_id
         JOIN permissions p ON rp.permission_id = p.permission_id
         WHERE u.user_id = ? AND u.is_active = 1",
        [(int) $session['user_id']]
    );

    return [
        'user_id' => (int) $session['user_id'],
        'username' => $session['username'],
        'display_name' => $session['display_name'],
        'role' => $session['role_name'],
        'session_created' => $session['created_at'],
        'session_expires' => $session['expires_at'],
        'permissions' => array_column($permissions, 'permission_key'),
    ];
});
