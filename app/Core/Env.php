<?php
declare(strict_types=1);

namespace App\Core;

/**
 * Minimal .env file parser.
 *
 * Reads a .env file and populates $_ENV, $_SERVER, and putenv().
 * Supports: comments (#), blank lines, quoted values (single/double),
 * inline comments after unquoted values.
 *
 * Does NOT override existing environment variables (system env wins).
 *
 * DunganSoft Technologies, March 2026
 */
class Env
{
    /** @var array<string, string> Parsed values for direct access */
    private static array $values = [];

    /** @var bool Whether load() has been called */
    private static bool $loaded = false;

    /**
     * Load a .env file into the environment.
     *
     * @param string $path Absolute path to the .env file
     * @throws \RuntimeException If the file cannot be read
     */
    public static function load(string $path): void
    {
        if (!is_readable($path)) {
            throw new \RuntimeException("Environment file not readable: {$path}");
        }

        $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if ($lines === false) {
            throw new \RuntimeException("Failed to read environment file: {$path}");
        }

        foreach ($lines as $line) {
            $trimmed = trim($line);

            // Skip comments and blank lines
            if ($trimmed === '' || $trimmed[0] === '#') {
                continue;
            }

            // Must contain = to be a valid assignment
            $eqPos = strpos($trimmed, '=');
            if ($eqPos === false) {
                continue;
            }

            $key = trim(substr($trimmed, 0, $eqPos));
            $value = trim(substr($trimmed, $eqPos + 1));

            // Strip quotes if value is wrapped in matching quotes
            if (strlen($value) >= 2) {
                $first = $value[0];
                $last = $value[strlen($value) - 1];
                if (($first === '"' && $last === '"') || ($first === "'" && $last === "'")) {
                    $value = substr($value, 1, -1);
                }
            } else {
                // Strip inline comments for unquoted values
                $commentPos = strpos($value, ' #');
                if ($commentPos !== false) {
                    $value = trim(substr($value, 0, $commentPos));
                }
            }

            // Do not override existing env vars (system takes precedence)
            if (getenv($key) !== false) {
                self::$values[$key] = getenv($key);
                continue;
            }

            self::$values[$key] = $value;
            $_ENV[$key] = $value;
            $_SERVER[$key] = $value;
            putenv("{$key}={$value}");
        }

        self::$loaded = true;
    }

    /**
     * Get an environment value with an optional default.
     *
     * @param string $key     Environment variable name
     * @param mixed  $default Returned if key is not set
     * @return mixed
     */
    public static function get(string $key, mixed $default = null): mixed
    {
        // Check our parsed values first, then fall back to getenv
        if (array_key_exists($key, self::$values)) {
            return self::$values[$key];
        }

        $env = getenv($key);
        if ($env !== false) {
            return $env;
        }

        return $default;
    }

    /**
     * Get a required environment value. Throws if not set.
     *
     * @param string $key Environment variable name
     * @return string
     * @throws \RuntimeException If the key is not set
     */
    public static function require(string $key): string
    {
        $value = self::get($key);

        if ($value === null || $value === '') {
            throw new \RuntimeException("Required environment variable not set: {$key}");
        }

        return (string) $value;
    }

    /**
     * Check whether the env has been loaded.
     */
    public static function isLoaded(): bool
    {
        return self::$loaded;
    }

    /**
     * Reset state (primarily for testing).
     */
    public static function reset(): void
    {
        self::$values = [];
        self::$loaded = false;
    }
}
