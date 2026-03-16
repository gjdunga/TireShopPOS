#!/usr/bin/env bash
# ============================================================================
# TireShopPOS: Smart Installer and Upgrade Manager
# ============================================================================
#
# Usage:
#   ./scripts/install.sh                Interactive install/upgrade
#   ./scripts/install.sh --upgrade      Non-interactive upgrade only
#   ./scripts/install.sh --check        Check for available upgrades
#   ./scripts/install.sh --status       Show current schema version
#
# Capabilities:
#   - Detects MySQL vs MariaDB and stores engine info
#   - Fresh install: loads base schema + all migrations
#   - Upgrade: applies only missing migrations in order
#   - Wipe and reinstall: backs up, drops all tables, reinstalls
#   - Checks GitHub repo for new migrations not yet applied
#   - Tracks every migration in schema_migrations (checksum, duration, errors)
#   - Records install/upgrade history in schema_version
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
    echo "    2) Upgrade (apply pending migrations)"
    echo "    3) Wipe and reinstall (backs up first)"
    echo "    4) Check for updates on GitHub"
    echo "    5) Show full status"
    echo "    6) Exit"
    echo ""
    read -p "  Choice [1-6]: " choice

    case "$choice" in
        1)
            if [[ "$TABLE_COUNT" -gt 0 ]]; then
                err "Database has $TABLE_COUNT tables. Use option 3 to wipe first."
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
        4)
            check_github_updates
            ;;
        5)
            show_status
            ;;
        6)
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
            --upgrade)  mode="upgrade" ;;
            --check)    mode="check" ;;
            --status)   mode="status" ;;
            --help|-h)
                echo "Usage: $0 [--upgrade|--check|--status|--help]"
                echo "  (no args)   Interactive installer menu"
                echo "  --upgrade   Non-interactive: apply pending migrations"
                echo "  --check     Check GitHub for new migrations"
                echo "  --status    Show current schema version and migration history"
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
        check)
            load_env
            detect_engine
            check_db_state
            check_github_updates
            ;;
        status)
            show_status
            ;;
    esac
}

main "$@"
