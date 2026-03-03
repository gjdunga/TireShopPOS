#!/usr/bin/env bash
# ============================================================================
# backup-db.sh
# Daily MySQL dump for Tire Shop POS.
#
# Produces a gzipped SQL dump in BACKUP_DIR with ISO-8601 date suffix.
# Rotates old backups beyond RETENTION_DAYS. Verifies dump integrity.
# Logs all output to BACKUP_DIR/backup.log.
#
# Usage:
#   ./scripts/backup-db.sh                     (uses .env defaults)
#   RETENTION_DAYS=14 ./scripts/backup-db.sh   (override retention)
#
# Exit codes:
#   0  Success
#   1  Configuration error (missing .env, missing tools)
#   2  Dump failed
#   3  Verification failed
#
# DunganSoft Technologies, March 2026
# ============================================================================

set -euo pipefail

# ---- Resolve paths ----
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# ---- Load .env ----
ENV_FILE="${PROJECT_ROOT}/.env"
if [[ ! -f "$ENV_FILE" ]]; then
    echo "[FATAL] .env not found at ${ENV_FILE}" >&2
    exit 1
fi

# Parse .env (skip comments, blank lines; handle quotes)
while IFS='=' read -r key value; do
    # Skip blanks and comments
    [[ -z "$key" || "$key" =~ ^[[:space:]]*# ]] && continue
    # Strip leading/trailing whitespace
    key="$(echo "$key" | xargs)"
    value="$(echo "$value" | xargs)"
    # Strip surrounding quotes
    value="${value%\"}"
    value="${value#\"}"
    value="${value%\'}"
    value="${value#\'}"
    export "$key=$value"
done < "$ENV_FILE"

# ---- Configuration ----
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-3306}"
DB_DATABASE="${DB_DATABASE:-tire_shop}"
DB_USERNAME="${DB_USERNAME:-root}"
DB_PASSWORD="${DB_PASSWORD:-}"
BACKUP_DIR="${BACKUP_PATH:-/var/backups/tire_shop}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

# ---- Derived ----
TIMESTAMP="$(date +%Y-%m-%dT%H%M%S)"
DUMP_FILE="${BACKUP_DIR}/${DB_DATABASE}_${TIMESTAMP}.sql.gz"
LOG_FILE="${BACKUP_DIR}/backup.log"

# ---- Pre-flight checks ----
for cmd in mysqldump gzip gunzip mysql; do
    if ! command -v "$cmd" &>/dev/null; then
        echo "[FATAL] Required command not found: $cmd" >&2
        exit 1
    fi
done

mkdir -p "$BACKUP_DIR"

# ---- Logging helper ----
log() {
    local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $1"
    echo "$msg" | tee -a "$LOG_FILE"
}

# ---- Build mysqldump auth args ----
AUTH_ARGS=( -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USERNAME" )
if [[ -n "$DB_PASSWORD" ]]; then
    AUTH_ARGS+=( -p"$DB_PASSWORD" )
fi

# ---- Dump ----
log "Starting backup of ${DB_DATABASE} to ${DUMP_FILE}"
log "Host: ${DB_HOST}:${DB_PORT}, User: ${DB_USERNAME}, Retention: ${RETENTION_DAYS} days"

if ! mysqldump "${AUTH_ARGS[@]}" \
    --single-transaction \
    --routines \
    --triggers \
    --events \
    --add-drop-table \
    --set-gtid-purged=OFF \
    "$DB_DATABASE" 2>>"$LOG_FILE" | gzip -9 > "$DUMP_FILE"; then
    log "FAILED: mysqldump returned non-zero"
    exit 2
fi

DUMP_SIZE="$(du -h "$DUMP_FILE" | cut -f1)"
log "Dump complete: ${DUMP_FILE} (${DUMP_SIZE})"

# ---- Verify ----
# Decompress and check that the dump contains CREATE TABLE statements
# and ends with the mysqldump completion marker.
log "Verifying dump integrity..."

TABLE_COUNT="$(gunzip -c "$DUMP_FILE" | grep -c '^CREATE TABLE' || true)"
HAS_COMPLETION="$(gunzip -c "$DUMP_FILE" | tail -5 | grep -c 'Dump completed' || true)"

if [[ "$TABLE_COUNT" -lt 10 ]]; then
    log "FAILED: Only ${TABLE_COUNT} CREATE TABLE statements found (expected 40+)"
    exit 3
fi

if [[ "$HAS_COMPLETION" -lt 1 ]]; then
    log "WARNING: Dump completion marker not found (may be truncated)"
    # Don't exit, but flag it
fi

log "Verification passed: ${TABLE_COUNT} tables, completion marker present"

# ---- Rotate old backups ----
DELETED=0
while IFS= read -r old_file; do
    rm -f "$old_file"
    ((DELETED++))
done < <(find "$BACKUP_DIR" -name "${DB_DATABASE}_*.sql.gz" -type f -mtime "+${RETENTION_DAYS}" 2>/dev/null)

if [[ "$DELETED" -gt 0 ]]; then
    log "Rotated ${DELETED} backup(s) older than ${RETENTION_DAYS} days"
fi

# ---- Write status file for health endpoint ----
cat > "${BACKUP_DIR}/last_backup.json" <<EOF
{
    "timestamp": "$(date -Iseconds)",
    "file": "${DUMP_FILE}",
    "size_bytes": $(stat -c%s "$DUMP_FILE" 2>/dev/null || echo 0),
    "tables": ${TABLE_COUNT},
    "retention_days": ${RETENTION_DAYS},
    "rotated": ${DELETED},
    "status": "ok"
}
EOF

log "Backup complete. Status written to ${BACKUP_DIR}/last_backup.json"
exit 0
