#!/usr/bin/env bash
# ============================================================================
# cron-runner.sh
# Unified cron orchestrator for all TireShopPOS scheduled tasks.
#
# Runs a named job with file locking to prevent overlapping executions.
# All output goes to storage/logs/cron.log.
#
# Usage:
#   ./scripts/cron-runner.sh <job-name>
#
# Jobs:
#   sessions          Clean expired sessions (every 15 min)
#   notifications     Deliver pending notifications (every 5 min)
#   webhooks          Retry failed webhook deliveries (every 5 min)
#   rate-limits       Purge old rate limit entries (hourly)
#   backup-db         Database backup with rotation (daily)
#   backup-photos     Photo rsync to backup location (daily)
#   rotate-logs       Rotate and compress log files (daily)
#   all-frequent      Run sessions + notifications + webhooks
#   all-daily         Run backup-db + backup-photos + rotate-logs + rate-limits
#
# The crontab only needs two entries for simplicity:
#   */5 * * * *  /path/to/scripts/cron-runner.sh all-frequent
#   0   2 * * *  /path/to/scripts/cron-runner.sh all-daily
#
# Or schedule individual jobs for finer control.
#
# DunganSoft Technologies, March 2026
# ============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
LOCK_DIR="/tmp/tireshoppos_cron"
LOG_FILE="$PROJECT_ROOT/storage/logs/cron.log"
JOB="${1:-}"

# Ensure dirs exist
mkdir -p "$LOCK_DIR" "$(dirname "$LOG_FILE")"

# ---- Logging ----
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [$JOB] $*" >> "$LOG_FILE"
}

# ---- File locking ----
acquire_lock() {
    local lockfile="$LOCK_DIR/${1}.lock"
    if [ -f "$lockfile" ]; then
        local pid=$(cat "$lockfile" 2>/dev/null)
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            log "SKIP: already running (pid $pid)"
            return 1
        fi
        # Stale lock
        rm -f "$lockfile"
    fi
    echo $$ > "$lockfile"
    return 0
}

release_lock() {
    rm -f "$LOCK_DIR/${1}.lock"
}

# ---- Job runner ----
run_job() {
    local job_name="$1"
    local script="$2"

    if ! acquire_lock "$job_name"; then
        return 0
    fi

    log "START"
    local start_ms=$(($(date +%s%N)/1000000))

    local output
    output=$("$SCRIPT_DIR/$script" 2>&1) || true

    local end_ms=$(($(date +%s%N)/1000000))
    local duration_ms=$((end_ms - start_ms))

    if [ -n "$output" ]; then
        echo "$output" | while IFS= read -r line; do
            log "  $line"
        done
    fi

    log "DONE (${duration_ms}ms)"
    release_lock "$job_name"
}

# ---- Session cleanup: only every 15 min (skip if last run < 14 min ago) ----
SESSION_INTERVAL=840  # 14 minutes in seconds
should_run_sessions() {
    local marker="$LOCK_DIR/sessions.last"
    if [ ! -f "$marker" ]; then
        touch "$marker"
        return 0
    fi
    local last=$(stat -c %Y "$marker" 2>/dev/null || echo 0)
    local now=$(date +%s)
    if [ $((now - last)) -ge $SESSION_INTERVAL ]; then
        touch "$marker"
        return 0
    fi
    return 1
}

# ---- Dispatch ----
case "${JOB}" in
    sessions)
        run_job sessions cleanup-sessions.sh
        ;;
    notifications)
        run_job notifications deliver-notifications.sh
        ;;
    webhooks)
        run_job webhooks retry-webhooks.sh
        ;;
    rate-limits)
        run_job rate-limits cleanup-rate-limits.sh
        ;;
    backup-db)
        run_job backup-db backup-db.sh
        ;;
    backup-photos)
        run_job backup-photos backup-photos.sh
        ;;
    rotate-logs)
        run_job rotate-logs rotate-logs.sh
        ;;
    all-frequent)
        # Runs every 5 min. Sessions only every 15 min.
        if should_run_sessions; then
            run_job sessions cleanup-sessions.sh
        fi
        run_job notifications deliver-notifications.sh
        run_job webhooks retry-webhooks.sh
        ;;
    all-daily)
        run_job rotate-logs rotate-logs.sh
        run_job rate-limits cleanup-rate-limits.sh
        run_job backup-db backup-db.sh
        run_job backup-photos backup-photos.sh
        ;;
    status)
        echo "TireShopPOS Cron Status"
        echo "======================"
        echo ""
        echo "Lock files:"
        ls -la "$LOCK_DIR"/*.lock 2>/dev/null || echo "  (none active)"
        echo ""
        echo "Last 20 cron log entries:"
        tail -20 "$LOG_FILE" 2>/dev/null || echo "  (no log yet)"
        ;;
    *)
        echo "Usage: $0 <job>"
        echo ""
        echo "Jobs:"
        echo "  sessions          Clean expired sessions"
        echo "  notifications     Deliver pending notifications"
        echo "  webhooks          Retry failed webhook deliveries"
        echo "  rate-limits       Purge old rate limit entries"
        echo "  backup-db         Database backup"
        echo "  backup-photos     Photo backup"
        echo "  rotate-logs       Rotate log files"
        echo "  all-frequent      sessions + notifications + webhooks"
        echo "  all-daily         rotate-logs + rate-limits + backup-db + backup-photos"
        echo "  status            Show lock files and recent log"
        exit 1
        ;;
esac
