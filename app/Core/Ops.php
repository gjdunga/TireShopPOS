<?php
declare(strict_types=1);

namespace App\Core;

/**
 * Operations health checks.
 *
 * Provides system-level health data for the expanded /api/health endpoint:
 * disk usage, backup status, session counts, PHP/OS info, storage writability.
 *
 * DunganSoft Technologies, March 2026
 */
class Ops
{
    /**
     * Gather all operational health data.
     *
     * @return array Keyed sections: disk, backups, sessions, storage, system
     */
    public static function health(): array
    {
        return [
            'disk'     => self::diskHealth(),
            'backups'  => self::backupHealth(),
            'sessions' => self::sessionHealth(),
            'storage'  => self::storageHealth(),
            'system'   => self::systemHealth(),
        ];
    }

    /**
     * Disk usage for the partition containing the app.
     */
    private static function diskHealth(): array
    {
        $basePath = defined('BASE_PATH') ? BASE_PATH : getcwd();
        $totalBytes = @disk_total_space($basePath);
        $freeBytes = @disk_free_space($basePath);

        if ($totalBytes === false || $freeBytes === false) {
            return ['error' => 'Unable to read disk space'];
        }

        $usedBytes = $totalBytes - $freeBytes;
        $usedPct = $totalBytes > 0 ? round(($usedBytes / $totalBytes) * 100, 1) : 0;

        return [
            'total_gb'    => round($totalBytes / 1073741824, 2),
            'used_gb'     => round($usedBytes / 1073741824, 2),
            'free_gb'     => round($freeBytes / 1073741824, 2),
            'used_pct'    => $usedPct,
            'warning'     => $usedPct > 90,
            'critical'    => $usedPct > 95,
        ];
    }

    /**
     * Backup status from JSON status files written by backup scripts.
     */
    private static function backupHealth(): array
    {
        $backupDir = Env::get('BACKUP_PATH', '/var/backups/tire_shop');

        $result = [
            'backup_dir'    => $backupDir,
            'dir_exists'    => is_dir($backupDir),
            'db_backup'     => null,
            'photo_backup'  => null,
            'backup_count'  => 0,
            'total_size_mb' => 0,
        ];

        if (!$result['dir_exists']) {
            return $result;
        }

        // Read last DB backup status
        $dbStatusFile = $backupDir . '/last_backup.json';
        if (file_exists($dbStatusFile)) {
            $raw = file_get_contents($dbStatusFile);
            $parsed = json_decode($raw ?: '', true);
            if (is_array($parsed)) {
                $result['db_backup'] = [
                    'status'    => $parsed['status'] ?? 'unknown',
                    'timestamp' => $parsed['timestamp'] ?? null,
                    'size_mb'   => isset($parsed['size_bytes'])
                        ? round((int) $parsed['size_bytes'] / 1048576, 2)
                        : null,
                    'tables'    => $parsed['tables'] ?? null,
                    'age_hours' => self::ageInHours($parsed['timestamp'] ?? null),
                    'stale'     => self::ageInHours($parsed['timestamp'] ?? null) > 25,
                ];
            }
        }

        // Read last photo backup status
        $photoStatusFile = $backupDir . '/last_photo_backup.json';
        if (file_exists($photoStatusFile)) {
            $raw = file_get_contents($photoStatusFile);
            $parsed = json_decode($raw ?: '', true);
            if (is_array($parsed)) {
                $result['photo_backup'] = [
                    'status'      => $parsed['status'] ?? 'unknown',
                    'timestamp'   => $parsed['timestamp'] ?? null,
                    'total_files' => $parsed['total_files'] ?? 0,
                    'age_hours'   => self::ageInHours($parsed['timestamp'] ?? null),
                    'stale'       => self::ageInHours($parsed['timestamp'] ?? null) > 25,
                ];
            }
        }

        // Count backup files and total size
        $totalSize = 0;
        $count = 0;
        $glob = glob($backupDir . '/*.sql.gz');
        if (is_array($glob)) {
            $count = count($glob);
            foreach ($glob as $file) {
                $totalSize += filesize($file) ?: 0;
            }
        }
        $result['backup_count'] = $count;
        $result['total_size_mb'] = round($totalSize / 1048576, 2);

        return $result;
    }

    /**
     * Session health: active count, expired count, oldest session.
     */
    private static function sessionHealth(): array
    {
        try {
            $active = (int) Database::scalar(
                "SELECT COUNT(*) FROM sessions WHERE expires_at > NOW()"
            );

            $expired = (int) Database::scalar(
                "SELECT COUNT(*) FROM sessions WHERE expires_at <= NOW()"
            );

            $oldest = Database::scalar(
                "SELECT MIN(created_at) FROM sessions WHERE expires_at > NOW()"
            );

            return [
                'active_sessions'  => $active,
                'expired_pending'  => $expired,
                'oldest_active'    => $oldest,
            ];
        } catch (\Throwable $e) {
            return ['error' => 'Unable to query sessions: ' . $e->getMessage()];
        }
    }

    /**
     * Storage directory health: existence, writability, file counts.
     */
    private static function storageHealth(): array
    {
        $basePath = defined('BASE_PATH') ? BASE_PATH : getcwd();
        $dirs = ['logs', 'photos', 'backups'];
        $result = [];

        foreach ($dirs as $dir) {
            $path = $basePath . '/storage/' . $dir;
            $exists = is_dir($path);
            $writable = $exists && is_writable($path);
            $fileCount = 0;

            if ($exists) {
                $files = @scandir($path);
                if (is_array($files)) {
                    // Exclude . and .. and .gitkeep
                    $fileCount = count(array_filter($files, function ($f) {
                        return $f !== '.' && $f !== '..' && $f !== '.gitkeep';
                    }));
                }
            }

            $result[$dir] = [
                'path'       => $path,
                'exists'     => $exists,
                'writable'   => $writable,
                'file_count' => $fileCount,
            ];
        }

        return $result;
    }

    /**
     * System info: PHP version, extensions, OS, memory, uptime.
     */
    private static function systemHealth(): array
    {
        $result = [
            'php_version'    => PHP_VERSION,
            'php_sapi'       => PHP_SAPI,
            'os'             => PHP_OS_FAMILY,
            'hostname'       => gethostname() ?: 'unknown',
            'memory_limit'   => ini_get('memory_limit') ?: 'unknown',
            'max_upload'     => ini_get('upload_max_filesize') ?: 'unknown',
            'timezone'       => date_default_timezone_get(),
        ];

        // Check required extensions
        $required = ['pdo', 'pdo_mysql', 'mbstring', 'json', 'bcmath', 'openssl'];
        $missing = [];
        foreach ($required as $ext) {
            if (!extension_loaded($ext)) {
                $missing[] = $ext;
            }
        }
        $result['extensions_ok'] = empty($missing);
        if (!empty($missing)) {
            $result['missing_extensions'] = $missing;
        }

        // System uptime (Linux)
        if (PHP_OS_FAMILY === 'Linux' && file_exists('/proc/uptime')) {
            $raw = file_get_contents('/proc/uptime');
            if ($raw !== false) {
                $seconds = (int) floatval(explode(' ', trim($raw))[0]);
                $days = intdiv($seconds, 86400);
                $hours = intdiv($seconds % 86400, 3600);
                $result['uptime'] = "{$days}d {$hours}h";
                $result['uptime_seconds'] = $seconds;
            }
        }

        return $result;
    }

    /**
     * Calculate age in hours from an ISO timestamp.
     *
     * @param string|null $timestamp
     * @return float|null Hours since timestamp, or null if unparseable
     */
    private static function ageInHours(?string $timestamp): ?float
    {
        if ($timestamp === null) {
            return null;
        }

        try {
            $then = new \DateTime($timestamp);
            $now = new \DateTime();
            $diff = $now->getTimestamp() - $then->getTimestamp();
            return round($diff / 3600, 1);
        } catch (\Throwable $e) {
            return null;
        }
    }
}
