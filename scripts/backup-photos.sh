#!/usr/bin/env bash
# ============================================================================
# backup-photos.sh
# Rsync tire/work order photos to backup location.
#
# Copies from PHOTO_PATH (storage/photos) to BACKUP_DIR/photos/.
# Uses rsync with checksum mode to avoid re-copying unchanged files.
# Logs output and writes status file for health endpoint.
#
# Usage:
#   ./scripts/backup-photos.sh
#   PHOTO_PATH=/custom/path ./scripts/backup-photos.sh
#
# Exit codes:
#   0  Success
#   1  Configuration error
#   2  Rsync failed
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

while IFS='=' read -r key value; do
    [[ -z "$key" || "$key" =~ ^[[:space:]]*# ]] && continue
    key="$(echo "$key" | xargs)"
    value="$(echo "$value" | xargs)"
    value="${value%\"}"
    value="${value#\"}"
    value="${value%\'}"
    value="${value#\'}"
    export "$key=$value"
done < "$ENV_FILE"

# ---- Configuration ----
PHOTO_PATH="${PHOTO_PATH:-${PROJECT_ROOT}/storage/photos}"
BACKUP_DIR="${BACKUP_PATH:-/var/backups/tire_shop}"
PHOTO_BACKUP_DIR="${BACKUP_DIR}/photos"
LOG_FILE="${BACKUP_DIR}/backup.log"

# ---- Pre-flight ----
if ! command -v rsync &>/dev/null; then
    echo "[FATAL] rsync not found" >&2
    exit 1
fi

mkdir -p "$PHOTO_BACKUP_DIR" "$BACKUP_DIR"

log() {
    local msg="[$(date '+%Y-%m-%d %H:%M:%S')] [photos] $1"
    echo "$msg" | tee -a "$LOG_FILE"
}

# ---- Check source ----
if [[ ! -d "$PHOTO_PATH" ]]; then
    log "WARNING: Photo source directory does not exist: ${PHOTO_PATH}"
    log "Creating empty directory and skipping sync"
    mkdir -p "$PHOTO_PATH"

    cat > "${BACKUP_DIR}/last_photo_backup.json" <<EOF
{
    "timestamp": "$(date -Iseconds)",
    "source": "${PHOTO_PATH}",
    "destination": "${PHOTO_BACKUP_DIR}",
    "files_transferred": 0,
    "total_size": "0",
    "status": "skipped",
    "reason": "source directory empty or missing"
}
EOF
    exit 0
fi

# ---- Rsync ----
log "Starting photo backup: ${PHOTO_PATH} -> ${PHOTO_BACKUP_DIR}"

# Capture rsync stats
RSYNC_OUTPUT=$(rsync -av --checksum --delete \
    --exclude='.gitkeep' \
    --stats \
    "${PHOTO_PATH}/" "${PHOTO_BACKUP_DIR}/" 2>&1) || {
    log "FAILED: rsync returned non-zero"
    echo "$RSYNC_OUTPUT" >> "$LOG_FILE"
    exit 2
}

echo "$RSYNC_OUTPUT" >> "$LOG_FILE"

# Parse stats
FILES_TRANSFERRED=$(echo "$RSYNC_OUTPUT" | grep -oP 'Number of regular files transferred: \K[0-9]+' || echo "0")
TOTAL_SIZE=$(echo "$RSYNC_OUTPUT" | grep -oP 'Total file size: \K[0-9,]+' || echo "0")
# Count files at destination
FILE_COUNT=$(find "$PHOTO_BACKUP_DIR" -type f 2>/dev/null | wc -l)

log "Photo backup complete: ${FILES_TRANSFERRED} files transferred, ${FILE_COUNT} total files"

# ---- Write status file ----
cat > "${BACKUP_DIR}/last_photo_backup.json" <<EOF
{
    "timestamp": "$(date -Iseconds)",
    "source": "${PHOTO_PATH}",
    "destination": "${PHOTO_BACKUP_DIR}",
    "files_transferred": ${FILES_TRANSFERRED},
    "total_files": ${FILE_COUNT},
    "total_size": "${TOTAL_SIZE}",
    "status": "ok"
}
EOF

log "Photo backup status written to ${BACKUP_DIR}/last_photo_backup.json"
exit 0
