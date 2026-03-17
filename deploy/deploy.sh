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

usage() {
    cat << 'EOF'
TireShopPOS Deploy Script (v1.2.0)
DunganSoft Technologies

USAGE:
  ./deploy.sh [OPTIONS]

OPTIONS:
  (no args)     Pull latest code, build frontend, deploy to public_html.
                Does NOT touch the database. Safe for routine updates.

  --init        First-time setup. Clones repo, builds frontend, deploys
                files, creates database, loads schema (68 tables, 9 views),
                runs baseline migration, seeds lookup data.

  --wipe        DESTRUCTIVE. Backs up the database, drops all tables and
                views, then re-initializes from scratch (same as --init
                but on an existing database). Requires confirmation.
                Use when the schema is corrupted or you want a clean slate.

  --db-only     Database only. Skips code pull and frontend build.
                Loads schema + migrations. Use after manual schema edits
                or to re-initialize the database without redeploying files.

  --help, -h    Show this help message.

EXAMPLES:
  First install:    ./deploy.sh --init
  Routine update:   ./deploy.sh
  DB re-init only:  ./deploy.sh --db-only
  Wipe and rebuild: ./deploy.sh --wipe

POST-DEPLOY CHECKLIST (first time):
  1. Edit .env:         nano /home/bearlyused/domains/pos.bearlyused.net/app/.env
  2. Set open_basedir:  Virtualmin > Web Configuration > PHP Options
                        Set to: /home/bearlyused/:/tmp/
  3. Restart PHP-FPM:   sudo systemctl restart php8.3-fpm
  4. Test:              curl https://pos.bearlyused.net/api/health
  5. Login:             https://pos.bearlyused.net  (admin / admin, forced change)
  6. Create API key:    Settings > API Keys (for cron notification delivery)
  7. Set up cron:       crontab -e
     */5 * * * *  /home/bearlyused/domains/pos.bearlyused.net/app/scripts/cron-runner.sh all-frequent
     0   2 * * *  /home/bearlyused/domains/pos.bearlyused.net/app/scripts/cron-runner.sh all-daily

PATHS:
  App code:     /home/bearlyused/domains/pos.bearlyused.net/app/
  Doc root:     /home/bearlyused/domains/pos.bearlyused.net/public_html/
  Logs:         app/storage/logs/app.log
  Backups:      /home/bearlyused/backups/db/
  .env:         app/.env (chmod 600, never commit)

EOF
    exit 0
}

# ---- Parse args ----
INIT=false
DB_ONLY=false
WIPE=false
for arg in "$@"; do
    case "$arg" in
        --help|-h|help) usage ;;
        --init) INIT=true ;;
        --db-only) DB_ONLY=true ;;
        --wipe) WIPE=true ;;
        *) err "Unknown argument: $arg (try --help)"; exit 1 ;;
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

# ---- Step 5: Wipe database (if requested) ----
if [[ "$WIPE" == "true" ]]; then
    source <(grep -E '^DB_' "${APP_DIR}/.env" | sed 's/^/export /')

    DB_HOST="${DB_HOST:-localhost}"
    DB_DATABASE="${DB_DATABASE:-bearlyused_tirepos}"
    DB_USERNAME="${DB_USERNAME:-bearlyused}"
    DB_PASSWORD="${DB_PASSWORD:-}"

    AUTH="-h ${DB_HOST} -u ${DB_USERNAME}"
    if [[ -n "$DB_PASSWORD" ]]; then
        AUTH="${AUTH} -p${DB_PASSWORD}"
    fi

    TABLE_COUNT=$(mysql $AUTH -N -e "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = '${DB_DATABASE}' AND TABLE_TYPE = 'BASE TABLE';" 2>/dev/null || echo "0")

    warn "This will DESTROY all data in ${DB_DATABASE} (${TABLE_COUNT} tables)."
    warn "A backup will be created first."
    echo ""
    read -p "Type 'WIPE' to confirm: " CONFIRM
    if [[ "$CONFIRM" != "WIPE" ]]; then
        err "Aborted."
        exit 1
    fi

    # Backup first
    mkdir -p "${BACKUP_DIR}"
    BACKUP_FILE="${BACKUP_DIR}/${DB_DATABASE}_pre-wipe_$(date +%Y%m%d_%H%M%S).sql.gz"
    log "Backing up to ${BACKUP_FILE}..."
    mysqldump $AUTH --default-character-set=utf8mb4 --single-transaction "${DB_DATABASE}" 2>/dev/null | gzip > "${BACKUP_FILE}"
    if [[ -s "${BACKUP_FILE}" ]]; then
        log "Backup created: $(du -h "${BACKUP_FILE}" | cut -f1)"
    else
        err "Backup failed or empty. Aborting wipe."
        exit 1
    fi

    # Drop all views, then all tables (FK-safe order)
    log "Dropping all views and tables..."
    DROP_SQL="SET FOREIGN_KEY_CHECKS=0;"
    while IFS= read -r v; do
        [[ -z "$v" ]] && continue
        DROP_SQL="${DROP_SQL} DROP VIEW IF EXISTS \`$v\`;"
    done < <(mysql $AUTH -N -e "SELECT table_name FROM information_schema.VIEWS WHERE TABLE_SCHEMA='${DB_DATABASE}';" 2>/dev/null)
    while IFS= read -r t; do
        [[ -z "$t" ]] && continue
        DROP_SQL="${DROP_SQL} DROP TABLE IF EXISTS \`$t\`;"
    done < <(mysql $AUTH -N -e "SELECT table_name FROM information_schema.TABLES WHERE TABLE_SCHEMA='${DB_DATABASE}' AND TABLE_TYPE='BASE TABLE';" 2>/dev/null)
    DROP_SQL="${DROP_SQL} SET FOREIGN_KEY_CHECKS=1;"
    echo "${DROP_SQL}" | mysql $AUTH "${DB_DATABASE}" 2>/dev/null

    log "Database wiped. Re-initializing..."
    INIT=true
fi

# ---- Step 6: Database initialization (first time or after wipe) ----
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

# ---- Step 7: Verify deployment ----
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
