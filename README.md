# TireShopPOS

**DunganSoft Technologies** | March 2026

Full-stack point-of-sale system for independent tire shops. PHP 8.1+ REST API with React 19 frontend, designed for Ubuntu 24.04 LTS with Virtualmin 8.x Professional.

## Quick Start

```bash
# Clone
git clone https://github.com/gjdunga/TireShopPOS.git
cd TireShopPOS

# Configure
cp deploy/.env.production.example .env
# Edit .env with database credentials

# Load schema
mysql -u <user> -p <database> < sql/tire_pos_schema_full.sql
for m in sql/migrations/*.sql; do mysql -u <user> -p <database> < "$m"; done

# Build frontend
cd frontend && npm install && npm run build && cd ..

# Run (development)
php -S localhost:8080 -t public public/index.php
```

## Stack

| Layer | Technology |
|-------|-----------|
| Backend | PHP 8.1+ (procedural + PSR-4 autoloader), no framework |
| Database | MySQL 8.x / MariaDB 10.11+, 70 tables, 14 views |
| Frontend | React 19, Vite 7, 27 page components |
| Server | Ubuntu 24.04 LTS, Apache 2.4, PHP 8.3-FPM |
| Hosting | Virtualmin 8.x Professional |
| Auth | bcrypt, token sessions, RBAC (30 permissions, 5 roles) |

## Key Numbers

- 170 API routes
- 70 database tables, 14 views
- 188 PHP functions across 5 business logic files + provider layer
- 30 RBAC permissions, 5 roles (owner, manager, tech, sales, readonly)
- 53 tire brands, 410 torque specs seeded
- 122 integration test assertions (all passing)

## Project Structure

```
app/Core/          PHP framework (Autoloader, Database, Session, Router, Auth)
app/Http/          Auth, Middleware, Router
config/            App and database configuration (reads .env)
deploy/            Production deployment scripts and configs
frontend/src/      React SPA (auth, layout, 27 page components)
php/               Business logic (lazy-loaded by URI prefix)
  tire_pos_helpers.php    Core helpers (924 lines, always loaded)
  tire_pos_crud.php       CRUD operations (1,128 lines, always loaded)
  tire_pos_p3.php         Settings, warranties, wheels, storefront (901 lines)
  tire_pos_p6.php         Marketplace, integrations, B2B (352 lines)
  VehicleLookupService.php  Plate/VIN lookup, NHTSA decode (845 lines)
public/index.php   Front controller with lazy-loading gate
routes/api.php     All 170 route definitions
scripts/           Cron jobs (backup, session cleanup)
sql/               Schema and migrations
tests/             Integration test suite (122 assertions)
```

## Lazy-Loading

The front controller conditionally loads PHP files based on request URI:

| File | Lines | Loaded When |
|------|-------|-------------|
| helpers + crud | 2,052 | Always |
| tire_pos_p3.php | 901 | /settings, /warranty*, /wheels, /public/* |
| tire_pos_p6.php | 352 | /marketplace, /integrations, /b2b |
| VehicleLookupService.php | 845 | /vehicles/lookup, /vehicles/validate |

Typical request (work orders, customers, tires): 3,628 lines parsed.
Before optimization: 7,447 lines. **51% reduction.**

## API Authentication

All authenticated endpoints require `Authorization: Bearer <token>`.

```bash
# Login
curl -X POST -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}' \
  http://localhost:8080/api/auth/login

# Use token
curl -H "Authorization: Bearer <token>" \
  http://localhost:8080/api/work-orders
```

Default admin: username `admin`, password `admin` (force change on first login).

## Deployment

See `deploy/README.md` for full Virtualmin deployment guide.
See `docs/TireShopPOS_Developer_Guide.docx` for complete API reference.

```bash
# On server
cd /home/<user>/domains/<domain>/app
git pull origin main
./deploy/deploy.sh
```

## Testing

```bash
bash tests/test_backend.sh
```

Starts temporary MySQL, loads schema, boots PHP server, runs 122 assertions
covering health, auth, RBAC, CRUD, validation, SQL injection, XSS, boundary
values, and token invalidation.

## Requirements

- PHP 8.1+ with extensions: mysql, bcmath, curl, mbstring
- MySQL 8.0+ / MariaDB 10.11+
- Node.js 20+ (build only)
- PlateToVIN API key (optional, for plate lookup)

## Documentation

| Document | Location |
|----------|----------|
| Installation Guide (setup, upgrade, troubleshooting) | `docs/TireShopPOS_Installation_Guide.docx` |
| Developer Guide (API ref, architecture, deployment) | `docs/TireShopPOS_Developer_Guide.docx` |
| Deployment Guide | `deploy/README.md` |
| Development Roadmap | `docs/tire_pos_roadmap.docx` |
| Vehicle Lookup Integration | `docs/vehicle_lookup_integration.docx` |

## License

See LICENSE file.
