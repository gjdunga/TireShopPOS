<?php
declare(strict_types=1);

namespace App\Core;

/**
 * Application bootstrap.
 *
 * Initializes the autoloader, environment, config, error handling,
 * and timezone. This is the single entry point for bootstrapping
 * the application before routing begins.
 *
 * DunganSoft Technologies, March 2026
 */
class App
{
    /** @var string Absolute path to the project root */
    private string $basePath;

    /** @var bool Whether the app is in debug mode */
    private bool $debug = false;

    /** @var self|null Singleton instance */
    private static ?self $instance = null;

    public function __construct(string $basePath)
    {
        $this->basePath = rtrim($basePath, DIRECTORY_SEPARATOR);
        self::$instance = $this;
    }

    /**
     * Get the singleton instance (available after construction).
     */
    public static function getInstance(): ?self
    {
        return self::$instance;
    }

    /**
     * Boot the application.
     *
     * Order matters:
     *   1. Environment (.env)
     *   2. Config (reads env values)
     *   3. Error handling (reads config for debug flag)
     *   4. Timezone
     *
     * @return self
     */
    public function boot(): self
    {
        $this->loadEnvironment();
        $this->loadConfig();
        $this->configureErrorHandling();
        $this->configureTimezone();

        return $this;
    }

    /**
     * Load .env file from project root.
     */
    private function loadEnvironment(): void
    {
        $envFile = $this->basePath . DIRECTORY_SEPARATOR . '.env';

        if (is_readable($envFile)) {
            Env::load($envFile);
        }
    }

    /**
     * Initialize config from /config directory.
     */
    private function loadConfig(): void
    {
        Config::init(
            $this->basePath . DIRECTORY_SEPARATOR . 'config',
            true // preload all config files
        );

        $this->debug = (bool) Config::get('app.debug', false);
    }

    /**
     * Set error reporting and register a JSON error handler.
     *
     * In debug mode: display errors, report everything.
     * In production: suppress display, log only.
     */
    private function configureErrorHandling(): void
    {
        error_reporting(E_ALL);

        if ($this->debug) {
            ini_set('display_errors', '1');
        } else {
            ini_set('display_errors', '0');
            ini_set('log_errors', '1');
            ini_set('error_log', $this->basePath . DIRECTORY_SEPARATOR . 'storage' . DIRECTORY_SEPARATOR . 'logs' . DIRECTORY_SEPARATOR . 'php_error.log');
        }

        // Global exception handler: return structured JSON for uncaught exceptions
        set_exception_handler(function (\Throwable $e) {
            $this->handleException($e);
        });

        // Convert PHP errors to ErrorException
        set_error_handler(function (int $severity, string $message, string $file, int $line): bool {
            if (!(error_reporting() & $severity)) {
                return false;
            }
            throw new \ErrorException($message, 0, $severity, $file, $line);
        });
    }

    /**
     * Set the application timezone.
     */
    private function configureTimezone(): void
    {
        $tz = Config::get('app.timezone', 'America/Denver');
        date_default_timezone_set($tz);
    }

    /**
     * Handle an uncaught exception by returning a JSON error response.
     */
    private function handleException(\Throwable $e): void
    {
        $status = 500;

        if (!headers_sent()) {
            http_response_code($status);
            header('Content-Type: application/json; charset=utf-8');
        }

        $payload = [
            'error' => true,
            'code' => 'INTERNAL_ERROR',
            'message' => $this->debug
                ? $e->getMessage()
                : 'An internal error occurred.',
        ];

        if ($this->debug) {
            $payload['exception'] = get_class($e);
            $payload['file'] = $e->getFile() . ':' . $e->getLine();
            $payload['trace'] = array_slice(
                array_map(fn($frame) => ($frame['file'] ?? '?') . ':' . ($frame['line'] ?? '?') . ' ' . ($frame['class'] ?? '') . ($frame['type'] ?? '') . ($frame['function'] ?? ''),
                    $e->getTrace()),
                0, 10
            );
        }

        echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
        exit(1);
    }

    // ---- Accessors ----

    public function basePath(string $append = ''): string
    {
        return $this->basePath . ($append ? DIRECTORY_SEPARATOR . ltrim($append, DIRECTORY_SEPARATOR) : '');
    }

    public function isDebug(): bool
    {
        return $this->debug;
    }

    /**
     * Get the configured application name.
     */
    public function name(): string
    {
        return Config::get('app.name', 'Tire Shop POS');
    }

    /**
     * Get the schema version from config.
     */
    public function version(): string
    {
        return Config::get('app.version', '2.4');
    }
}
