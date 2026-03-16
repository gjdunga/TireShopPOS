#!/usr/bin/env bash
# ============================================================================
# TireShopPOS: Smart Installer and Upgrade Manager
# ============================================================================
#
# Usage:
#   ./scripts/install.sh                Interactive install/upgrade
#   ./scripts/install.sh --upgrade      Non-interactive: apply pending migrations
#   ./scripts/install.sh --full-upgrade Pull code, rebuild frontend, migrate
#   ./scripts/install.sh --check        Check for available upgrades on GitHub
#   ./scripts/install.sh --status       Show current schema version
#   ./scripts/install.sh --deps         Check system dependencies
#
# Capabilities:
#   - Checks all dependencies before install (PHP, extensions, MySQL, Node, etc.)
#   - Detects MySQL vs MariaDB and stores engine info
#   - Fresh install: loads base schema + all migrations
#   - Upgrade: applies only missing migrations in order
#   - Full upgrade: git pull + dependency check + frontend rebuild + migrate
#   - Wipe and reinstall: backs up, drops all tables, reinstalls
#   - Checks GitHub repo for new migrations not yet applied
#   - Tracks every migration in schema_migrations (checksum, duration, errors)
#   - Records install/upgrade history in schema_version
#   - Auto-detects Virtualmin layout and rsyncs frontend to public_html
#
# Compatible with MySQL 8.0+ and MariaDB 10.6+.
#
# DunganSoft Technologies, March 2026
# ============================================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
APP_VERSION="2.4"
SCHEMA_VERSION="2.4"
GITHUB_REPO="gjdunga/TireShopPOS"
GITHUB_BRANCH="main"
MIGRATIONS_DIR="$PROJECT_ROOT/sql/migrations"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

log()  { echo -e "${GREEN}[*]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[X]${NC} $1"; }
info() { echo -e "${CYAN}[i]${NC} $1"; }

# ============================================================================
# Dependency checks
# ============================================================================

# Compare semver: returns 0 if $1 >= $2
version_ge() {
    local IFS=.
    local i a=($1) b=($2)
    for ((i=0; i<${#b[@]}; i++)); do
        local av=${a[i]:-0} bv=${b[i]:-0}
        if ((av > bv)); then return 0; fi
        if ((av < bv)); then return 1; fi
    done
    return 0
}

# Compare semver: returns 0 if $1 <= $2
version_le() {
    local IFS=.
    local i a=($1) b=($2)
    for ((i=0; i<${#b[@]}; i++)); do
        local av=${a[i]:-0} bv=${b[i]:-0}
        if ((av < bv)); then return 0; fi
        if ((av > bv)); then return 1; fi
    done
    return 0
}

check_dependencies() {
    # Load pinned versions
    local vconf="$PROJECT_ROOT/config/versions.conf"
    if [[ ! -f "$vconf" ]]; then
        err "config/versions.conf not found. Cannot check dependencies."
        return 1
    fi
    source "$vconf"

    local ok=0 total=0 warnings=0

    echo -e "\n${BOLD}Dependency Check${NC} (pinned to config/versions.conf)"
    echo "--------------------------------------"

    # -- PHP --
    ((total++))
    if command -v php >/dev/null 2>&1; then
        local php_ver
        php_ver=$(php -r 'echo PHP_MAJOR_VERSION . "." . PHP_MINOR_VERSION . "." . PHP_RELEASE_VERSION;' 2>/dev/null)
        if version_ge "$php_ver" "$PHP_MIN" && version_le "$php_ver" "$PHP_MAX"; then
            echo -e "  ${GREEN}OK${NC}  PHP $php_ver (range: $PHP_MIN .. $PHP_MAX)"
            ((ok++))
        elif version_ge "$php_ver" "$PHP_MIN"; then
            echo -e "  ${YELLOW}WARN${NC}  PHP $php_ver (above tested max $PHP_MAX, may work)"
            ((ok++)); ((warnings++))
        else
            echo -e "  ${RED}FAIL${NC}  PHP $php_ver (need >= $PHP_MIN, recommend $PHP_RECOMMENDED)"
        fi
    else
        echo -e "  ${RED}FAIL${NC}  PHP not found (need $PHP_RECOMMENDED, apt install php$PHP_RECOMMENDED)"
    fi

    # -- PHP extensions --
    local php_major_minor="${php_ver%.*}"  # e.g., "8.3" from "8.3.6"
    for ext in $PHP_EXTENSIONS; do
        ((total++))
        if php -m 2>/dev/null | grep -qi "^${ext}$" || php -r "exit(extension_loaded('$ext') ? 0 : 1);" 2>/dev/null; then
            echo -e "  ${GREEN}OK${NC}  PHP ext: $ext"
            ((ok++))
        else
            if [[ "$ext" == "json" ]]; then
                echo -e "  ${GREEN}OK${NC}  PHP ext: $ext (bundled in 8.x)"
                ((ok++))
            else
                echo -e "  ${RED}FAIL${NC}  PHP ext: $ext (apt install php${php_major_minor}-${ext})"
            fi
        fi
    done

    # -- Database engine --
    ((total++))
    if command -v mysql >/dev/null 2>&1; then
        # Detect engine from server, not client
        local server_ver=""
        if [[ -n "${DB_DATABASE:-}" ]]; then
            server_ver=$(mysql $MYSQL_AUTH -N -e "SELECT VERSION();" 2>/dev/null | head -1)
        fi
        if [[ -z "$server_ver" ]]; then
            server_ver=$(mysql --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
        fi

        if echo "$server_ver" | grep -qi "mariadb"; then
            local clean_ver
            clean_ver=$(echo "$server_ver" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
            if version_ge "$clean_ver" "$MARIADB_MIN" && version_le "$clean_ver" "$MARIADB_MAX"; then
                echo -e "  ${GREEN}OK${NC}  MariaDB $clean_ver (range: $MARIADB_MIN .. $MARIADB_MAX)"
                ((ok++))
            else
                echo -e "  ${RED}FAIL${NC}  MariaDB $clean_ver (need $MARIADB_MIN .. $MARIADB_MAX)"
            fi
        else
            local clean_ver
            clean_ver=$(echo "$server_ver" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
            if version_ge "$clean_ver" "$MYSQL_MIN" && version_le "$clean_ver" "$MYSQL_MAX"; then
                echo -e "  ${GREEN}OK${NC}  MySQL $clean_ver (range: $MYSQL_MIN .. $MYSQL_MAX)"
                ((ok++))
            else
                echo -e "  ${RED}FAIL${NC}  MySQL $clean_ver (need $MYSQL_MIN .. $MYSQL_MAX)"
            fi
        fi
    else
        echo -e "  ${RED}FAIL${NC}  mysql client not found (apt install mariadb-client or mysql-client)"
    fi

    # -- mysqldump --
    ((total++))
    if command -v mysqldump >/dev/null 2>&1; then
        echo -e "  ${GREEN}OK${NC}  mysqldump"
        ((ok++))
    else
        echo -e "  ${RED}FAIL${NC}  mysqldump not found (needed for backups)"
    fi

    # -- Node.js --
    ((total++))
    if command -v node >/dev/null 2>&1; then
        local node_ver
        node_ver=$(node --version 2>/dev/null | tr -d 'v')
        if version_ge "$node_ver" "$NODE_MIN" && version_le "$node_ver" "$NODE_MAX"; then
            echo -e "  ${GREEN}OK${NC}  Node.js $node_ver (range: $NODE_MIN .. $NODE_MAX)"
            ((ok++))
        elif version_ge "$node_ver" "$NODE_MIN"; then
            echo -e "  ${YELLOW}WARN${NC}  Node.js $node_ver (above tested max $NODE_MAX)"
            ((ok++)); ((warnings++))
        else
            echo -e "  ${YELLOW}WARN${NC}  Node.js $node_ver (need >= $NODE_MIN LTS for builds)"
            ((ok++)); ((warnings++))
        fi
    else
        echo -e "  ${YELLOW}WARN${NC}  Node.js not found (need $NODE_RECOMMENDED LTS for frontend builds)"
        ((ok++)); ((warnings++))
    fi

    # -- npm --
    ((total++))
    if command -v npm >/dev/null 2>&1; then
        local npm_ver
        npm_ver=$(npm --version 2>/dev/null)
        if version_ge "$npm_ver" "$NPM_MIN"; then
            echo -e "  ${GREEN}OK${NC}  npm $npm_ver (>= $NPM_MIN)"
            ((ok++))
        else
            echo -e "  ${YELLOW}WARN${NC}  npm $npm_ver (recommend >= $NPM_MIN)"
            ((ok++)); ((warnings++))
        fi
    else
        echo -e "  ${YELLOW}WARN${NC}  npm not found (needed for frontend builds)"
        ((ok++)); ((warnings++))
    fi

    # -- git --
    ((total++))
    if command -v git >/dev/null 2>&1; then
        echo -e "  ${GREEN}OK${NC}  git $(git --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')"
        ((ok++))
    else
        echo -e "  ${YELLOW}WARN${NC}  git not found (needed for upgrade checks)"
        ((ok++)); ((warnings++))
    fi

    # -- curl --
    ((total++))
    if command -v curl >/dev/null 2>&1; then
        echo -e "  ${GREEN}OK${NC}  curl"
        ((ok++))
    else
        echo -e "  ${RED}FAIL${NC}  curl not found (apt install curl)"
    fi

    # -- sha256sum --
    ((total++))
    if command -v sha256sum >/dev/null 2>&1; then
        echo -e "  ${GREEN}OK${NC}  sha256sum"
        ((ok++))
    else
        echo -e "  ${YELLOW}WARN${NC}  sha256sum not found (checksums will be empty)"
        ((ok++)); ((warnings++))
    fi

    # -- Disk space --
    ((total++))
    local free_mb
    free_mb=$(df -m "$PROJECT_ROOT" 2>/dev/null | awk 'NR==2{print $4}')
    free_mb=${free_mb:-0}
    if [[ "$free_mb" -ge 200 ]]; then
        echo -e "  ${GREEN}OK${NC}  Disk: ${free_mb}MB free (>= 200MB required)"
        ((ok++))
    else
        echo -e "  ${RED}FAIL${NC}  Disk: ${free_mb}MB free (need >= 200MB)"
    fi

    # -- .env file --
    ((total++))
    if [[ -f "$PROJECT_ROOT/.env" ]]; then
        echo -e "  ${GREEN}OK${NC}  .env file exists"
        ((ok++))
    else
        echo -e "  ${RED}FAIL${NC}  .env file missing (cp deploy/.env.production.example .env)"
    fi

    echo "--------------------------------------"
    echo -e "  Result: ${ok}/${total} passed"
    if [[ $warnings -gt 0 ]]; then
        echo -e "  ${YELLOW}$warnings warning(s)${NC} (non-critical, builds may be affected)"
    fi
    echo -e "  Pinned to: PHP $PHP_RECOMMENDED, MariaDB $MARIADB_RECOMMENDED / MySQL $MYSQL_RECOMMENDED, Node $NODE_RECOMMENDED LTS"

    if [[ $ok -lt $total ]]; then
        echo ""
        err "Required dependencies missing. Fix the FAIL items above before proceeding."
        return 1
    fi

    return 0
}

# ============================================================================
# Frontend build and deploy
# ============================================================================

do_rebuild_frontend() {
    local frontend_dir="$PROJECT_ROOT/frontend"

    if [[ ! -d "$frontend_dir" ]]; then
        warn "No frontend/ directory found. Skipping frontend build."
        return 0
    fi

    if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
        warn "Node.js/npm not available. Skipping frontend build."
        warn "If this is a production server, build on a dev machine and deploy dist/."
        return 0
    fi

    log "Installing frontend dependencies..."
    (cd "$frontend_dir" && npm install --no-audit --no-fund 2>&1 | tail -3)
    if [[ ${PIPESTATUS[0]} -ne 0 ]]; then
        err "npm install failed."
        return 1
    fi

    log "Building frontend (Vite)..."
    (cd "$frontend_dir" && npx vite build 2>&1 | tail -8)
    if [[ ${PIPESTATUS[0]} -ne 0 ]]; then
        err "Vite build failed."
        return 1
    fi

    # If Virtualmin layout detected, rsync to public_html
    local public_html
    public_html=$(find "$(dirname "$PROJECT_ROOT")" -maxdepth 1 -name "public_html" -type d 2>/dev/null | head -1)

    if [[ -n "$public_html" && -d "$public_html" ]]; then
        log "Deploying frontend to $public_html ..."
        rsync -a --delete "$frontend_dir/dist/" "$public_html/" \
            --exclude='api/' --exclude='uploads/' --exclude='.htaccess' 2>/dev/null
        log "Frontend deployed to public_html."
    else
        log "Frontend built to frontend/dist/. No public_html detected for auto-deploy."
    fi

    return 0
}

# ============================================================================
# Git pull
# ============================================================================

do_git_pull() {
    if ! command -v git >/dev/null 2>&1; then
        warn "git not found. Skipping code pull."
        return 1
    fi

    if [[ ! -d "$PROJECT_ROOT/.git" ]]; then
        warn "Not a git repository. Skipping code pull."
        return 1
    fi

    log "Pulling latest code from $GITHUB_BRANCH ..."
    local output
    output=$(cd "$PROJECT_ROOT" && git pull origin "$GITHUB_BRANCH" 2>&1)
    local exit_code=$?

    if [[ $exit_code -ne 0 ]]; then
        err "git pull failed:"
        echo "$output" | head -5
        return 1
    fi

    if echo "$output" | grep -q "Already up to date"; then
        info "Code is already up to date."
        return 0
    fi

    log "Code updated."
    # Show what changed
    echo "$output" | head -10
    return 0
}

# ============================================================================
# Full upgrade: pull + deps + rebuild + migrate
# ============================================================================

do_full_upgrade() {
    log "Starting full upgrade..."

    # Step 1: Pull code
    local code_changed=0
    if do_git_pull; then
        code_changed=1
    fi

    # Step 2: Check deps
    if ! check_dependencies; then
        err "Dependency check failed. Fix issues before continuing."
        return 1
    fi

    # Step 3: Rebuild frontend (only if code changed or dist/ missing)
    if [[ $code_changed -eq 1 ]] || [[ ! -d "$PROJECT_ROOT/frontend/dist" ]]; then
        do_rebuild_frontend
    else
        info "Frontend dist/ exists and no code changes detected. Skipping rebuild."
    fi

    # Step 4: Apply pending migrations
    do_upgrade

    echo ""
    log "Full upgrade complete."
}

# ============================================================================
# Load DB credentials from .env
# ============================================================================

load_env() {
    local envfile="$PROJECT_ROOT/.env"
    if [[ ! -f "$envfile" ]]; then
        err "No .env file found at $envfile"
        err "Copy deploy/.env.production.example to .env and fill in credentials."
        exit 1
    fi

    DB_HOST=$(grep '^DB_HOST=' "$envfile" | cut -d'=' -f2- | tr -d '"' || echo "localhost")
    DB_PORT=$(grep '^DB_PORT=' "$envfile" | cut -d'=' -f2- | tr -d '"' || echo "3306")
    DB_DATABASE=$(grep '^DB_DATABASE=' "$envfile" | cut -d'=' -f2- | tr -d '"')
    DB_USERNAME=$(grep '^DB_USERNAME=' "$envfile" | cut -d'=' -f2- | tr -d '"')
    DB_PASSWORD=$(grep '^DB_PASSWORD=' "$envfile" | cut -d'=' -f2- | tr -d '"')
    DB_SOCKET=$(grep '^DB_SOCKET=' "$envfile" | cut -d'=' -f2- | tr -d '"' || echo "")

    if [[ -z "$DB_DATABASE" || -z "$DB_USERNAME" ]]; then
        err "DB_DATABASE and DB_USERNAME must be set in .env"
        exit 1
    fi

    # Build mysql auth string
    MYSQL_AUTH="-u $DB_USERNAME"
    if [[ -n "$DB_PASSWORD" ]]; then
        MYSQL_AUTH="$MYSQL_AUTH -p$DB_PASSWORD"
    fi
    if [[ -n "$DB_SOCKET" ]]; then
        MYSQL_AUTH="$MYSQL_AUTH -S $DB_SOCKET"
    else
        MYSQL_AUTH="$MYSQL_AUTH -h $DB_HOST -P $DB_PORT"
    fi
}

# Shorthand for mysql commands
run_sql() { mysql $MYSQL_AUTH --default-character-set=utf8mb4 "$DB_DATABASE" "$@" 2>&1; }
run_sql_silent() { mysql $MYSQL_AUTH --default-character-set=utf8mb4 "$DB_DATABASE" -N -e "$1" 2>/dev/null; }
run_sql_file() { mysql $MYSQL_AUTH --default-character-set=utf8mb4 "$DB_DATABASE" < "$1" 2>&1; }

# ============================================================================
# Detect database engine
# ============================================================================

detect_engine() {
    local version_str
    version_str=$(mysql $MYSQL_AUTH -N -e "SELECT VERSION();" 2>/dev/null)
    if [[ -z "$version_str" ]]; then
        err "Cannot connect to database. Check .env credentials."
        exit 1
    fi

    if echo "$version_str" | grep -qi "mariadb"; then
        DB_ENGINE="MariaDB"
        DB_ENGINE_VERSION=$(echo "$version_str" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
    else
        DB_ENGINE="MySQL"
        DB_ENGINE_VERSION=$(echo "$version_str" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
    fi

    info "Database engine: ${BOLD}$DB_ENGINE $DB_ENGINE_VERSION${NC}"
}

# ============================================================================
# Check database state
# ============================================================================

check_db_state() {
    # Ensure database exists
    mysql $MYSQL_AUTH -e "CREATE DATABASE IF NOT EXISTS \`$DB_DATABASE\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" 2>/dev/null

    TABLE_COUNT=$(run_sql_silent "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='$DB_DATABASE' AND TABLE_TYPE='BASE TABLE';")
    TABLE_COUNT=${TABLE_COUNT:-0}

    HAS_VERSION_TABLE=0
    if run_sql_silent "SELECT 1 FROM schema_version LIMIT 1;" >/dev/null 2>&1; then
        HAS_VERSION_TABLE=1
    fi

    CURRENT_VERSION=""
    LAST_MIGRATION=""
    INSTALLED_AT=""
    if [[ "$HAS_VERSION_TABLE" == "1" ]]; then
        CURRENT_VERSION=$(run_sql_silent "SELECT app_version FROM schema_version WHERE id=1;")
        LAST_MIGRATION=$(run_sql_silent "SELECT last_migration FROM schema_version WHERE id=1;")
        INSTALLED_AT=$(run_sql_silent "SELECT installed_at FROM schema_version WHERE id=1;")
    fi
}

# ============================================================================
# Backup
# ============================================================================

backup_database() {
    local backup_dir="$PROJECT_ROOT/storage/backups"
    mkdir -p "$backup_dir"
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local backup_file="$backup_dir/${DB_DATABASE}_${timestamp}.sql.gz"

    log "Backing up $DB_DATABASE to $backup_file ..."
    mysqldump $MYSQL_AUTH --default-character-set=utf8mb4 \
        --single-transaction --routines --triggers --events \
        "$DB_DATABASE" 2>/dev/null | gzip > "$backup_file"

    if [[ ${PIPESTATUS[0]} -eq 0 ]]; then
        local size=$(du -h "$backup_file" | cut -f1)
        log "Backup complete: $backup_file ($size)"
        echo "$backup_file"
    else
        err "Backup failed!"
        rm -f "$backup_file"
        return 1
    fi
}

# ============================================================================
# Wipe database
# ============================================================================

wipe_database() {
    warn "Dropping all tables in $DB_DATABASE ..."

    # Disable FK checks, drop all tables, re-enable
    local tables
    tables=$(run_sql_silent "SELECT GROUP_CONCAT(table_name SEPARATOR ',') FROM information_schema.TABLES WHERE TABLE_SCHEMA='$DB_DATABASE' AND TABLE_TYPE='BASE TABLE';")

    if [[ -n "$tables" && "$tables" != "NULL" ]]; then
        run_sql -e "SET FOREIGN_KEY_CHECKS=0;"
        # Drop views first
        local views
        views=$(run_sql_silent "SELECT GROUP_CONCAT(table_name SEPARATOR ',') FROM information_schema.VIEWS WHERE TABLE_SCHEMA='$DB_DATABASE';")
        if [[ -n "$views" && "$views" != "NULL" ]]; then
            IFS=',' read -ra VARR <<< "$views"
            for v in "${VARR[@]}"; do
                run_sql -e "DROP VIEW IF EXISTS \`$v\`;" 2>/dev/null
            done
        fi
        # Drop tables
        IFS=',' read -ra TARR <<< "$tables"
        for t in "${TARR[@]}"; do
            run_sql -e "DROP TABLE IF EXISTS \`$t\`;" 2>/dev/null
        done
        run_sql -e "SET FOREIGN_KEY_CHECKS=1;"
    fi

    log "Database wiped."
}

# ============================================================================
# Compute file checksum
# ============================================================================

file_checksum() {
    sha256sum "$1" 2>/dev/null | cut -d' ' -f1
}

# ============================================================================
# Apply a single migration
# ============================================================================

apply_migration() {
    local filepath="$1"
    local filename=$(basename "$filepath")
    local checksum=$(file_checksum "$filepath")
    local os_user=$(whoami)

    # Check if already applied
    if [[ "$HAS_VERSION_TABLE" == "1" ]]; then
        local already
        already=$(run_sql_silent "SELECT COUNT(*) FROM schema_migrations WHERE filename='$filename' AND success=1;")
        if [[ "$already" == "1" ]]; then
            # Check if checksum matches (file may have changed)
            local old_checksum
            old_checksum=$(run_sql_silent "SELECT checksum FROM schema_migrations WHERE filename='$filename' AND success=1;")
            if [[ "$old_checksum" == "$checksum" ]]; then
                info "  SKIP: $filename (already applied, checksum matches)"
                return 0
            else
                warn "  WARN: $filename was applied before but file has changed"
                warn "        Old checksum: ${old_checksum:0:16}..."
                warn "        New checksum: ${checksum:0:16}..."
                # Record as skipped with reason
                run_sql -e "INSERT INTO schema_migrations (filename, checksum, success, skipped, skip_reason, applied_by, app_version) VALUES ('${filename}_recheck', '$checksum', 1, 1, 'File changed since last apply; original already applied', '$os_user', '$APP_VERSION') ON DUPLICATE KEY UPDATE skip_reason='File changed';" 2>/dev/null
                return 0
            fi
        fi
    fi

    local start_ms=$(($(date +%s%N)/1000000))

    log "  Applying: $filename ..."
    local output
    output=$(run_sql_file "$filepath" 2>&1)
    local exit_code=$?

    local end_ms=$(($(date +%s%N)/1000000))
    local duration=$((end_ms - start_ms))

    if [[ $exit_code -eq 0 ]]; then
        log "  OK: $filename (${duration}ms)"

        # Record success (if version table exists now, might have just been created)
        run_sql -e "INSERT INTO schema_migrations (filename, checksum, duration_ms, success, skipped, applied_by, app_version) VALUES ('$filename', '$checksum', $duration, 1, 0, '$os_user', '$APP_VERSION') ON DUPLICATE KEY UPDATE checksum='$checksum', duration_ms=$duration, success=1, applied_at=NOW();" 2>/dev/null
        return 0
    else
        err "  FAIL: $filename"
        # Truncate error for storage
        local err_msg
        err_msg=$(echo "$output" | head -5 | tr "'" '"' | head -c 250)
        echo "$output" | head -10

        run_sql -e "INSERT INTO schema_migrations (filename, checksum, duration_ms, success, skipped, error_message, applied_by, app_version) VALUES ('$filename', '$checksum', $duration, 0, 0, '$err_msg', '$os_user', '$APP_VERSION') ON DUPLICATE KEY UPDATE error_message='$err_msg', success=0;" 2>/dev/null
        return 1
    fi
}

# ============================================================================
# Get list of pending migrations
# ============================================================================

get_pending_migrations() {
    local pending=()
    for f in "$MIGRATIONS_DIR"/*.sql; do
        [[ ! -f "$f" ]] && continue
        local filename=$(basename "$f")
        local applied=0
        if [[ "$HAS_VERSION_TABLE" == "1" ]]; then
            applied=$(run_sql_silent "SELECT COUNT(*) FROM schema_migrations WHERE filename='$filename' AND success=1;" 2>/dev/null)
            applied=${applied:-0}
        fi
        if [[ "$applied" == "0" ]]; then
            pending+=("$f")
        fi
    done
    echo "${pending[@]}"
}

# ============================================================================
# Update schema_version row
# ============================================================================

update_version_row() {
    local total_ok total_skip os_user last_mig
    os_user=$(whoami)
    total_ok=$(run_sql_silent "SELECT COUNT(*) FROM schema_migrations WHERE success=1 AND skipped=0;" 2>/dev/null || echo 0)
    total_skip=$(run_sql_silent "SELECT COUNT(*) FROM schema_migrations WHERE skipped=1;" 2>/dev/null || echo 0)
    last_mig=$(run_sql_silent "SELECT filename FROM schema_migrations WHERE success=1 AND skipped=0 ORDER BY migration_id DESC LIMIT 1;" 2>/dev/null || echo "")

    run_sql -e "INSERT INTO schema_version (id, app_version, schema_version, db_engine, db_engine_version, installed_at, last_upgraded_at, last_migration, total_migrations, total_skipped, installer_user) VALUES (1, '$APP_VERSION', '$SCHEMA_VERSION', '$DB_ENGINE', '$DB_ENGINE_VERSION', NOW(), NOW(), '$last_mig', $total_ok, $total_skip, '$os_user') ON DUPLICATE KEY UPDATE app_version='$APP_VERSION', schema_version='$SCHEMA_VERSION', db_engine='$DB_ENGINE', db_engine_version='$DB_ENGINE_VERSION', last_upgraded_at=NOW(), last_migration='$last_mig', total_migrations=$total_ok, total_skipped=$total_skip, installer_user='$os_user';" 2>/dev/null
}

# ============================================================================
# Check GitHub for new migrations
# ============================================================================

check_github_updates() {
    log "Checking GitHub ($GITHUB_REPO/$GITHUB_BRANCH) for new migrations..."

    local api_url="https://api.github.com/repos/$GITHUB_REPO/contents/sql/migrations?ref=$GITHUB_BRANCH"
    local response
    response=$(curl -s -H "Accept: application/vnd.github.v3+json" "$api_url" 2>/dev/null)

    if [[ -z "$response" ]] || echo "$response" | grep -q '"message"'; then
        warn "Could not reach GitHub API (rate limited or offline)."
        warn "Falling back to local migration files only."
        return 1
    fi

    local remote_files
    remote_files=$(echo "$response" | grep -o '"name": "[^"]*\.sql"' | sed 's/"name": "//;s/"//' | sort)

    local local_files
    local_files=$(ls "$MIGRATIONS_DIR"/*.sql 2>/dev/null | xargs -n1 basename | sort)

    local new_on_remote=()
    while IFS= read -r rf; do
        [[ -z "$rf" ]] && continue
        if ! echo "$local_files" | grep -qx "$rf"; then
            new_on_remote+=("$rf")
        fi
    done <<< "$remote_files"

    if [[ ${#new_on_remote[@]} -eq 0 ]]; then
        log "No new migrations found on GitHub. You are up to date."
        return 0
    fi

    warn "Found ${#new_on_remote[@]} new migration(s) on GitHub not in your local repo:"
    for nf in "${new_on_remote[@]}"; do
        echo -e "  ${CYAN}$nf${NC}"
    done
    echo ""
    info "Run 'git pull origin $GITHUB_BRANCH' to download them, then re-run this script."
    return 2
}

# ============================================================================
# Show status
# ============================================================================

show_status() {
    load_env
    detect_engine
    check_db_state

    echo ""
    echo -e "${BOLD}TireShopPOS Schema Status${NC}"
    echo "======================================"
    echo -e "  Database:        ${BOLD}$DB_DATABASE${NC}"
    echo -e "  Engine:          $DB_ENGINE $DB_ENGINE_VERSION"
    echo -e "  Tables:          $TABLE_COUNT"

    if [[ "$HAS_VERSION_TABLE" == "1" && -n "$CURRENT_VERSION" ]]; then
        echo -e "  App Version:     ${GREEN}$CURRENT_VERSION${NC}"
        echo -e "  Installed:       $INSTALLED_AT"
        echo -e "  Last Migration:  $LAST_MIGRATION"

        local total_ok total_skip total_fail
        total_ok=$(run_sql_silent "SELECT COUNT(*) FROM schema_migrations WHERE success=1 AND skipped=0;")
        total_skip=$(run_sql_silent "SELECT COUNT(*) FROM schema_migrations WHERE skipped=1;")
        total_fail=$(run_sql_silent "SELECT COUNT(*) FROM schema_migrations WHERE success=0;")
        echo -e "  Migrations:      $total_ok applied, $total_skip skipped, $total_fail failed"

        echo ""
        echo -e "  ${CYAN}Migration History:${NC}"
        run_sql -e "SELECT filename, IF(success,'OK','FAIL') AS status, IF(skipped,'SKIP',''), DATE_FORMAT(applied_at, '%Y-%m-%d %H:%i') AS applied, CONCAT(duration_ms,'ms') AS duration FROM schema_migrations ORDER BY filename;" 2>/dev/null
    else
        warn "  Version tracking not installed yet."
        warn "  Run: ./scripts/install.sh"
    fi
    echo "======================================"
}

# ============================================================================
# Fresh install
# ============================================================================

do_fresh_install() {
    log "Running dependency check..."
    if ! check_dependencies; then
        err "Cannot proceed with install. Fix dependency issues first."
        return 1
    fi

    log "Starting fresh install..."

    # Base schema
    log "Loading base schema..."
    local output
    output=$(run_sql_file "$PROJECT_ROOT/sql/tire_pos_schema_full.sql" 2>&1)
    if [[ $? -ne 0 ]]; then
        err "Base schema failed:"
        echo "$output" | head -10
        exit 1
    fi
    log "Base schema loaded."

    # Create version tracking table FIRST so all migrations get recorded
    log "Installing version tracking..."
    run_sql_file "$MIGRATIONS_DIR/008_schema_version.sql" 2>/dev/null
    HAS_VERSION_TABLE=1
    local ck008=$(file_checksum "$MIGRATIONS_DIR/008_schema_version.sql")
    run_sql -e "INSERT IGNORE INTO schema_migrations (filename, checksum, success, applied_by, app_version) VALUES ('008_schema_version.sql', '$ck008', 1, '$(whoami)', '$APP_VERSION');" 2>/dev/null

    # All migrations in order
    log "Applying migrations..."
    local fail_count=0
    for mig in "$MIGRATIONS_DIR"/*.sql; do
        [[ ! -f "$mig" ]] && continue
        local fname=$(basename "$mig")
        # Skip 008, already applied above
        [[ "$fname" == "008_schema_version.sql" ]] && continue
        apply_migration "$mig" || ((fail_count++))
    done

    update_version_row

    # Re-check table count for display
    TABLE_COUNT=$(run_sql_silent "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='$DB_DATABASE' AND TABLE_TYPE='BASE TABLE';")

    echo ""
    if [[ $fail_count -eq 0 ]]; then
        log "Fresh install complete. $TABLE_COUNT tables, all migrations applied."
    else
        warn "Install complete with $fail_count migration failure(s). Check output above."
    fi
}

# ============================================================================
# Upgrade (apply pending migrations)
# ============================================================================

do_upgrade() {
    log "Checking for pending migrations..."

    # Ensure version table exists first
    if [[ "$HAS_VERSION_TABLE" == "0" ]]; then
        log "Installing version tracking table..."
        run_sql_file "$MIGRATIONS_DIR/008_schema_version.sql" 2>/dev/null
        HAS_VERSION_TABLE=1
        # Record all existing migrations as previously applied
        for mig in "$MIGRATIONS_DIR"/*.sql; do
            local fn=$(basename "$mig")
            [[ "$fn" == "008_schema_version.sql" ]] && continue
            local ck=$(file_checksum "$mig")
            run_sql -e "INSERT IGNORE INTO schema_migrations (filename, checksum, success, skipped, skip_reason, applied_by, app_version) VALUES ('$fn', '$ck', 1, 1, 'Pre-existing before version tracking installed', '$(whoami)', '$APP_VERSION');" 2>/dev/null
        done
        # Record 008 itself
        local ck008=$(file_checksum "$MIGRATIONS_DIR/008_schema_version.sql")
        run_sql -e "INSERT IGNORE INTO schema_migrations (filename, checksum, success, applied_by, app_version) VALUES ('008_schema_version.sql', '$ck008', 1, '$(whoami)', '$APP_VERSION');" 2>/dev/null
        update_version_row
        log "Version tracking installed. Pre-existing migrations recorded as applied."
    fi

    local pending
    pending=$(get_pending_migrations)

    if [[ -z "$pending" ]]; then
        log "All migrations already applied. Nothing to do."
        update_version_row
        return 0
    fi

    local count=0
    local fail_count=0
    for mig in $pending; do
        apply_migration "$mig" || ((fail_count++))
        ((count++))
    done

    update_version_row

    echo ""
    if [[ $fail_count -eq 0 ]]; then
        log "Upgrade complete. $count migration(s) applied."
    else
        warn "Upgrade complete with $fail_count failure(s) out of $count."
    fi
}

# ============================================================================
# Interactive menu
# ============================================================================

interactive_menu() {
    echo ""
    echo -e "${BOLD}==========================================${NC}"
    echo -e "${BOLD}  TireShopPOS Installer v$APP_VERSION${NC}"
    echo -e "${BOLD}  DunganSoft Technologies${NC}"
    echo -e "${BOLD}==========================================${NC}"
    echo ""

    load_env
    detect_engine
    check_db_state

    echo -e "  Database:  ${BOLD}$DB_DATABASE${NC} ($TABLE_COUNT tables)"

    if [[ "$HAS_VERSION_TABLE" == "1" && -n "$CURRENT_VERSION" ]]; then
        echo -e "  Version:   ${GREEN}$CURRENT_VERSION${NC} (installed $INSTALLED_AT)"
        echo -e "  Last:      $LAST_MIGRATION"
    elif [[ "$TABLE_COUNT" -gt 0 ]]; then
        warn "  Tables exist but no version tracking found."
    else
        info "  Empty database. Ready for fresh install."
    fi

    echo ""
    echo "  What would you like to do?"
    echo ""
    echo "    1) Fresh install (empty database required)"
    echo "    2) Upgrade database (apply pending migrations only)"
    echo "    3) Full upgrade (git pull, rebuild frontend, migrate)"
    echo "    4) Wipe and reinstall (backs up first)"
    echo "    5) Check for updates on GitHub"
    echo "    6) Check dependencies"
    echo "    7) Show full status"
    echo "    8) Exit"
    echo ""
    read -p "  Choice [1-8]: " choice

    case "$choice" in
        1)
            if [[ "$TABLE_COUNT" -gt 0 ]]; then
                err "Database has $TABLE_COUNT tables. Use option 4 to wipe first."
                return 1
            fi
            do_fresh_install
            ;;
        2)
            if [[ "$TABLE_COUNT" -eq 0 ]]; then
                err "Database is empty. Use option 1 for fresh install."
                return 1
            fi
            do_upgrade
            ;;
        3)
            if [[ "$TABLE_COUNT" -eq 0 ]]; then
                err "Database is empty. Use option 1 for fresh install."
                return 1
            fi
            do_full_upgrade
            ;;
        4)
            if [[ "$TABLE_COUNT" -eq 0 ]]; then
                warn "Database is already empty. Proceeding with fresh install."
                do_fresh_install
                return
            fi

            echo ""
            warn "This will:"
            warn "  1. Back up the entire database"
            warn "  2. DROP all $TABLE_COUNT tables and views"
            warn "  3. Reinstall from scratch"
            echo ""
            read -p "  Type 'WIPE' to confirm: " confirm
            if [[ "$confirm" != "WIPE" ]]; then
                info "Cancelled."
                return 0
            fi

            local backup_file
            backup_file=$(backup_database)
            if [[ $? -ne 0 ]]; then
                err "Backup failed. Will not wipe. Fix the issue and retry."
                return 1
            fi

            wipe_database
            HAS_VERSION_TABLE=0
            TABLE_COUNT=0
            do_fresh_install
            ;;
        5)
            check_github_updates
            ;;
        6)
            check_dependencies
            ;;
        7)
            show_status
            ;;
        8)
            info "Bye."
            exit 0
            ;;
        *)
            err "Invalid choice."
            return 1
            ;;
    esac
}

# ============================================================================
# Main
# ============================================================================

main() {
    local mode="interactive"

    for arg in "$@"; do
        case "$arg" in
            --upgrade)       mode="upgrade" ;;
            --full-upgrade)  mode="full-upgrade" ;;
            --check)         mode="check" ;;
            --status)        mode="status" ;;
            --deps)          mode="deps" ;;
            --help|-h)
                echo "Usage: $0 [--upgrade|--full-upgrade|--check|--status|--deps|--help]"
                echo "  (no args)       Interactive installer menu"
                echo "  --upgrade       Apply pending database migrations only"
                echo "  --full-upgrade  Git pull + rebuild frontend + migrate"
                echo "  --check         Check GitHub for new migrations"
                echo "  --status        Show schema version and migration history"
                echo "  --deps          Check system dependencies"
                exit 0
                ;;
            *)
                err "Unknown argument: $arg"
                exit 1
                ;;
        esac
    done

    case "$mode" in
        interactive)
            interactive_menu
            ;;
        upgrade)
            load_env
            detect_engine
            check_db_state
            do_upgrade
            ;;
        full-upgrade)
            load_env
            detect_engine
            check_db_state
            do_full_upgrade
            ;;
        check)
            load_env
            detect_engine
            check_db_state
            check_github_updates
            ;;
        status)
            show_status
            ;;
        deps)
            load_env 2>/dev/null || true
            check_dependencies
            ;;
    esac
}

main "$@"
