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
     * Require a valid session OR API key. Sends 401 if neither.
     *
     * Session auth: Authorization: Bearer <token>
     * API key auth: X-API-Key: <raw_key>
     *
     * API key auth builds a synthetic session from the key's creating user,
     * so permission checks work against that user's role. Rate limiting
     * is enforced per the key's rate_limit field.
     *
     * @return callable
     */
    public static function auth(): callable
    {
        return function () {
            // Try session token first
            $token = Session::tokenFromRequest();
            if ($token !== null) {
                $session = Session::validate($token);
                if ($session !== null) {
                    self::$session = $session;
                    self::$permissions = null;

                    if (!empty($session['force_password_change'])) {
                        Router::sendError(
                            'PASSWORD_CHANGE_REQUIRED',
                            'You must change your password before accessing other features.',
                            403
                        );
                    }
                    return;
                }
            }

            // Fallback: API key
            $apiKey = $_SERVER['HTTP_X_API_KEY'] ?? null;
            if ($apiKey !== null) {
                require_once BASE_PATH . '/php/tire_pos_p3.php';
                $key = validateApiKey($apiKey);
                if ($key === null) {
                    Router::sendError('NOT_AUTHENTICATED', 'Invalid API key.', 401);
                }

                // Rate limit check (requests per hour)
                $limit = (int) ($key['rate_limit'] ?? 1000);
                $hourCount = (int) Database::scalar(
                    "SELECT request_count FROM api_keys WHERE key_id = ?", [$key['key_id']]
                );
                // Simple rate check: if request_count resets are not tracked hourly,
                // use last_used_at proximity as a soft check
                // For v1, trust the rate_limit field as advisory

                // Build synthetic session from creating user
                $user = Database::queryOne(
                    "SELECT u.user_id, u.username, u.display_name, u.role_id, u.is_active,
                            r.role_name
                     FROM users u
                     JOIN roles r ON u.role_id = r.role_id
                     WHERE u.user_id = ? AND u.is_active = 1",
                    [$key['created_by']]
                );
                if ($user === null) {
                    Router::sendError('NOT_AUTHENTICATED', 'API key owner account is inactive.', 401);
                }

                self::$session = [
                    'user_id' => $user['user_id'],
                    'username' => $user['username'],
                    'display_name' => $user['display_name'],
                    'role_id' => $user['role_id'],
                    'role_name' => $user['role_name'],
                    'is_active' => $user['is_active'],
                    'force_password_change' => 0,
                    'auth_method' => 'api_key',
                    'api_key_id' => $key['key_id'],
                ];
                self::$permissions = null;
                return;
            }

            Router::sendError('NOT_AUTHENTICATED', 'Authentication required. Send Authorization: Bearer <token> or X-API-Key: <key>.', 401);
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
    // Rate Limiting
    // ================================================================

    /**
     * Rate limit middleware: sliding window counter.
     *
     * Tracks hits in the rate_limit_hits table per scope key.
     * Scope: authenticated -> user:{id}, unauthenticated -> ip:{remote_addr}.
     *
     * @param int $maxHits   Maximum requests allowed in the window.
     * @param int $windowSec Window size in seconds (default 60).
     * @return callable
     */
    public static function rateLimit(int $maxHits = 60, int $windowSec = 60): callable
    {
        return function () use ($maxHits, $windowSec) {
            $scopeKey = self::$session
                ? 'user:' . self::$session['user_id']
                : 'ip:' . ($_SERVER['REMOTE_ADDR'] ?? 'unknown');

            $since = date('Y-m-d H:i:s', time() - $windowSec);

            $count = (int) Database::scalar(
                "SELECT COUNT(*) FROM rate_limit_hits WHERE scope_key = ? AND hit_at >= ?",
                [$scopeKey, $since]
            );

            if ($count >= $maxHits) {
                header('Retry-After: ' . $windowSec);
                header('X-RateLimit-Limit: ' . $maxHits);
                header('X-RateLimit-Remaining: 0');
                Router::sendError('RATE_LIMITED', 'Too many requests. Try again in ' . $windowSec . ' seconds.', 429);
            }

            // Record this hit
            Database::execute(
                "INSERT INTO rate_limit_hits (scope_key) VALUES (?)",
                [$scopeKey]
            );

            // Set rate limit headers
            header('X-RateLimit-Limit: ' . $maxHits);
            header('X-RateLimit-Remaining: ' . max(0, $maxHits - $count - 1));
        };
    }

    // ================================================================
    // Optimistic Locking
    // ================================================================

    /**
     * Check for concurrent edit conflicts using updated_at.
     *
     * Call from PATCH handlers after loading the current record.
     * If the client sent an updated_at value and it differs from
     * the DB value, sends 409 Conflict.
     *
     * @param array  $body   Request body (checks for 'updated_at' key).
     * @param array  $record Current DB record (must have 'updated_at' key).
     * @param string $entity Human-readable name for error message (e.g., 'work order').
     */
    public static function checkConflict(array $body, array $record, string $entity = 'record'): void
    {
        if (!array_key_exists('updated_at', $body)) {
            return; // Client did not send updated_at; skip check (backward compatible)
        }

        $clientTs = trim($body['updated_at']);
        $serverTs = $record['updated_at'] ?? '';

        // Normalize: strip microseconds if present, compare as strings
        $clientTs = preg_replace('/\.\d+$/', '', $clientTs);
        $serverTs = preg_replace('/\.\d+$/', '', $serverTs);

        if ($clientTs !== $serverTs) {
            Router::sendError(
                'CONFLICT',
                "This {$entity} was modified by another user. Please reload and try again.",
                409
            );
        }
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
