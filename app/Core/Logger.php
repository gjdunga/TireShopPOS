<?php
declare(strict_types=1);

namespace App\Core;

/**
 * ============================================================================
 * Logger: Structured JSON-line logging with request context.
 * ============================================================================
 *
 * Writes one JSON object per line to storage/logs/app.log. Every entry
 * includes a request_id, timestamp, level, and message.
 *
 * DunganSoft Technologies, March 2026
 * ============================================================================
 */
class Logger
{
    private static ?string $requestId = null;
    private static ?string $logPath = null;
    private static float $requestStart = 0.0;
    private static string $minLevel = 'info';

    private const LEVELS = [
        'debug' => 0, 'info' => 1, 'warning' => 2, 'error' => 3, 'critical' => 4,
    ];

    private const SLOW_QUERY_MS = 500;

    public static function init(): void
    {
        self::$requestId = substr(bin2hex(random_bytes(8)), 0, 16);
        self::$requestStart = microtime(true);
        self::$minLevel = strtolower(Env::get('APP_LOG_LEVEL', 'info'));
        $basePath = defined('BASE_PATH') ? BASE_PATH : dirname(__DIR__, 2);
        self::$logPath = $basePath . '/storage/logs/app.log';
    }

    public static function requestId(): string { return self::$requestId ?? 'no-request'; }

    public static function elapsed(): float
    {
        return self::$requestStart > 0 ? round((microtime(true) - self::$requestStart) * 1000, 2) : 0.0;
    }

    public static function debug(string $message, array $context = []): void { self::log('debug', $message, $context); }
    public static function info(string $message, array $context = []): void { self::log('info', $message, $context); }
    public static function warning(string $message, array $context = []): void { self::log('warning', $message, $context); }
    public static function error(string $message, array $context = []): void { self::log('error', $message, $context); }
    public static function critical(string $message, array $context = []): void { self::log('critical', $message, $context); }

    public static function request(string $method, string $uri, int $status, ?int $userId = null): void
    {
        $level = ($status >= 500) ? 'error' : (($status >= 400) ? 'warning' : 'info');
        self::log($level, 'request', [
            'method' => $method, 'uri' => $uri, 'status' => $status,
            'duration_ms' => self::elapsed(), 'user_id' => $userId,
            'ip' => $_SERVER['REMOTE_ADDR'] ?? null,
        ]);
    }

    public static function exception(\Throwable $e, array $context = []): void
    {
        self::log('error', get_class($e) . ': ' . $e->getMessage(), array_merge([
            'file' => $e->getFile() . ':' . $e->getLine(),
            'trace' => array_slice(array_map(
                fn($f) => ($f['file'] ?? '?') . ':' . ($f['line'] ?? '?') . ' '
                    . ($f['class'] ?? '') . ($f['type'] ?? '') . ($f['function'] ?? ''),
                $e->getTrace()
            ), 0, 5),
        ], $context));
    }

    public static function slowQuery(string $sql, float $ms, array $params = []): void
    {
        $paramTypes = array_map(function ($v) {
            if ($v === null) return 'null';
            if (is_int($v)) return 'int';
            if (is_float($v)) return 'float';
            if (is_string($v)) return 'string(' . strlen($v) . ')';
            return gettype($v);
        }, $params);
        self::log('warning', 'slow_query', [
            'sql' => substr($sql, 0, 500), 'duration_ms' => round($ms, 2), 'param_types' => $paramTypes,
        ]);
    }

    public static function slowQueryThreshold(): float
    {
        return (float) Env::get('SLOW_QUERY_MS', (string) self::SLOW_QUERY_MS);
    }

    public static function rateLimitHit(string $scopeKey, int $count, int $limit): void
    {
        self::log('warning', 'rate_limit_exceeded', ['scope' => $scopeKey, 'count' => $count, 'limit' => $limit]);
    }

    public static function authFailure(string $reason, ?string $username = null): void
    {
        self::log('warning', 'auth_failure', [
            'reason' => $reason, 'username' => $username, 'ip' => $_SERVER['REMOTE_ADDR'] ?? null,
        ]);
    }

    private static function log(string $level, string $message, array $context = []): void
    {
        $levelPriority = self::LEVELS[$level] ?? 1;
        $minPriority = self::LEVELS[self::$minLevel] ?? 1;
        if ($levelPriority < $minPriority) return;

        $entry = [
            'ts' => date('Y-m-d\TH:i:s.') . substr((string) microtime(true), -3) . date('P'),
            'level' => $level,
            'request_id' => self::$requestId ?? 'boot',
            'message' => $message,
        ];
        if (!empty($context)) $entry['ctx'] = $context;

        $line = json_encode($entry, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        if ($line === false) return;

        $path = self::$logPath;
        if ($path === null) {
            $basePath = defined('BASE_PATH') ? BASE_PATH : dirname(__DIR__, 2);
            $path = $basePath . '/storage/logs/app.log';
        }
        @file_put_contents($path, $line . "\n", FILE_APPEND | LOCK_EX);
    }
}
