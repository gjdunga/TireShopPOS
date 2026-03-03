<?php
declare(strict_types=1);

namespace App\Core;

/**
 * PSR-4 compliant autoloader.
 *
 * Maps the App\ namespace root to the /app directory relative to project root.
 * Supports nested namespaces (e.g. App\Core\Config maps to /app/Core/Config.php).
 *
 * DunganSoft Technologies, March 2026
 */
class Autoloader
{
    /** @var string Absolute path to the project root (one level above /app) */
    private string $basePath;

    /** @var array<string, string> Namespace prefix to directory mappings */
    private array $prefixes = [];

    public function __construct(string $basePath)
    {
        $this->basePath = rtrim($basePath, DIRECTORY_SEPARATOR);
    }

    /**
     * Register a namespace prefix to a base directory.
     *
     * @param string $prefix   Namespace prefix (trailing backslash added if missing)
     * @param string $baseDir  Directory relative to project root
     */
    public function addNamespace(string $prefix, string $baseDir): void
    {
        $prefix = trim($prefix, '\\') . '\\';
        $baseDir = $this->basePath . DIRECTORY_SEPARATOR . trim($baseDir, DIRECTORY_SEPARATOR);
        $this->prefixes[$prefix] = $baseDir;
    }

    /**
     * Register this autoloader with spl_autoload_register.
     */
    public function register(): void
    {
        spl_autoload_register([$this, 'loadClass']);
    }

    /**
     * Attempt to load a class file for the given fully qualified class name.
     *
     * @param string $class Fully qualified class name
     * @return bool True if the file was loaded, false otherwise
     */
    public function loadClass(string $class): bool
    {
        foreach ($this->prefixes as $prefix => $baseDir) {
            $prefixLen = strlen($prefix);

            if (strncmp($prefix, $class, $prefixLen) !== 0) {
                continue;
            }

            $relativeClass = substr($class, $prefixLen);
            $file = $baseDir
                . DIRECTORY_SEPARATOR
                . str_replace('\\', DIRECTORY_SEPARATOR, $relativeClass)
                . '.php';

            if (file_exists($file)) {
                require_once $file;
                return true;
            }
        }

        return false;
    }
}
