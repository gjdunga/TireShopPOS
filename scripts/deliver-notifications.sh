#!/usr/bin/env bash
# ============================================================================
# deliver-notifications.sh
# Process pending notification queue (email + SMS delivery).
#
# Calls the API endpoint POST /api/notifications/deliver using an API key.
# Designed for cron: runs every 5 minutes (or as configured).
#
# Setup:
#   1. Create an API key in Settings > API Keys
#   2. Set the API_KEY variable below (or in .env)
#   3. Add to crontab:
#      */5 * * * * /home/user/domains/pos.example.com/app/scripts/deliver-notifications.sh
#
# DunganSoft Technologies, March 2026
# ============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Load .env for API_KEY and APP_URL
if [ -f "$PROJECT_ROOT/.env" ]; then
    # shellcheck disable=SC1091
    set -a; source "$PROJECT_ROOT/.env"; set +a
fi

API_URL="${APP_URL:-https://localhost}/api/notifications/deliver"
API_KEY="${NOTIFICATION_API_KEY:-}"

if [ -z "$API_KEY" ]; then
    echo "ERROR: NOTIFICATION_API_KEY not set in .env" >&2
    exit 1
fi

# Process up to 20 pending notifications
RESULT=$(curl -s -X POST "$API_URL" \
    -H "X-API-Key: $API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"limit": 20}' \
    --max-time 30 \
    2>&1)

# Log result
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
SENT=$(echo "$RESULT" | grep -oP '"sent":\s*\K\d+' 2>/dev/null || echo "?")
FAILED=$(echo "$RESULT" | grep -oP '"failed":\s*\K\d+' 2>/dev/null || echo "?")

if [ "$SENT" != "0" ] || [ "$FAILED" != "0" ]; then
    echo "[$TIMESTAMP] Processed: sent=$SENT failed=$FAILED"
fi
