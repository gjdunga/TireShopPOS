<?php
declare(strict_types=1);

namespace App\Http;

use App\Core\Config;
use App\Core\Logger;

/**
 * HTTP Router.
 *
 * Registers routes as method + path -> callable. Supports path parameters
 * via {name} placeholders. Dispatches the matched handler inside a
 * try/catch that guarantees structured JSON responses on all paths
 * (success, client error, server error).
 *
 * All responses use a consistent envelope:
 *   Success: { "success": true, "data": { ... } }
 *   Error:   { "success": false, "error": true, "code": "...", "message": "..." }
 *
 * DunganSoft Technologies, March 2026
 */
class Router
{
    /** @var array<string, array<string, array{pattern: string, handler: callable, paramNames: string[]}>> */
    private array $routes = [];

    /** @var string Resolved HTTP method */
    private string $method;

    /** @var string Resolved URI path */
    private string $uri;

    /** @var array<string, string> CORS configuration */
    private array $cors;

    public function __construct()
    {
        $this->method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
        $this->uri = $this->resolveUri();
        $this->cors = [
            'origin'  => Config::get('app.cors_origin', '*'),
            'methods' => 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
            'headers' => 'Content-Type, Authorization, X-Requested-With',
            'max_age' => '86400',
        ];
    }

    // ---- Route registration ----

    public function get(string $path, callable $handler): self
    {
        return $this->registerWithMiddleware('GET', $path, $handler);
    }

    public function post(string $path, callable $handler): self
    {
        return $this->registerWithMiddleware('POST', $path, $handler);
    }

    public function put(string $path, callable $handler): self
    {
        return $this->registerWithMiddleware('PUT', $path, $handler);
    }

    public function patch(string $path, callable $handler): self
    {
        return $this->registerWithMiddleware('PATCH', $path, $handler);
    }

    public function delete(string $path, callable $handler): self
    {
        return $this->registerWithMiddleware('DELETE', $path, $handler);
    }

    /**
     * Register route, consuming any pending middleware from with().
     */
    private function registerWithMiddleware(string $method, string $path, callable $handler): self
    {
        $mw = $this->pendingMiddleware;
        $this->pendingMiddleware = [];
        return $this->addRoute($method, $path, $handler, $mw);
    }

    /**
     * Register a route.
     *
     * @param string   $method     HTTP method
     * @param string   $path       Route path, e.g. "/api/tires/{id}"
     * @param callable $handler    Function receiving (array $params, array $body)
     * @param array    $middleware List of middleware callables to run before handler
     */
    private function addRoute(string $method, string $path, callable $handler, array $middleware = []): self
    {
        $path = '/' . ltrim($path, '/');

        // Extract parameter names and build regex
        $paramNames = [];
        $pattern = preg_replace_callback('/\{([a-zA-Z_]+)\}/', function ($m) use (&$paramNames) {
            $paramNames[] = $m[1];
            return '([^/]+)';
        }, $path);

        $pattern = '#^' . $pattern . '$#';

        $this->routes[$method][] = [
            'pattern'    => $pattern,
            'handler'    => $handler,
            'paramNames' => $paramNames,
            'middleware'  => $middleware,
        ];

        return $this;
    }

    // ---- Middleware-aware route registration ----

    /** @var array Middleware stack to apply to the next registered route */
    private array $pendingMiddleware = [];

    /**
     * Attach middleware to the next registered route.
     * Chainable: $router->with([...])->get(...)
     *
     * @param array $middleware List of middleware callables
     * @return self
     */
    public function with(array $middleware): self
    {
        $this->pendingMiddleware = $middleware;
        return $this;
    }

    // ---- Dispatch ----

    /**
     * Dispatch the current request to the matched handler.
     *
     * Order of operations:
     *   1. Set JSON content type and CORS headers
     *   2. Handle OPTIONS preflight
     *   3. Match route
     *   4. Execute handler inside try/catch
     *   5. Send JSON response
     */
    public function dispatch(): never
    {
        Logger::init();

        header('Content-Type: application/json; charset=utf-8');
        header('X-Request-Id: ' . Logger::requestId());
        $this->sendCorsHeaders();

        // CORS preflight
        if ($this->method === 'OPTIONS') {
            http_response_code(204);
            exit;
        }

        // Find matching route
        $match = $this->matchRoute();

        if ($match === null) {
            $this->sendError('NOT_FOUND', 'Route not found: ' . $this->method . ' ' . $this->uri, 404);
        }

        // Execute handler with error wrapping
        try {
            // Run middleware chain
            foreach ($match['middleware'] as $mw) {
                $mw($match['params'], self::jsonBody());
                // Middleware calls Router::sendError() and exits if checks fail.
                // If it returns normally, continue to next middleware.
            }

            $result = ($match['handler'])($match['params'], self::jsonBody());
            $this->sendResult($result);
        } catch (\Throwable $e) {
            $this->handleException($e);
        }
    }

    /**
     * Match the current request against registered routes.
     *
     * @return array{handler: callable, params: array<string, string>, middleware: array}|null
     */
    private function matchRoute(): ?array
    {
        $methodRoutes = $this->routes[$this->method] ?? [];

        foreach ($methodRoutes as $route) {
            if (preg_match($route['pattern'], $this->uri, $matches)) {
                array_shift($matches); // Remove full match
                $params = [];
                foreach ($route['paramNames'] as $i => $name) {
                    $params[$name] = urldecode($matches[$i] ?? '');
                }
                return [
                    'handler'    => $route['handler'],
                    'params'     => $params,
                    'middleware' => $route['middleware'],
                ];
            }
        }

        return null;
    }

    // ---- Request helpers ----

    /**
     * Parse JSON request body.
     *
     * @return array
     */
    public static function jsonBody(): array
    {
        static $cached = null;
        if ($cached !== null) {
            return $cached;
        }

        $raw = file_get_contents('php://input');
        if ($raw === '' || $raw === false) {
            $cached = [];
            return $cached;
        }

        $decoded = json_decode($raw, true);
        $cached = is_array($decoded) ? $decoded : [];
        return $cached;
    }

    /**
     * Get a query string parameter.
     *
     * @param string $key
     * @param mixed  $default
     * @return mixed
     */
    public static function query(string $key, mixed $default = null): mixed
    {
        return $_GET[$key] ?? $default;
    }

    /**
     * Get the bearer token from the Authorization header.
     *
     * @return string|null
     */
    public static function bearerToken(): ?string
    {
        return \App\Core\Session::tokenFromRequest();
    }

    // ---- Response helpers ----

    /**
     * Process a handler result and send the appropriate response.
     *
     * Handlers can return:
     *   - Array with 'success' key: sent as-is (Auth::login style)
     *   - Any other array: wrapped in { success: true, data: ... }
     *   - null: 204 No Content
     */
    private function sendResult(mixed $result): never
    {
        if ($result === null) {
            http_response_code(204);
            exit;
        }

        if (!is_array($result)) {
            $result = ['data' => $result];
        }

        // If the handler already set success/error, extract status and send
        if (isset($result['success'])) {
            $status = $result['status'] ?? ($result['success'] ? 200 : 400);
            unset($result['status']);
            self::send($result, $status);
        }

        // Otherwise wrap in success envelope
        self::send(['success' => true, 'data' => $result], 200);
    }

    /**
     * Send a structured error response and exit.
     *
     * @param string $code    Machine-readable error code
     * @param string $message Human-readable message
     * @param int    $status  HTTP status code
     */
    public static function sendError(string $code, string $message, int $status = 400): never
    {
        self::send([
            'success' => false,
            'error'   => true,
            'code'    => $code,
            'message' => $message,
        ], $status);
    }

    /**
     * Send a JSON response and exit.
     *
     * @param array $data   Response payload
     * @param int   $status HTTP status code
     */
    public static function send(array $data, int $status = 200): never
    {
        if (!headers_sent()) {
            http_response_code($status);
            header('Content-Type: application/json; charset=utf-8');
        }
        echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);

        $userId = null;
        try { $userId = Middleware::userId(); } catch (\Throwable $e) {}
        Logger::request(
            $_SERVER['REQUEST_METHOD'] ?? 'UNKNOWN',
            parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/',
            $status, $userId
        );

        exit;
    }

    // ---- Error handling ----

    /**
     * Handle an uncaught exception from a route handler.
     */
    private function handleException(\Throwable $e): never
    {
        $debug = Config::get('app.debug', false);

        $payload = [
            'success' => false,
            'error'   => true,
            'code'    => 'INTERNAL_ERROR',
            'message' => $debug ? $e->getMessage() : 'An internal error occurred.',
        ];

        if ($debug) {
            $payload['exception'] = get_class($e);
            $payload['file'] = $e->getFile() . ':' . $e->getLine();
            $payload['trace'] = array_slice(
                array_map(
                    fn($f) => ($f['file'] ?? '?') . ':' . ($f['line'] ?? '?') . ' '
                        . ($f['class'] ?? '') . ($f['type'] ?? '') . ($f['function'] ?? ''),
                    $e->getTrace()
                ),
                0, 10
            );
        }

        Logger::exception($e);

        self::send($payload, 500);
    }

    // ---- CORS ----

    /**
     * Send CORS headers.
     */
    private function sendCorsHeaders(): void
    {
        header('Access-Control-Allow-Origin: ' . $this->cors['origin']);
        header('Access-Control-Allow-Methods: ' . $this->cors['methods']);
        header('Access-Control-Allow-Headers: ' . $this->cors['headers']);
        header('Access-Control-Max-Age: ' . $this->cors['max_age']);
    }

    // ---- Internal ----

    /**
     * Resolve the URI path from the request.
     */
    private function resolveUri(): string
    {
        // Query string routing: ?_=/auth/login (bypasses Apache rewrites entirely)
        if (isset($_GET['_']) && $_GET['_'] !== '') {
            $uri = urldecode($_GET['_']);
            // Ensure it starts with /api
            if (!str_starts_with($uri, '/api')) {
                $uri = '/api' . $uri;
            }
        } else {
            $uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?? '/';
            // Strip front controller from PATH_INFO style URLs (fallback)
            $uri = str_replace('/index.php', '', $uri);
        }

        // Strip trailing slash (except root)
        if ($uri !== '/' && str_ends_with($uri, '/')) {
            $uri = rtrim($uri, '/');
        }

        return $uri;
    }
}
