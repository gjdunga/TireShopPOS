<?php
declare(strict_types=1);

namespace App\Http;

use App\Core\Database;
use App\Core\Session;

/**
 * Authentication service.
 *
 * Handles login, logout, and password change. Wraps the procedural
 * auth functions in tire_pos_helpers.php (lockout, password history,
 * audit logging) through the Database class instead of the legacy getDB().
 *
 * All methods return structured arrays suitable for JSON serialization.
 * Error arrays include a 'code' field for client-side handling.
 *
 * DunganSoft Technologies, March 2026
 */
class Auth
{
    // ---- Error codes ----
    public const ERR_MISSING_FIELDS    = 'MISSING_FIELDS';
    public const ERR_ACCOUNT_LOCKED    = 'ACCOUNT_LOCKED';
    public const ERR_INVALID_CREDS     = 'INVALID_CREDENTIALS';
    public const ERR_ACCOUNT_DISABLED  = 'ACCOUNT_DISABLED';
    public const ERR_NOT_AUTHENTICATED = 'NOT_AUTHENTICATED';
    public const ERR_PASSWORD_REUSED   = 'PASSWORD_REUSED';
    public const ERR_PASSWORD_WEAK     = 'PASSWORD_WEAK';
    public const ERR_WRONG_PASSWORD    = 'WRONG_CURRENT_PASSWORD';

    /**
     * Authenticate a user and create a session.
     *
     * Flow:
     *   1. Validate input (username + password required)
     *   2. Look up user by username
     *   3. Check account lock (5 failures, 15-min cooldown)
     *   4. Verify password (bcrypt)
     *   5. Check account is active
     *   6. Record successful login, create session
     *   7. Return session token + user profile
     *
     * @param array $input Request body: {username, password}
     * @return array {success, data|error, code?, status?}
     */
    public static function login(array $input): array
    {
        $username = trim($input['username'] ?? '');
        $password = $input['password'] ?? '';

        if ($username === '' || $password === '') {
            return self::fail(self::ERR_MISSING_FIELDS, 'Username and password are required.', 400);
        }

        // Look up user
        $user = Database::queryOne(
            "SELECT user_id, username, password_hash, display_name, email,
                    role_id, is_active, force_password_change,
                    failed_login_count, locked_until
             FROM users WHERE username = ?",
            [$username]
        );

        if ($user === null) {
            // Constant-time: run bcrypt on dummy hash so response time is
            // indistinguishable from a real user with wrong password.
            password_verify($password, '$2y$12$DummyHashToPreventTimingOracleOnUserEnum000000000000000');
            return self::fail(self::ERR_INVALID_CREDS, 'Invalid username or password.', 401);
        }

        $userId = (int) $user['user_id'];

        // Check account lock
        if ($user['locked_until'] !== null) {
            $lockedUntil = new \DateTime($user['locked_until']);
            $now = new \DateTime();

            if ($lockedUntil > $now) {
                $minutesLeft = (int) ceil(($lockedUntil->getTimestamp() - $now->getTimestamp()) / 60);
                return self::fail(
                    self::ERR_ACCOUNT_LOCKED,
                    "Account locked. Try again in {$minutesLeft} minute(s).",
                    423
                );
            }
        }

        // Verify password
        if (!password_verify($password, $user['password_hash'])) {
            self::recordFailedLogin($userId);
            return self::fail(self::ERR_INVALID_CREDS, 'Invalid username or password.', 401);
        }

        // Check active status
        if (!(bool) $user['is_active']) {
            return self::fail(self::ERR_ACCOUNT_DISABLED, 'Account is disabled. Contact the shop owner.', 403);
        }

        // Success: reset failures, record login, create session
        self::recordSuccessfulLogin($userId);
        $session = Session::create($userId);

        // Get role name for the response
        $role = Database::queryOne(
            "SELECT role_name FROM roles WHERE role_id = ?",
            [(int) $user['role_id']]
        );

        // Get permissions for session context
        $permissions = self::getUserPermissions($userId);

        // Check password expiration
        $passwordExpired = self::isPasswordExpired($userId);

        return [
            'success' => true,
            'data' => [
                'token' => $session['token'],
                'expires_at' => $session['expires_at'],
                'user' => [
                    'user_id' => $userId,
                    'username' => $user['username'],
                    'display_name' => $user['display_name'],
                    'email' => $user['email'],
                    'role' => $role['role_name'] ?? 'unknown',
                    'force_password_change' => (bool) $user['force_password_change'],
                    'password_expired' => $passwordExpired,
                    'permissions' => $permissions,
                ],
            ],
        ];
    }

    /**
     * Destroy the current session (log out).
     *
     * @param string|null $token Session token from the Authorization header
     * @return array {success, data|error}
     */
    public static function logout(?string $token): array
    {
        if ($token === null) {
            return self::fail(self::ERR_NOT_AUTHENTICATED, 'No session token provided.', 401);
        }

        $session = Session::validate($token);

        if ($session === null) {
            // Token invalid or expired, but that's fine for logout
            return ['success' => true, 'data' => ['message' => 'Session already expired or invalid.']];
        }

        // Audit the logout
        self::auditLog('users', (int) $session['user_id'], 'LOGOUT', (int) $session['user_id']);

        Session::destroy($token);

        return ['success' => true, 'data' => ['message' => 'Logged out successfully.']];
    }

    /**
     * Change the authenticated user's password.
     *
     * Flow:
     *   1. Validate session
     *   2. Verify current password
     *   3. Validate new password strength
     *   4. Check password history (last 5)
     *   5. Update password, record in history
     *   6. Invalidate all other sessions
     *   7. Clear force_password_change flag
     *
     * @param string|null $token Session token
     * @param array       $input {current_password, new_password}
     * @return array {success, data|error}
     */
    public static function changePassword(?string $token, array $input): array
    {
        if ($token === null) {
            return self::fail(self::ERR_NOT_AUTHENTICATED, 'No session token provided.', 401);
        }

        $session = Session::validate($token);

        if ($session === null) {
            return self::fail(self::ERR_NOT_AUTHENTICATED, 'Invalid or expired session.', 401);
        }

        $userId = (int) $session['user_id'];
        $currentPassword = $input['current_password'] ?? '';
        $newPassword = $input['new_password'] ?? '';

        if ($currentPassword === '' || $newPassword === '') {
            return self::fail(self::ERR_MISSING_FIELDS, 'Both current_password and new_password are required.', 400);
        }

        // Verify current password
        $user = Database::queryOne(
            "SELECT password_hash FROM users WHERE user_id = ?",
            [$userId]
        );

        if ($user === null || !password_verify($currentPassword, $user['password_hash'])) {
            return self::fail(self::ERR_WRONG_PASSWORD, 'Current password is incorrect.', 403);
        }

        // Validate new password strength
        $strengthCheck = self::validatePasswordStrength($newPassword);
        if ($strengthCheck !== null) {
            return self::fail(self::ERR_PASSWORD_WEAK, $strengthCheck, 400);
        }

        // Check password history (last 5)
        if (self::isPasswordReused($userId, $newPassword)) {
            return self::fail(self::ERR_PASSWORD_REUSED, 'Password was used recently. Choose a different password.', 400);
        }

        // Hash and update
        $newHash = password_hash($newPassword, PASSWORD_BCRYPT, ['cost' => 12]);

        Database::transaction(function () use ($userId, $newHash, $user) {
            // Save current hash to history before overwriting
            Database::execute(
                "INSERT INTO password_history (user_id, password_hash) VALUES (?, ?)",
                [$userId, $user['password_hash']]
            );

            // Update user record
            Database::execute(
                "UPDATE users SET password_hash = ?, password_changed_at = NOW(),
                        force_password_change = 0 WHERE user_id = ?",
                [$newHash, $userId]
            );
        });

        // Audit
        self::auditLog('users', $userId, 'PASSWORD_CHANGE', $userId);

        // Invalidate all other sessions (keep the current one)
        Session::destroyAllForUser($userId, $token);

        return [
            'success' => true,
            'data' => [
                'message' => 'Password changed successfully.',
                'other_sessions_terminated' => true,
            ],
        ];
    }

    /**
     * Get the currently authenticated user from the request token.
     * Returns null if not authenticated (no token, invalid, or expired).
     *
     * @return array|null Session data with user info
     */
    public static function user(): ?array
    {
        $token = Session::tokenFromRequest();
        if ($token === null) {
            return null;
        }
        return Session::validate($token);
    }

    /**
     * Require authentication. Returns session data or sends 401 and exits.
     *
     * @return array Session data
     */
    public static function requireAuth(): array
    {
        $session = self::user();

        if ($session === null) {
            http_response_code(401);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode(
                self::fail(self::ERR_NOT_AUTHENTICATED, 'Authentication required.', 401),
                JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT
            );
            exit;
        }

        return $session;
    }

    // ================================================================
    // Private helpers (wrap procedural functions from tire_pos_helpers.php)
    // These use Database:: instead of getDB() for consistency.
    // ================================================================

    /**
     * Record a failed login attempt. Increments counter, locks after 5.
     */
    private static function recordFailedLogin(int $userId): void
    {
        Database::execute(
            "UPDATE users SET
                failed_login_count = failed_login_count + 1,
                locked_until = CASE
                    WHEN failed_login_count >= 4 THEN DATE_ADD(NOW(), INTERVAL 15 MINUTE)
                    ELSE locked_until
                END
            WHERE user_id = ?",
            [$userId]
        );

        // Note: the WHEN >= 4 triggers on the 5th attempt because
        // failed_login_count has already been incremented by +1 in the same
        // statement (the SET runs before the CASE reads the new value: false).
        // Actually MySQL evaluates the CASE against the OLD value before the
        // update. So failed_login_count is still 4 when the CASE runs,
        // meaning the update sets it to 5 and locks. At count=0 the first
        // failure sets it to 1, CASE sees 0 (< 4), no lock. At count=3,
        // failure sets it to 4, CASE sees 3, no lock. At count=4, failure
        // sets it to 5, CASE sees 4 (>= 4), lock triggers. This matches
        // the "lock after 5 failures" requirement.

        self::auditLog('users', $userId, 'FAILED_LOGIN', $userId);
    }

    /**
     * Record a successful login. Resets failure counter.
     */
    private static function recordSuccessfulLogin(int $userId): void
    {
        Database::execute(
            "UPDATE users SET
                failed_login_count = 0,
                locked_until = NULL,
                last_login_at = NOW()
            WHERE user_id = ?",
            [$userId]
        );

        self::auditLog('users', $userId, 'LOGIN', $userId);
    }

    /**
     * Check if a password was used in the last N entries.
     */
    private static function isPasswordReused(int $userId, string $newPasswordPlain, int $depth = 5): bool
    {
        $rows = Database::query(
            "SELECT password_hash FROM password_history
             WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
            [$userId, $depth]
        );

        $hashes = array_column($rows, 'password_hash');

        // Also check current password
        $current = Database::scalar(
            "SELECT password_hash FROM users WHERE user_id = ?",
            [$userId]
        );

        if ($current !== null) {
            $hashes[] = $current;
        }

        foreach ($hashes as $hash) {
            if (password_verify($newPasswordPlain, $hash)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Check if password has expired (>30 days since last change).
     */
    private static function isPasswordExpired(int $userId, int $maxAgeDays = 30): bool
    {
        $changedAt = Database::scalar(
            "SELECT password_changed_at FROM users WHERE user_id = ?",
            [$userId]
        );

        if ($changedAt === null) {
            return true; // Never changed, force change
        }

        $changed = new \DateTime($changedAt);
        $now = new \DateTime();
        return $changed->diff($now)->days > $maxAgeDays;
    }

    /**
     * Get all permission keys for a user.
     *
     * @return string[]
     */
    private static function getUserPermissions(int $userId): array
    {
        $rows = Database::query(
            "SELECT p.permission_key FROM role_permissions rp
             JOIN users u ON rp.role_id = u.role_id
             JOIN permissions p ON rp.permission_id = p.permission_id
             WHERE u.user_id = ? AND u.is_active = 1",
            [$userId]
        );

        return array_column($rows, 'permission_key');
    }

    /**
     * Validate password strength.
     *
     * Requirements:
     *   - At least 8 characters
     *   - At least one uppercase letter
     *   - At least one lowercase letter
     *   - At least one digit
     *
     * @param string $password The plaintext password
     * @return string|null Error message, or null if valid
     */
    public static function validatePasswordStrength(string $password): ?string
    {
        if (strlen($password) < 8) {
            return 'Password must be at least 8 characters.';
        }

        if (!preg_match('/[A-Z]/', $password)) {
            return 'Password must contain at least one uppercase letter.';
        }

        if (!preg_match('/[a-z]/', $password)) {
            return 'Password must contain at least one lowercase letter.';
        }

        if (!preg_match('/[0-9]/', $password)) {
            return 'Password must contain at least one digit.';
        }

        return null;
    }

    /**
     * Write an audit log entry (mirrors tire_pos_helpers.php auditLog()).
     */
    private static function auditLog(string $table, int $recordId, string $action, ?int $changedBy = null): void
    {
        Database::execute(
            "INSERT INTO audit_log (table_name, record_id, action, changed_by, ip_address)
             VALUES (?, ?, ?, ?, ?)",
            [$table, $recordId, $action, $changedBy, $_SERVER['REMOTE_ADDR'] ?? null]
        );
    }

    /**
     * Build a structured error response.
     */
    private static function fail(string $code, string $message, int $status = 400): array
    {
        return [
            'success' => false,
            'error' => true,
            'code' => $code,
            'message' => $message,
            'status' => $status,
        ];
    }
}
