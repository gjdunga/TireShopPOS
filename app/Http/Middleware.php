<?php
declare(strict_types=1);

namespace App\Http;

use App\Core\Database;
use App\Core\Session;

/**
 * Middleware factories for route protection.
 *
 * Returns callables that the Router executes before the route handler.
 * If a check fails, the middleware calls Router::sendError() which exits.
 * If it passes, execution continues to the next middleware or the handler.
 *
 * Usage in routes/api.php:
 *   $router->with([Middleware::auth()])->get('/api/foo', $handler);
 *   $router->with([Middleware::auth(), Middleware::permit('INVENTORY_VIEW')])->get('/api/tires', $handler);
 *
 * The auth() middleware stores the validated session in Middleware::$session
 * so handlers can access the current user via Middleware::session().
 *
 * DunganSoft Technologies, March 2026
 */
class Middleware
{
    /** @var array|null Session data set by auth() middleware */
    private static ?array $session = null;

    /** @var string[]|null Cached permissions for the current user */
    private static ?array $permissions = null;

    /**
     * Get the session set by the auth middleware.
     * Available inside route handlers after auth() middleware has run.
     *
     * @return array Session data (user_id, username, display_name, role_name, etc.)
     */
    public static function session(): array
    {
        if (self::$session === null) {
            Router::sendError('NOT_AUTHENTICATED', 'Authentication required.', 401);
        }
        return self::$session;
    }

    /**
     * Get the current user ID. Shortcut for session()['user_id'].
     */
    public static function userId(): int
    {
        return (int) self::session()['user_id'];
    }

    /**
     * Get the current user's role name.
     */
    public static function role(): string
    {
        return self::session()['role_name'] ?? 'unknown';
    }

    /**
     * Check if the current user has a specific permission.
     * Does NOT exit on failure (unlike permit() middleware).
     *
     * @param string $permissionKey
     * @return bool
     */
    public static function can(string $permissionKey): bool
    {
        self::loadPermissions();
        return in_array($permissionKey, self::$permissions, true);
    }

    // ================================================================
    // Middleware factories
    // ================================================================

    /**
     * Require a valid session. Sends 401 if no token or session expired.
     *
     * Also rejects users with force_password_change = 1 from all endpoints
     * except /api/auth/password and /api/auth/logout (handled by the check
     * only running on non-auth routes since auth routes have no middleware).
     *
     * @return callable
     */
    public static function auth(): callable
    {
        return function () {
            $token = Session::tokenFromRequest();

            if ($token === null) {
                Router::sendError('NOT_AUTHENTICATED', 'Authentication required. Send Authorization: Bearer <token>.', 401);
            }

            $session = Session::validate($token);

            if ($session === null) {
                Router::sendError('NOT_AUTHENTICATED', 'Invalid or expired session.', 401);
            }

            self::$session = $session;
            self::$permissions = null; // Reset permission cache for new session

            // Block force_password_change users from business endpoints.
            // They must change their password first via POST /api/auth/password
            // (which has no middleware).
            if (!empty($session['force_password_change'])) {
                Router::sendError(
                    'PASSWORD_CHANGE_REQUIRED',
                    'You must change your password before accessing other features.',
                    403
                );
            }
        };
    }

    /**
     * Require one or more permissions (OR logic: user needs at least one).
     * Must be used after auth() in the middleware chain.
     *
     * @param string ...$permissionKeys One or more permission keys
     * @return callable
     */
    public static function permit(string ...$permissionKeys): callable
    {
        return function () use ($permissionKeys) {
            if (self::$session === null) {
                Router::sendError('NOT_AUTHENTICATED', 'Authentication required.', 401);
            }

            self::loadPermissions();

            foreach ($permissionKeys as $key) {
                if (in_array($key, self::$permissions, true)) {
                    return; // At least one permission matched
                }
            }

            Router::sendError(
                'FORBIDDEN',
                'You do not have permission to perform this action. Required: ' . implode(' or ', $permissionKeys),
                403
            );
        };
    }

    /**
     * Require ALL of the listed permissions (AND logic).
     *
     * @param string ...$permissionKeys
     * @return callable
     */
    public static function permitAll(string ...$permissionKeys): callable
    {
        return function () use ($permissionKeys) {
            if (self::$session === null) {
                Router::sendError('NOT_AUTHENTICATED', 'Authentication required.', 401);
            }

            self::loadPermissions();

            $missing = [];
            foreach ($permissionKeys as $key) {
                if (!in_array($key, self::$permissions, true)) {
                    $missing[] = $key;
                }
            }

            if (!empty($missing)) {
                Router::sendError(
                    'FORBIDDEN',
                    'Missing required permissions: ' . implode(', ', $missing),
                    403
                );
            }
        };
    }

    // ================================================================
    // Internal
    // ================================================================

    /**
     * Load the current user's permissions from the DB (cached per request).
     */
    private static function loadPermissions(): void
    {
        if (self::$permissions !== null) {
            return;
        }

        if (self::$session === null) {
            self::$permissions = [];
            return;
        }

        $rows = Database::query(
            "SELECT p.permission_key FROM role_permissions rp
             JOIN users u ON rp.role_id = u.role_id
             JOIN permissions p ON rp.permission_id = p.permission_id
             WHERE u.user_id = ? AND u.is_active = 1",
            [(int) self::$session['user_id']]
        );

        self::$permissions = array_column($rows, 'permission_key');
    }

    /**
     * Reset state (primarily for testing).
     */
    public static function reset(): void
    {
        self::$session = null;
        self::$permissions = null;
    }
}
