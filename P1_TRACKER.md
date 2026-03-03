# Phase 1 Tracker: Foundation and Auth

**Target:** Deployable backend with authentication, session management, and API routing.

**Architecture:** Classes (matching VehicleLookupService pattern). Existing helpers.php stays procedural, wrapped by class methods where referenced.

| Chunk | Deliverable | Depends On | Status | Commit |
|-------|-------------|------------|--------|--------|
| P1a | Project skeleton: front controller, autoloader, .env, config, error handling | None | COMPLETE | 9016527 |
| P1b | Database layer: PDO factory, connection health, `GET /api/health` with DB status | P1a | COMPLETE | 871b75f |
| P1c | Auth system: login, logout, password change. Database-backed sessions. Wires to existing helpers.php auth functions | P1a, P1b | COMPLETE | 17b1b09 |
| P1d | API router: method+path dispatcher, JSON envelope, global error handler, CORS | P1a | COMPLETE | f0e14b9 |
| P1e | RBAC middleware: session-to-role, permission check per endpoint, 403 response. All business logic exposed as REST behind RBAC | P1c, P1d | COMPLETE | eaa609d |
| P1f | Backup and ops: daily MySQL dump script, photo rsync, cron template, expanded health endpoint | P1b | NOT STARTED | |

## P1a: Project Skeleton

**Files created:**

```
app/
  Core/
    App.php            Application bootstrap (env, config, errors, timezone)
    Autoloader.php     PSR-4 autoloader (App\ -> /app)
    Config.php         Config loader (dot-notation, reads /config/*.php)
    Env.php            .env parser (populates $_ENV, getenv, putenv)
config/
  app.php             App name, version, debug, timezone, URL
  database.php        PDO params, charset, strict mode, session vars
public/
  index.php           Front controller (all HTTP enters here)
  .htaccess           Rewrite non-file requests to index.php
storage/
  logs/.gitkeep       Error logs (gitignored contents)
  photos/.gitkeep     Tire photos (gitignored contents)
  backups/.gitkeep    DB dumps (gitignored contents)
.htaccess             Root rewrite: redirect to /public
.env.example          Environment template with all configurable values
.gitignore            Updated with storage paths and IDE entries
```

**Verification:** `GET /api/health` returns JSON with app name, version, debug flag, timestamp, PHP version. Any unmatched route returns structured 404.

**Boot sequence:** index.php -> Autoloader (manual require) -> App::boot() -> Env::load(.env) -> Config::init(/config) -> error handlers -> timezone -> Router() -> routes/api.php -> dispatch()

## P1b: Database Layer

**Files created:**

```
app/
  Core/
    Database.php       PDO singleton, query helpers, health check, transactions
```

**Files modified:**

```
public/index.php       Health endpoint now includes database status
```

**Database class API:**

| Method | Purpose |
|--------|---------|
| `connection()` | Returns singleton PDO (creates on first call, runs session vars) |
| `query($sql, $params)` | SELECT, returns all rows as assoc arrays |
| `queryOne($sql, $params)` | SELECT, returns first row or null |
| `scalar($sql, $params)` | SELECT, returns single value |
| `execute($sql, $params)` | INSERT/UPDATE/DELETE, returns affected row count |
| `lastInsertId()` | Last auto-increment ID |
| `transaction($callback)` | Runs callback in transaction, rollback on throw |
| `health()` | Returns connection status, version, table count, strict mode |
| `pdo()` | Raw PDO access (legacy getDB() compatibility) |
| `disconnect()` | Reset singleton (testing) |

**Compatibility note:** Carries forward `MYSQL_ATTR_FOUND_ROWS => true` from legacy `getDB()` in tire_pos_helpers.php. UPDATE statements return matched rows (not changed rows), which existing business logic functions depend on.

**Health endpoint response (`GET /api/health`):**

- `status: "ok"` when DB connected, `"degraded"` when not
- `database.connected`, `database.server_version`, `database.table_count` (44), `database.strict_mode` (true), `database.connected_at`
- Graceful failure: DB unavailable returns structured JSON (no crash)

**Verified against live MySQL 8.0.45 with full v2.4 schema (44 tables, 14 views, 410 torque specs).**

## P1c: Authentication System

**Files created:**

```
app/
  Core/
    Session.php        Database-backed session manager (token, validate, destroy, cleanup)
  Http/
    Auth.php           Auth service (login, logout, password change, requireAuth)
sql/
  migrations/
    001_sessions_table.sql   Sessions table + audit_log enum extension
```

**Files modified:**

```
public/index.php       Added auth routes + jsonBody/jsonResponse helpers
```

**API Endpoints:**

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | /api/auth/login | No | Authenticate, returns token + user profile + permissions |
| POST | /api/auth/logout | Bearer token | Destroy session |
| POST | /api/auth/password | Bearer token | Change password (validates strength, history, current pw) |
| GET | /api/auth/session | Bearer token | Return current session/user info |

**Login response includes:** token, expires_at, user_id, username, display_name, email, role, force_password_change flag, password_expired flag, full permissions array.

**Security features verified (39/39 tests):**

- Bcrypt password verification (cost 12)
- Account lockout after 5 failed attempts (15-minute cooldown, HTTP 423)
- No username enumeration (same error for bad user vs bad password)
- Password strength: min 8 chars, upper + lower + digit
- Password history: rejects last 5 passwords
- Session tokens: 64-char hex (32 bytes cryptographic random)
- Sliding session expiry (extends on each valid access)
- Password change invalidates all other sessions
- Inactive users rejected even with valid credentials
- Expired session cleanup on health endpoint
- Audit trail: LOGIN, LOGOUT, FAILED_LOGIN, PASSWORD_CHANGE

**Schema changes (migration 001):**

- New table: sessions (token, user_id, ip, user_agent, expiry, last_active)
- Extended audit_log action enum: +PASSWORD_CHANGE, +SESSION_CREATE, +SESSION_DESTROY

**Auth class wraps these helpers.php functions using Database:: instead of getDB():**
recordFailedLogin, recordSuccessfulLogin, isPasswordReused, isPasswordExpired, getUserPermissions, auditLog

## P1d: API Router

**Files created:**

```
app/
  Http/
    Router.php         Method+path dispatcher with path params, JSON envelope, CORS, error handler
routes/
  api.php              Route definitions (health, auth/login, auth/logout, auth/password, auth/session)
```

**Files modified:**

```
public/index.php       Replaced inline route stubs with Router creation, route loading, and dispatch
```

**Router features:**

| Feature | Implementation |
|---------|---------------|
| Route registration | `$router->get()`, `post()`, `put()`, `patch()`, `delete()` |
| Path parameters | `{name}` placeholders, e.g. `/api/tires/{id}` -> `$params['id']` |
| Handler signature | `function(array $params, array $body): array` |
| JSON envelope | Success: `{ success: true, data: {...} }`, Error: `{ success: false, error: true, code, message }` |
| CORS | Allow-Origin (configurable via app.cors_origin), Allow-Methods, Allow-Headers, Max-Age |
| OPTIONS preflight | Auto-handled, returns 204 |
| Error handling | Uncaught exceptions -> structured JSON (debug: full trace, prod: generic message + error_log) |
| Request helpers | `Router::jsonBody()` (cached), `Router::query()`, `Router::bearerToken()` |
| Response helpers | `Router::send()`, `Router::sendError()`, null return -> 204 |

**Route file pattern:** `routes/api.php` receives `$router` and `$app` from index.php. Handlers return arrays (auto-wrapped) or Auth-style arrays with `success` key (sent as-is with status extraction).

**Front controller is now 37 lines:** boot, create router, load routes, dispatch. All route logic lives in `routes/api.php`.

**Verified:**

- Health endpoint: routed, DB health, session cleanup, success envelope
- Login: POST dispatch, MISSING_FIELDS on empty body, full login with token
- Session: GET with Bearer token, returns user + permissions
- Logout: POST with Bearer token, destroys session, confirms on re-check
- 404: structured error with method + path
- OPTIONS: 204, no body
- Path params: `/api/test/{id}/details` extracts `id` correctly
- Exception handler: uncaught throw -> structured 500 with trace (debug) or generic (prod)
- Method enforcement: GET /api/auth/login -> 404 (only POST registered)

## P1e: RBAC Middleware and Business API

**Files created:**

```
app/
  Http/
    Middleware.php     Auth guard + permission check middleware factories
```

**Files modified:**

```
app/Http/Router.php        Added middleware support: with(), pendingMiddleware, middleware execution in dispatch
routes/api.php             Expanded from 5 routes to 56 routes with RBAC protection
public/index.php           Loads tire_pos_helpers.php after boot (bridge to business logic)
php/tire_pos_helpers.php   getDB() now delegates to Database::pdo() when framework is loaded
```

**Middleware system:**

Router now supports `$router->with([...middleware...])->get(...)` chaining. Middleware callables run in order before the handler. If a middleware calls `Router::sendError()`, execution halts (exits). If it returns normally, the next middleware (or handler) runs.

**Middleware factories (Middleware class):**

| Factory | Purpose |
|---------|---------|
| `Middleware::auth()` | Validates Bearer token, stores session. Blocks force_password_change users with PASSWORD_CHANGE_REQUIRED (403). |
| `Middleware::permit(...$keys)` | OR logic: user needs at least one of the listed permissions. Returns FORBIDDEN (403) with required keys in message. |
| `Middleware::permitAll(...$keys)` | AND logic: user needs all listed permissions. Returns FORBIDDEN (403) listing missing keys. |

**Handler helpers (static, available after auth middleware):**

| Method | Returns |
|--------|---------|
| `Middleware::session()` | Full session array (user_id, username, display_name, role_name, etc.) |
| `Middleware::userId()` | Current user ID (int) |
| `Middleware::role()` | Current user role name |
| `Middleware::can($key)` | Bool check without exiting (for conditional logic in handlers) |

**Route summary (56 total):**

| Category | Routes | Permission(s) |
|----------|--------|---------------|
| Health | 1 | None (public) |
| Auth | 4 | None (token validated internally) |
| Tax | 1 | Auth only (any role) |
| Tires/Inventory | 6 | INVENTORY_VIEW, WAIVER_CREATE |
| Customers | 2 | CUSTOMER_MANAGE |
| Vehicles | 5 | VEHICLE_MANAGE, CUSTOMER_MANAGE |
| Work Orders | 2 | WORK_ORDER_CREATE, WORK_ORDER_ASSIGN |
| Torque/Re-torque | 3 | WORK_ORDER_CREATE |
| Invoices | 4 | INVOICE_CREATE |
| Price Override | 1 | PRICE_OVERRIDE or PRICE_OVERRIDE_HIGH |
| Deposits | 3 | DEPOSIT_ACCEPT, DEPOSIT_FORFEIT |
| Refunds | 2 | REFUND_REQUEST, REFUND_APPROVE |
| Cash Drawer | 4 | CASH_DRAWER_OPEN, CASH_DRAWER_CLOSE |
| Appointments | 1 | APPOINTMENT_MANAGE |
| Purchase Orders | 1 | PO_CREATE or PO_RECEIVE |
| Reports | 5 | REPORT_VIEW |
| Audit | 1 | AUDIT_VIEW |
| User Management | 8 | USER_MANAGE |
| Sequences | 3 | INVOICE_CREATE, WORK_ORDER_CREATE, PO_CREATE |

**helpers.php bridge:** getDB() checks `class_exists('App\Core\Database', false)` and delegates to Database::pdo() when the framework is loaded. Falls back to standalone connection for any use outside the framework. All 50+ business functions now run through the framework's PDO singleton with consistent config (strict mode, timezone, FOUND_ROWS).

**18 of 30 permissions are actively enforced by routes.** Remaining 12 (INVENTORY_ADD, INVENTORY_EDIT, INVENTORY_WRITE_OFF, INVOICE_VOID, PAYMENT_ACCEPT, DEPOSIT_ACCEPT on create, FEE_WAIVE, PHOTO_UPLOAD, CONFIG_MANAGE, PO_RECEIVE on create, WORK_ORDER_ASSIGN on create, REFUND_APPROVE_HIGH standalone) will be wired as those CRUD endpoints are built in Phase 2.

**Verified (15 test scenarios):**

1. Health: no auth required, returns OK
2. Protected route without token: 401 NOT_AUTHENTICATED
3. Owner accesses /api/users: 200, returns user list
4. Owner accesses /api/roles: 200, returns 3 roles
5. Owner accesses /api/roles/3/permissions: 200, returns 30 permissions
6. Create tire_tech user via DB
7. Tech denied /api/users (USER_MANAGE): 403 FORBIDDEN
8. Tech denied /api/audit (AUDIT_VIEW): 403 FORBIDDEN
9. Tech allowed /api/tires/parse-size (INVENTORY_VIEW): 200, parsed 225/65R17
10. Force password change gate: tech blocked with PASSWORD_CHANGE_REQUIRED
11. Owner views audit log: 200, returns LOGIN entries
12. Auth-only route /api/tax/current-rate: 200, rate 0.0790
13. /api/retorque/due: 200, returns array
14. /api/work-orders/open: 200, returns array
15. /api/appointments/today: 200, returns array

## Notes

Each P1 chunk is built in a single session: pull, build, test, push. The tracker is updated with the delivering commit hash when each chunk completes.

The existing php/ directory (tire_pos_helpers.php, VehicleLookupService.php) is bridged into the framework via getDB() shim (P1e). helpers.php is loaded by index.php after boot, and getDB() delegates to Database::pdo() when the framework is present.
