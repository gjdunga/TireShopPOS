#!/usr/bin/env bash
# ============================================================================
# rotate-logs.sh
# Rotate application log files.
#
# Rotates storage/logs/app.log and storage/logs/php_error.log.
# Keeps RETENTION_DAYS days of compressed archives (default 30).
# Designed for cron: runs daily at midnight.
#
# DunganSoft Technologies, March 2026
# ============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
LOG_DIR="$PROJECT_ROOT/storage/logs"
RETENTION_DAYS="${LOG_RETENTION_DAYS:-30}"
DATE_SUFFIX=$(date '+%Y-%m-%d')

rotate_file() {
    local src="$1"
    local base=$(basename "$src")

    if [ ! -f "$src" ]; then
        return 0
    fi

    # Skip if empty
    local size=$(stat -c%s "$src" 2>/dev/null || echo 0)
    if [ "$size" -eq 0 ]; then
        return 0
    fi

    # Rotate: compress current log, start fresh
    local archive="${LOG_DIR}/${base}.${DATE_SUFFIX}.gz"
    gzip -c "$src" > "$archive"
    : > "$src"  # Truncate in place (preserves file handle for running processes)

    echo "  Rotated $base ($size bytes) -> ${base}.${DATE_SUFFIX}.gz"
}

# Rotate
rotate_file "$LOG_DIR/app.log"
rotate_file "$LOG_DIR/php_error.log"

# Purge old archives
PURGED=0
find "$LOG_DIR" -name "*.gz" -mtime "+${RETENTION_DAYS}" -print -delete 2>/dev/null | while read -r f; do
    PURGED=$((PURGED + 1))
done

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Log rotation complete. Retention: ${RETENTION_DAYS} days."
