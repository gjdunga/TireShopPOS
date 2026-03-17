#!/usr/bin/env bash
# ============================================================================
# retry-webhooks.sh
# Process pending webhook delivery retries.
#
# Calls POST /api/webhooks/retry using an API key.
# Designed for cron: runs every 5 minutes.
#
# DunganSoft Technologies, March 2026
# ============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

if [ -f "$PROJECT_ROOT/.env" ]; then
    set -a; source "$PROJECT_ROOT/.env"; set +a
fi

API_URL="${APP_URL:-https://localhost}/api/webhooks/retry"
API_KEY="${NOTIFICATION_API_KEY:-}"

if [ -z "$API_KEY" ]; then
    exit 0  # No API key configured, skip silently
fi

RESULT=$(curl -s -X POST "$API_URL" \
    -H "X-API-Key: $API_KEY" \
    -H "Content-Type: application/json" \
    --max-time 30 \
    2>&1)

RETRIED=$(echo "$RESULT" | grep -oP '"retried":\s*\K\d+' 2>/dev/null || echo "0")

if [ "$RETRIED" != "0" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Webhook retries: $RETRIED processed"
fi
