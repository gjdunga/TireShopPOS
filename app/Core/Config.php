<?php
declare(strict_types=1);

namespace App\Core;

/**
 * Configuration loader.
 *
 * Reads PHP files from the /config directory that return associative arrays.
 * Provides dot-notation access: Config::get('database.host') reads
 * config/database.php['host'].
 *
 * DunganSoft Technologies, March 2026
 */
class Config
{
    /** @var array<string, array> Loaded config arrays keyed by filename */
    private static array $items = [];

    /** @var string Absolute path to the config directory */
    private static string $configPath = '';

    /**
     * Set the config directory and optionally preload all files.
     *
     * @param string $configPath Absolute path to /config
     * @param bool   $preload    If true, load all .php files immediately
     */
    public static function init(string $configPath, bool $preload = false): void
    {
        self::$configPath = rtrim($configPath, DIRECTORY_SEPARATOR);

        if ($preload) {
            self::loadAll();
        }
    }

    /**
     * Get a config value using dot notation.
     *
     * @param string $key     Dot-separated key: "file.key" or "file.key.subkey"
     * @param mixed  $default Returned if the key does not exist
     * @return mixed
     */
    public static function get(string $key, mixed $default = null): mixed
    {
        $segments = explode('.', $key);
        $file = array_shift($segments);

        if (!isset(self::$items[$file])) {
            self::loadFile($file);
        }

        $value = self::$items[$file] ?? null;

        foreach ($segments as $segment) {
            if (!is_array($value) || !array_key_exists($segment, $value)) {
                return $default;
            }
            $value = $value[$segment];
        }

        return $value;
    }

    /**
     * Check if a config key exists.
     *
     * @param string $key Dot-separated key
     * @return bool
     */
    public static function has(string $key): bool
    {
        // Use a sentinel to distinguish "exists but null" from "missing"
        $sentinel = new \stdClass();
        return self::get($key, $sentinel) !== $sentinel;
    }

    /**
     * Get an entire config file as an array.
     *
     * @param string $file Config filename (without .php extension)
     * @return array
     */
    public static function file(string $file): array
    {
        if (!isset(self::$items[$file])) {
            self::loadFile($file);
        }

        return self::$items[$file] ?? [];
    }

    /**
     * Load a single config file by name.
     *
     * @param string $file Filename without extension
     */
    private static function loadFile(string $file): void
    {
        $path = self::$configPath . DIRECTORY_SEPARATOR . $file . '.php';

        if (!is_readable($path)) {
            self::$items[$file] = [];
            return;
        }

        $result = require $path;

        if (is_array($result)) {
            self::$items[$file] = $result;
        } else {
            self::$items[$file] = [];
        }
    }

    /**
     * Load all .php files in the config directory.
     */
    private static function loadAll(): void
    {
        $pattern = self::$configPath . DIRECTORY_SEPARATOR . '*.php';
        $files = glob($pattern);

        if ($files === false) {
            return;
        }

        foreach ($files as $path) {
            $file = basename($path, '.php');
            if (!isset(self::$items[$file])) {
                self::loadFile($file);
            }
        }
    }

    /**
     * Reset state (primarily for testing).
     */
    public static function reset(): void
    {
        self::$items = [];
        self::$configPath = '';
    }
}
