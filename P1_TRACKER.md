# Phase 1 Tracker: Foundation and Auth

**Target:** Deployable backend with authentication, session management, and API routing.

**Architecture:** Classes (matching VehicleLookupService pattern). Existing helpers.php stays procedural, wrapped by class methods where referenced.

| Chunk | Deliverable | Depends On | Status | Commit |
|-------|-------------|------------|--------|--------|
| P1a | Project skeleton: front controller, autoloader, .env, config, error handling | None | COMPLETE | 9016527 |
| P1b | Database layer: PDO factory, connection health, `GET /api/health` with DB status | P1a | COMPLETE | 871b75f |
| P1c | Auth system: login, logout, password change. Database-backed sessions. Wires to existing helpers.php auth functions | P1a, P1b | COMPLETE | 17b1b09 |
| P1d | API router: method+path dispatcher, JSON envelope, global error handler, CORS | P1a | NOT STARTED | |
| P1e | RBAC middleware: session-to-role, permission check per endpoint, 403 response. All business logic exposed as REST behind RBAC | P1c, P1d | NOT STARTED | |
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

**Boot sequence:** index.php -> Autoloader (manual require) -> App::boot() -> Env::load(.env) -> Config::init(/config) -> error handlers -> timezone -> (router, P1d)

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

## Notes

Each P1 chunk is built in a single session: pull, build, test, push. The tracker is updated with the delivering commit hash when each chunk completes.

The existing php/ directory (tire_pos_helpers.php, VehicleLookupService.php) will be wired into the class structure in P1c/P1e. Until then they remain standalone files, unchanged.
