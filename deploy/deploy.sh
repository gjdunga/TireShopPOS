#!/usr/bin/env bash
# ============================================================================
# deploy.sh
# Deploy TireShopPOS to Virtualmin (pos.BearlyUsed.net)
#
# Usage:
#   First time:  ./deploy.sh --init
#   Updates:     ./deploy.sh
#   DB only:     ./deploy.sh --db-only
#
# Run as the domain user (bearlyused) or root.
#
# DunganSoft Technologies, March 2026
# ============================================================================

set -euo pipefail

# ---- Configuration ----
DOMAIN_ROOT="/home/bearlyused/domains/pos.bearlyused.net"
APP_DIR="${DOMAIN_ROOT}/app"
PUBLIC_HTML="${DOMAIN_ROOT}/public_html"
BACKUP_DIR="/home/bearlyused/backups/db"
REPO_URL="https://github.com/gjdunga/TireShopPOS.git"
BRANCH="main"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[DEPLOY]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
err()  { echo -e "${RED}[ERROR]${NC} $1" >&2; }

# ---- Parse args ----
INIT=false
DB_ONLY=false
for arg in "$@"; do
    case "$arg" in
        --init) INIT=true ;;
        --db-only) DB_ONLY=true ;;
        *) err "Unknown argument: $arg"; exit 1 ;;
    esac
done

# ---- Pre-flight ----
if [[ ! -d "$DOMAIN_ROOT" ]]; then
    err "Domain root not found: ${DOMAIN_ROOT}"
    err "Create the virtual server in Virtualmin first."
    exit 1
fi

# ---- Step 1: Clone or pull ----
if [[ "$DB_ONLY" == "false" ]]; then
    if [[ ! -d "${APP_DIR}/.git" ]]; then
        log "Cloning repository..."
        git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
    else
        log "Pulling latest from ${BRANCH}..."
        cd "$APP_DIR" && git fetch origin && git reset --hard "origin/${BRANCH}"
    fi
fi

# ---- Step 2: Environment file ----
if [[ ! -f "${APP_DIR}/.env" ]]; then
    if [[ -f "${APP_DIR}/deploy/.env.production" ]]; then
        log "Copying production .env..."
        cp "${APP_DIR}/deploy/.env.production" "${APP_DIR}/.env"
        chmod 600 "${APP_DIR}/.env"
        warn "Review ${APP_DIR}/.env and verify credentials."
    else
        err ".env not found and no template available."
        err "Copy .env.example to .env and configure it."
        exit 1
    fi
fi

# ---- Step 3: Build frontend (if not DB-only) ----
if [[ "$DB_ONLY" == "false" ]]; then
    if command -v node &>/dev/null; then
        log "Building frontend..."
        cd "${APP_DIR}/frontend"
        npm ci --production=false 2>/dev/null || npm install
        npx vite build
        log "Frontend built: $(du -sh dist | cut -f1)"
    else
        warn "Node.js not found. Skipping frontend build."
        warn "Install Node.js 18+ or deploy pre-built dist/ from CI."
    fi
fi

# ---- Step 4: Deploy to public_html ----
if [[ "$DB_ONLY" == "false" ]]; then
    log "Deploying to ${PUBLIC_HTML}..."

    # Sync React SPA (dist/) to public_html, excluding api/ and uploads/
    if [[ -d "${APP_DIR}/frontend/dist" ]]; then
        rsync -av --delete \
            --exclude='api/' \
            --exclude='.htaccess' \
            --exclude='uploads/' \
            "${APP_DIR}/frontend/dist/" "${PUBLIC_HTML}/"
        log "Frontend files synced."
    else
        warn "frontend/dist/ not found. Skipping SPA deployment."
        warn "Install Node.js 18+ and re-run, or build locally and push dist/."
    fi

    # Deploy API front controller
    mkdir -p "${PUBLIC_HTML}/api"
    cp "${APP_DIR}/deploy/api-index.php" "${PUBLIC_HTML}/api/index.php"

    # Deploy .htaccess files
    cp "${APP_DIR}/deploy/htaccess" "${PUBLIC_HTML}/.htaccess"

    # Create upload directories
    mkdir -p "${PUBLIC_HTML}/uploads/photos"
    cp "${APP_DIR}/deploy/uploads-htaccess" "${PUBLIC_HTML}/uploads/.htaccess"

    # Deploy custom error pages
    mkdir -p "${PUBLIC_HTML}/errors"
    cp "${APP_DIR}/deploy/errors/"*.html "${PUBLIC_HTML}/errors/"

    # Create storage directories
    mkdir -p "${APP_DIR}/storage/logs"
    mkdir -p "${APP_DIR}/storage/photos"
    mkdir -p "${BACKUP_DIR}"

    # Permissions
    chmod 755 "${PUBLIC_HTML}/uploads/photos"
    chmod 755 "${APP_DIR}/storage/logs"
    chmod 600 "${APP_DIR}/.env"
    chmod +x "${APP_DIR}/scripts/"*.sh 2>/dev/null || true

    log "Files deployed."
fi

# ---- Step 5: Database initialization (first time only) ----
if [[ "$INIT" == "true" || "$DB_ONLY" == "true" ]]; then
    # Source .env for DB credentials
    source <(grep -E '^DB_' "${APP_DIR}/.env" | sed 's/^/export /')

    DB_HOST="${DB_HOST:-localhost}"
    DB_DATABASE="${DB_DATABASE:-bearlyused_tirepos}"
    DB_USERNAME="${DB_USERNAME:-bearlyused}"
    DB_PASSWORD="${DB_PASSWORD:-}"

    AUTH="-h ${DB_HOST} -u ${DB_USERNAME}"
    if [[ -n "$DB_PASSWORD" ]]; then
        AUTH="${AUTH} -p${DB_PASSWORD}"
    fi

    log "Initializing database: ${DB_DATABASE}..."

    # Create database if it doesn't exist
    mysql $AUTH -e "CREATE DATABASE IF NOT EXISTS \`${DB_DATABASE}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" 2>/dev/null || true

    # Run base schema
    log "Loading base schema (68 tables, 9 views)..."
    mysql $AUTH --default-character-set=utf8mb4 "${DB_DATABASE}" < "${APP_DIR}/sql/tire_pos_schema_full.sql"

    # Run migrations in order (excludes down/ directory)
    for migration in "${APP_DIR}/sql/migrations/"*.sql; do
        [[ "$(basename "$migration")" == "down" ]] && continue
        mname=$(basename "$migration")
        log "Running migration: ${mname}"
        mysql $AUTH --default-character-set=utf8mb4 "${DB_DATABASE}" < "$migration"
    done

    # Verify
    TABLE_COUNT=$(mysql $AUTH -N -e "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = '${DB_DATABASE}' AND TABLE_TYPE = 'BASE TABLE';")
    log "Database initialized: ${TABLE_COUNT} tables."
fi

# ---- Step 6: Verify deployment ----
log ""
log "=========================================="
log "  Deployment complete!"
log "=========================================="
log ""
log "  Domain:     https://pos.bearlyused.net"
log "  App dir:    ${APP_DIR}"
log "  Doc root:   ${PUBLIC_HTML}"
log "  API entry:  ${PUBLIC_HTML}/api/index.php"
log "  .env:       ${APP_DIR}/.env"
log "  Uploads:    ${PUBLIC_HTML}/uploads/photos/"
log "  Backups:    ${BACKUP_DIR}"
log ""

if [[ "$INIT" == "true" ]]; then
    log "NEXT STEPS:"
    log "  1. Verify .env credentials: nano ${APP_DIR}/.env"
    log "  2. Test API health: curl https://pos.bearlyused.net/api/health"
    log "  3. Login: https://pos.bearlyused.net/login"
    log "     Default: admin / admin (forced password change on first login)"
    log "  4. Set up cron jobs (as bearlyused user):"
    log "     crontab -e"
    log "     */5 * * * *  ${APP_DIR}/scripts/cron-runner.sh all-frequent >> /dev/null 2>&1"
    log "     0   2 * * *  ${APP_DIR}/scripts/cron-runner.sh all-daily    >> /dev/null 2>&1"
    log ""
    log "  5. Expand open_basedir in Virtualmin:"
    log "     Virtualmin > pos.bearlyused.net > Web Configuration > PHP Options"
    log "     Set open_basedir to: /home/bearlyused/:/tmp/"
    log "     Then: sudo systemctl restart php8.3-fpm"
fi
