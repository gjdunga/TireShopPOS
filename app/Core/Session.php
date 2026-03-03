<?php
declare(strict_types=1);

namespace App\Core;

/**
 * Database-backed session manager.
 *
 * Tokens are 64-character hex strings (32 bytes from random_bytes).
 * Sessions are stored in the sessions table with expiry and IP tracking.
 * The client sends the token via Authorization: Bearer <token> header.
 *
 * DunganSoft Technologies, March 2026
 */
class Session
{
    /** @var int Default session lifetime in seconds (1 hour) */
    private static int $lifetime = 3600;

    /** @var array|null Cached current session data (avoids repeated DB lookups) */
    private static ?array $current = null;

    /**
     * Create a new session for a user.
     *
     * @param int $userId The authenticated user's ID
     * @return array Session record: token, user_id, expires_at, created_at
     */
    public static function create(int $userId): array
    {
        $lifetime = (int) Env::get('SESSION_LIFETIME', (string) self::$lifetime);
        $token = bin2hex(random_bytes(32));
        $expiresAt = date('Y-m-d H:i:s', time() + $lifetime);

        Database::execute(
            "INSERT INTO sessions (user_id, token, ip_address, user_agent, expires_at)
             VALUES (?, ?, ?, ?, ?)",
            [
                $userId,
                $token,
                $_SERVER['REMOTE_ADDR'] ?? null,
                self::truncate($_SERVER['HTTP_USER_AGENT'] ?? null, 255),
                $expiresAt,
            ]
        );

        return [
            'token' => $token,
            'user_id' => $userId,
            'expires_at' => $expiresAt,
            'created_at' => date('Y-m-d H:i:s'),
        ];
    }

    /**
     * Validate a session token and return session + user data.
     *
     * Checks that the token exists and has not expired.
     * Updates last_active_at and extends expiry on each valid access.
     *
     * @param string $token The session token
     * @return array|null Session data with user info, or null if invalid/expired
     */
    public static function validate(string $token): ?array
    {
        if (self::$current !== null && self::$current['token'] === $token) {
            return self::$current;
        }

        $row = Database::queryOne(
            "SELECT s.session_id, s.user_id, s.token, s.expires_at, s.created_at,
                    s.ip_address, s.last_active_at,
                    u.username, u.display_name, u.role_id, u.is_active,
                    u.force_password_change,
                    r.role_name
             FROM sessions s
             JOIN users u ON s.user_id = u.user_id
             JOIN roles r ON u.role_id = r.role_id
             WHERE s.token = ? AND s.expires_at > NOW()",
            [$token]
        );

        if ($row === null) {
            return null;
        }

        // Reject sessions for inactive users
        if (!(bool) $row['is_active']) {
            self::destroy($token);
            return null;
        }

        // Slide the expiry window on each valid access
        $lifetime = (int) Env::get('SESSION_LIFETIME', (string) self::$lifetime);
        $newExpiry = date('Y-m-d H:i:s', time() + $lifetime);

        Database::execute(
            "UPDATE sessions SET last_active_at = NOW(), expires_at = ? WHERE token = ?",
            [$newExpiry, $token]
        );

        $row['expires_at'] = $newExpiry;
        self::$current = $row;

        return $row;
    }

    /**
     * Destroy a session by token.
     *
     * @param string $token The session token to invalidate
     */
    public static function destroy(string $token): void
    {
        Database::execute("DELETE FROM sessions WHERE token = ?", [$token]);
        if (self::$current !== null && self::$current['token'] === $token) {
            self::$current = null;
        }
    }

    /**
     * Destroy all sessions for a user (e.g., on password change).
     *
     * @param int    $userId      The user whose sessions to invalidate
     * @param string|null $except Token to keep (current session on password change)
     */
    public static function destroyAllForUser(int $userId, ?string $except = null): void
    {
        if ($except !== null) {
            Database::execute(
                "DELETE FROM sessions WHERE user_id = ? AND token != ?",
                [$userId, $except]
            );
        } else {
            Database::execute("DELETE FROM sessions WHERE user_id = ?", [$userId]);
        }

        self::$current = null;
    }

    /**
     * Clean up expired sessions (call from cron or health endpoint).
     *
     * @return int Number of expired sessions removed
     */
    public static function cleanup(): int
    {
        return Database::execute("DELETE FROM sessions WHERE expires_at <= NOW()");
    }

    /**
     * Get the current validated session (if validate() was called this request).
     *
     * @return array|null
     */
    public static function current(): ?array
    {
        return self::$current;
    }

    /**
     * Extract the bearer token from the Authorization header.
     *
     * Accepts: "Bearer <token>" or raw "<token>"
     *
     * @return string|null The token, or null if not present
     */
    public static function tokenFromRequest(): ?string
    {
        $header = $_SERVER['HTTP_AUTHORIZATION']
            ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION']
            ?? null;

        if ($header === null) {
            return null;
        }

        // Strip "Bearer " prefix if present
        if (str_starts_with($header, 'Bearer ')) {
            return substr($header, 7);
        }

        return $header;
    }

    /**
     * Count active (non-expired) sessions for a user.
     *
     * @param int $userId
     * @return int
     */
    public static function countActive(int $userId): int
    {
        return (int) Database::scalar(
            "SELECT COUNT(*) FROM sessions WHERE user_id = ? AND expires_at > NOW()",
            [$userId]
        );
    }

    /**
     * Reset cached state (primarily for testing).
     */
    public static function reset(): void
    {
        self::$current = null;
    }

    /**
     * Truncate a string to a max length (for DB column limits).
     */
    private static function truncate(?string $value, int $max): ?string
    {
        if ($value === null) {
            return null;
        }
        return strlen($value) > $max ? substr($value, 0, $max) : $value;
    }
}
