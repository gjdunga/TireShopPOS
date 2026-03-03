#!/usr/bin/env bash
# ============================================================================
# cleanup-sessions.sh
# Remove expired sessions from the database.
#
# Runs a single DELETE query against the sessions table.
# Lightweight enough to run every 15 minutes via cron.
#
# DunganSoft Technologies, March 2026
# ============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

ENV_FILE="${PROJECT_ROOT}/.env"
if [[ ! -f "$ENV_FILE" ]]; then
    echo "[FATAL] .env not found" >&2
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

DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-3306}"
DB_DATABASE="${DB_DATABASE:-tire_shop}"
DB_USERNAME="${DB_USERNAME:-root}"
DB_PASSWORD="${DB_PASSWORD:-}"

AUTH_ARGS=( -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USERNAME" )
if [[ -n "$DB_PASSWORD" ]]; then
    AUTH_ARGS+=( -p"$DB_PASSWORD" )
fi

DELETED=$(mysql "${AUTH_ARGS[@]}" "$DB_DATABASE" -N -e \
    "DELETE FROM sessions WHERE expires_at <= NOW(); SELECT ROW_COUNT();" 2>/dev/null)

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Cleaned ${DELETED} expired session(s)"
