<?php
declare(strict_types=1);

namespace App\Core;

/**
 * Database connection factory and query interface.
 *
 * Provides a singleton PDO connection configured from config/database.php.
 * Runs session variables on first connect. Exposes query helpers that
 * wrap PDO prepared statements with consistent error handling.
 *
 * Replaces the procedural getDB() in tire_pos_helpers.php.
 * The old function used env vars DB_NAME/DB_USER/DB_PASS;
 * this class reads DB_DATABASE/DB_USERNAME/DB_PASSWORD per .env.example.
 *
 * DunganSoft Technologies, March 2026
 */
class Database
{
    /** @var \PDO|null Singleton connection */
    private static ?\PDO $pdo = null;

    /** @var float|null Timestamp of last successful connection */
    private static ?float $connectedAt = null;

    /**
     * Get the PDO connection (creates it on first call).
     *
     * @return \PDO
     * @throws \RuntimeException If connection fails
     */
    public static function connection(): \PDO
    {
        if (self::$pdo !== null) {
            return self::$pdo;
        }

        $cfg = Config::file('database');

        $socket = $cfg['socket'] ?? '';
        if ($socket !== '') {
            $dsn = sprintf(
                '%s:unix_socket=%s;dbname=%s;charset=%s',
                $cfg['driver'] ?? 'mysql',
                $socket,
                $cfg['database'] ?? 'tire_shop',
                $cfg['charset'] ?? 'utf8mb4'
            );
        } else {
            $dsn = sprintf(
                '%s:host=%s;port=%d;dbname=%s;charset=%s',
                $cfg['driver'] ?? 'mysql',
                $cfg['host'] ?? '127.0.0.1',
                $cfg['port'] ?? 3306,
                $cfg['database'] ?? 'tire_shop',
                $cfg['charset'] ?? 'utf8mb4'
            );
        }

        $options = $cfg['options'] ?? [];

        // Carry forward FOUND_ROWS from legacy getDB() in tire_pos_helpers.php.
        // UPDATE statements return matched rows (not changed rows), which
        // several business logic functions depend on.
        if (!isset($options[\PDO::MYSQL_ATTR_FOUND_ROWS])) {
            $options[\PDO::MYSQL_ATTR_FOUND_ROWS] = true;
        }

        try {
            self::$pdo = new \PDO(
                $dsn,
                $cfg['username'] ?? 'root',
                $cfg['password'] ?? '',
                $options
            );
        } catch (\PDOException $e) {
            throw new \RuntimeException(
                'Database connection failed: ' . $e->getMessage(),
                (int) $e->getCode(),
                $e
            );
        }

        // Run session variables (strict mode, timezone, etc.)
        $sessionVars = $cfg['session_vars'] ?? [];
        foreach ($sessionVars as $sql) {
            self::$pdo->exec($sql);
        }

        self::$connectedAt = microtime(true);

        return self::$pdo;
    }

    /**
     * Execute a SELECT query and return all rows.
     *
     * @param string $sql    SQL with ? or :named placeholders
     * @param array  $params Bound parameters
     * @return array<int, array> Result rows
     */
    public static function query(string $sql, array $params = []): array
    {
        $t = microtime(true);
        $stmt = self::connection()->prepare($sql);
        $stmt->execute($params);
        $result = $stmt->fetchAll();
        $ms = (microtime(true) - $t) * 1000;
        if ($ms >= Logger::slowQueryThreshold()) Logger::slowQuery($sql, $ms, $params);
        return $result;
    }

    /**
     * Execute a SELECT query and return the first row (or null).
     *
     * @param string $sql    SQL with placeholders
     * @param array  $params Bound parameters
     * @return array|null
     */
    public static function queryOne(string $sql, array $params = []): ?array
    {
        $t = microtime(true);
        $stmt = self::connection()->prepare($sql);
        $stmt->execute($params);
        $row = $stmt->fetch();
        $ms = (microtime(true) - $t) * 1000;
        if ($ms >= Logger::slowQueryThreshold()) Logger::slowQuery($sql, $ms, $params);
        return $row !== false ? $row : null;
    }

    /**
     * Execute a scalar query and return a single value.
     *
     * @param string $sql    SQL that returns one column, one row
     * @param array  $params Bound parameters
     * @return mixed The scalar value, or null if no rows
     */
    public static function scalar(string $sql, array $params = []): mixed
    {
        $t = microtime(true);
        $stmt = self::connection()->prepare($sql);
        $stmt->execute($params);
        $val = $stmt->fetchColumn();
        $ms = (microtime(true) - $t) * 1000;
        if ($ms >= Logger::slowQueryThreshold()) Logger::slowQuery($sql, $ms, $params);
        return $val !== false ? $val : null;
    }

    /**
     * Execute an INSERT, UPDATE, or DELETE statement.
     *
     * @param string $sql    SQL with placeholders
     * @param array  $params Bound parameters
     * @return int Number of affected rows
     */
    public static function execute(string $sql, array $params = []): int
    {
        $t = microtime(true);
        $stmt = self::connection()->prepare($sql);
        $stmt->execute($params);
        $affected = $stmt->rowCount();
        $ms = (microtime(true) - $t) * 1000;
        if ($ms >= Logger::slowQueryThreshold()) Logger::slowQuery($sql, $ms, $params);
        return $affected;
    }

    /**
     * Get the last inserted auto-increment ID.
     *
     * @return int
     */
    public static function lastInsertId(): int
    {
        return (int) self::connection()->lastInsertId();
    }

    /**
     * Run a callback inside a transaction.
     *
     * If the callback throws, the transaction is rolled back and the
     * exception re-thrown. If it returns, the transaction is committed.
     *
     * @param callable $callback Receives the PDO instance as argument
     * @return mixed Whatever the callback returns
     * @throws \Throwable Re-thrown from the callback
     */
    public static function transaction(callable $callback): mixed
    {
        $pdo = self::connection();
        $pdo->beginTransaction();

        try {
            $result = $callback($pdo);
            $pdo->commit();
            return $result;
        } catch (\Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }
    }

    /**
     * Check database connectivity and return health info.
     *
     * Returns an associative array with:
     *   connected (bool), server_version, table_count, database_name,
     *   strict_mode (bool), connected_at, error (string|null on failure)
     *
     * @return array
     */
    public static function health(): array
    {
        $result = [
            'connected' => false,
            'server_version' => null,
            'database_name' => null,
            'table_count' => null,
            'strict_mode' => false,
            'error' => null,
        ];

        try {
            $pdo = self::connection();

            $result['connected'] = true;
            $result['connected_at'] = self::$connectedAt
                ? date('c', (int) self::$connectedAt)
                : null;
            $result['server_version'] = $pdo->getAttribute(\PDO::ATTR_SERVER_VERSION);
            $result['database_name'] = self::scalar('SELECT DATABASE()');

            // Count user tables (excludes views)
            $result['table_count'] = (int) self::scalar(
                "SELECT COUNT(*) FROM information_schema.TABLES "
                . "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'"
            );

            // Verify strict mode is active
            $mode = self::scalar("SELECT @@SESSION.sql_mode");
            $result['strict_mode'] = is_string($mode)
                && str_contains($mode, 'STRICT_TRANS_TABLES');

        } catch (\Throwable $e) {
            $result['error'] = $e->getMessage();
        }

        return $result;
    }

    /**
     * Disconnect and reset the singleton (primarily for testing).
     */
    public static function disconnect(): void
    {
        self::$pdo = null;
        self::$connectedAt = null;
    }

    /**
     * Get the raw PDO instance for cases that need direct access
     * (e.g. legacy getDB() compatibility in tire_pos_helpers.php).
     *
     * @return \PDO
     */
    public static function pdo(): \PDO
    {
        return self::connection();
    }
}
