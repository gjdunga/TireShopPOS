#!/usr/bin/env bash
# ============================================================================
# test_installer.sh
# TireShopPOS: Installer and upgrade system integration tests
#
# Starts temp MySQL, exercises installer via CLI flags and piped stdin,
# verifies schema state between operations. Self-contained, cleans up.
#
# DunganSoft Technologies, March 2026
# ============================================================================
set -uo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INSTALLER="$PROJECT_ROOT/scripts/install.sh"
TEST_DB="tire_inst_test_$$"
MYSQL_SOCK="/tmp/mysql_inst_test_$$.sock"
MYSQL_DATA="/tmp/mysql_inst_test_data_$$"
MYSQL_LOG="/tmp/mysql_inst_test_$$.log"
MYSQL_PID=""
PASS=0; FAIL=0; TOTAL=0; FAILURES=""

cleanup() {
    [ -n "$MYSQL_PID" ] && kill "$MYSQL_PID" 2>/dev/null
    sleep 1
    mv "$PROJECT_ROOT/.env.testbak" "$PROJECT_ROOT/.env" 2>/dev/null || true
    rm -rf "$MYSQL_DATA" "$MYSQL_SOCK" "$MYSQL_LOG" \
           /tmp/inst_test_* \
           "$PROJECT_ROOT/sql/migrations/009_test_migration.sql" \
           "$PROJECT_ROOT/sql/migrations/010_bad_migration.sql"
}
trap cleanup EXIT

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

assert() {
    local name="$1" expected="$2" actual="$3"
    TOTAL=$((TOTAL + 1))
    if echo "$actual" | grep -qF "$expected"; then
        PASS=$((PASS + 1)); echo -e "  ${GREEN}PASS${NC} $name"; return 0
    else
        FAIL=$((FAIL + 1))
        FAILURES="${FAILURES}\n  ${RED}FAIL${NC} $name (expected: $expected)"
        echo -e "  ${RED}FAIL${NC} $name"
        echo "    Expected to contain: $expected"
        echo "    Got: $(echo "$actual" | head -3)"
        return 1
    fi
}

assert_re() {
    local name="$1" pattern="$2" actual="$3"
    TOTAL=$((TOTAL + 1))
    if echo "$actual" | grep -qE "$pattern"; then
        PASS=$((PASS + 1)); echo -e "  ${GREEN}PASS${NC} $name"; return 0
    else
        FAIL=$((FAIL + 1))
        FAILURES="${FAILURES}\n  ${RED}FAIL${NC} $name (pattern: $pattern)"
        echo -e "  ${RED}FAIL${NC} $name"
        echo "    Pattern: $pattern"
        echo "    Got: $(echo "$actual" | head -3)"
        return 1
    fi
}

assert_eq() {
    local name="$1" expected="$2" actual="$3"
    TOTAL=$((TOTAL + 1))
    if [[ "$actual" == "$expected" ]]; then
        PASS=$((PASS + 1)); echo -e "  ${GREEN}PASS${NC} $name"; return 0
    else
        FAIL=$((FAIL + 1))
        FAILURES="${FAILURES}\n  ${RED}FAIL${NC} $name (expected: $expected, got: $actual)"
        echo -e "  ${RED}FAIL${NC} $name  [expected: $expected, got: $actual]"
        return 1
    fi
}

MC=""
mc() { $MC "$TEST_DB" -N -e "$1" 2>/dev/null; }

# Helper: run installer with SKIP_DEP_CHECK and piped input
inst() { SKIP_DEP_CHECK=1 bash "$INSTALLER" "$@" 2>&1; }
inst_pipe() { echo "$1" | SKIP_DEP_CHECK=1 bash "$INSTALLER" 2>&1; }

# ============================================================================
echo -e "\n${YELLOW}[1/5] Starting MySQL...${NC}"
rm -rf "$MYSQL_DATA" "$MYSQL_SOCK"; mkdir -p "$MYSQL_DATA"
mysqld --initialize-insecure --datadir="$MYSQL_DATA" 2>/dev/null
mysqld --datadir="$MYSQL_DATA" --socket="$MYSQL_SOCK" --port=0 \
       --skip-grant-tables --log-error="$MYSQL_LOG" \
       --pid-file="/tmp/inst_test_$$.pid" &
MYSQL_PID=$!
for i in $(seq 1 20); do
    mysql -u root -S "$MYSQL_SOCK" -e "SELECT 1" >/dev/null 2>&1 && break
    sleep 1
done
if ! mysql -u root -S "$MYSQL_SOCK" -e "SELECT 1" >/dev/null 2>&1; then
    echo -e "${RED}MySQL failed to start${NC}"; exit 1
fi
echo "  MySQL ready (PID $MYSQL_PID)"
MC="mysql -u root -S $MYSQL_SOCK"
$MC -e "CREATE DATABASE $TEST_DB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# ============================================================================
echo -e "\n${YELLOW}[2/5] Setting up .env...${NC}"
cp "$PROJECT_ROOT/.env" "$PROJECT_ROOT/.env.testbak" 2>/dev/null || true
cat > "$PROJECT_ROOT/.env" << EOF
DB_HOST=localhost
DB_DATABASE=$TEST_DB
DB_USERNAME=root
DB_PASSWORD=
DB_SOCKET=$MYSQL_SOCK
APP_DEBUG=true
CORS_ORIGIN=*
SESSION_LIFETIME=3600
BACKUP_PATH=/tmp/inst_test_backups_$$
PHOTO_PATH=/tmp/inst_test_photos_$$
EOF
mkdir -p "/tmp/inst_test_backups_$$" "/tmp/inst_test_photos_$$" "$PROJECT_ROOT/storage/backups"
echo "  .env ready ($TEST_DB)"

# ============================================================================
echo -e "\n${YELLOW}[3/5] Running tests...${NC}"

# ---- Dependency checker ----
echo -e "\n${CYAN}  [Dependency Checker]${NC}"

OUTPUT=$(bash "$INSTALLER" --deps 2>&1)
assert "Deps: shows PHP" "PHP" "$OUTPUT"
assert "Deps: checks mysqldump" "mysqldump" "$OUTPUT"
assert "Deps: checks disk" "Disk" "$OUTPUT"
assert "Deps: shows result" "Result:" "$OUTPUT"
# SKIP_DEP_CHECK bypass
OUTPUT=$(SKIP_DEP_CHECK=1 bash "$INSTALLER" --deps 2>&1)
assert "Deps: SKIP_DEP_CHECK works" "skipped" "$OUTPUT"

# ---- Engine detection ----
echo -e "\n${CYAN}  [Engine Detection]${NC}"

OUTPUT=$(inst --status 2>&1)
assert_re "Engine: MySQL or MariaDB" "MySQL|MariaDB" "$OUTPUT"
assert "Engine: version number" "8.0" "$OUTPUT"

# ---- Fresh install ----
echo -e "\n${CYAN}  [Fresh Install]${NC}"

TC_BEFORE=$(mc "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='$TEST_DB' AND TABLE_TYPE='BASE TABLE';")
assert_eq "Pre-install: 0 tables" "0" "$TC_BEFORE"

OUTPUT=$(inst_pipe "1")
assert "Install: starts" "fresh install" "$OUTPUT"
assert "Install: base schema" "Base schema" "$OUTPUT"
assert "Install: version tracking" "version tracking" "$OUTPUT"
assert "Install: applies 001" "001_sessions" "$OUTPUT"
assert "Install: applies 007" "007_estimated" "$OUTPUT"
assert "Install: completes" "install complete" "$OUTPUT"

TC_AFTER=$(mc "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='$TEST_DB' AND TABLE_TYPE='BASE TABLE';")
assert_eq "Post-install: 66 tables" "66" "$TC_AFTER"

VC_AFTER=$(mc "SELECT COUNT(*) FROM information_schema.VIEWS WHERE TABLE_SCHEMA='$TEST_DB';")
assert_eq "Post-install: 9 views" "9" "$VC_AFTER"

# ---- Version tracking ----
echo -e "\n${CYAN}  [Version Tracking]${NC}"

SV_CT=$(mc "SELECT COUNT(*) FROM schema_version;")
assert_eq "schema_version: 1 row" "1" "$SV_CT"

SV_APP=$(mc "SELECT app_version FROM schema_version WHERE id=1;")
assert_eq "schema_version: app_version" "1.0.1" "$SV_APP"

SV_ENG=$(mc "SELECT db_engine FROM schema_version WHERE id=1;")
assert "schema_version: engine" "MySQL" "$SV_ENG"

SV_ENGV=$(mc "SELECT db_engine_version FROM schema_version WHERE id=1;")
assert "schema_version: engine version" "8.0" "$SV_ENGV"

SV_INST=$(mc "SELECT installed_at FROM schema_version WHERE id=1;")
TOTAL=$((TOTAL + 1))
if [[ -n "$SV_INST" && "$SV_INST" != "NULL" ]]; then
    PASS=$((PASS + 1)); echo -e "  ${GREEN}PASS${NC} schema_version: installed_at set"
else
    FAIL=$((FAIL + 1)); echo -e "  ${RED}FAIL${NC} schema_version: installed_at empty"
    FAILURES="${FAILURES}\n  ${RED}FAIL${NC} installed_at empty"
fi

SV_TOT=$(mc "SELECT total_migrations FROM schema_version WHERE id=1;")
assert_eq "schema_version: total_migrations" "10" "$SV_TOT"

SV_USR=$(mc "SELECT installer_user FROM schema_version WHERE id=1;")
TOTAL=$((TOTAL + 1))
if [[ -n "$SV_USR" && "$SV_USR" != "NULL" ]]; then
    PASS=$((PASS + 1)); echo -e "  ${GREEN}PASS${NC} schema_version: installer_user ($SV_USR)"
else
    FAIL=$((FAIL + 1)); echo -e "  ${RED}FAIL${NC} schema_version: installer_user empty"
    FAILURES="${FAILURES}\n  ${RED}FAIL${NC} installer_user empty"
fi

SM_CT=$(mc "SELECT COUNT(*) FROM schema_migrations;")
assert_eq "schema_migrations: 10 rows" "10" "$SM_CT"

SM_OK=$(mc "SELECT COUNT(*) FROM schema_migrations WHERE success=1;")
assert_eq "schema_migrations: all successful" "10" "$SM_OK"

SM_FAIL=$(mc "SELECT COUNT(*) FROM schema_migrations WHERE success=0;")
assert_eq "schema_migrations: 0 failures" "0" "$SM_FAIL"

SM_NULLCK=$(mc "SELECT COUNT(*) FROM schema_migrations WHERE checksum IS NULL OR checksum='';")
assert_eq "schema_migrations: all have checksums" "0" "$SM_NULLCK"

SM_008=$(mc "SELECT COUNT(*) FROM schema_migrations WHERE filename='008_schema_version.sql' AND success=1;")
assert_eq "schema_migrations: 008 tracked" "1" "$SM_008"

SM_DUR=$(mc "SELECT COUNT(*) FROM schema_migrations WHERE duration_ms IS NOT NULL AND duration_ms > 0;")
TOTAL=$((TOTAL + 1))
if [[ "$SM_DUR" -ge 1 ]]; then
    PASS=$((PASS + 1)); echo -e "  ${GREEN}PASS${NC} schema_migrations: has duration_ms ($SM_DUR rows)"
else
    FAIL=$((FAIL + 1)); echo -e "  ${RED}FAIL${NC} schema_migrations: no duration_ms"
    FAILURES="${FAILURES}\n  ${RED}FAIL${NC} no duration_ms"
fi

# ---- Idempotent upgrade ----
echo -e "\n${CYAN}  [Idempotent Upgrade]${NC}"

OUTPUT=$(inst --upgrade)
assert "Upgrade no-op: nothing to do" "already applied" "$OUTPUT"

TC_SAME=$(mc "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='$TEST_DB' AND TABLE_TYPE='BASE TABLE';")
assert_eq "Upgrade no-op: 66 tables" "66" "$TC_SAME"

SM_SAME=$(mc "SELECT COUNT(*) FROM schema_migrations WHERE success=1 AND skipped=0;")
assert_eq "Upgrade no-op: 10 migrations" "10" "$SM_SAME"

# ---- Incremental upgrade ----
echo -e "\n${CYAN}  [Incremental Upgrade]${NC}"

cat > "$PROJECT_ROOT/sql/migrations/009_test_migration.sql" << 'MSQL'
CREATE TABLE IF NOT EXISTS _test_upgrade_marker (
    id INT PRIMARY KEY DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO _test_upgrade_marker (id) VALUES (1);
MSQL

OUTPUT=$(inst --upgrade)
assert "Incremental: applies 009" "009_test_migration" "$OUTPUT"
assert "Incremental: OK" "OK" "$OUTPUT"

MK=$(mc "SELECT COUNT(*) FROM _test_upgrade_marker;")
assert_eq "Incremental: marker table" "1" "$MK"

SM_009=$(mc "SELECT COUNT(*) FROM schema_migrations WHERE filename='009_test_migration.sql' AND success=1;")
assert_eq "Incremental: tracked" "1" "$SM_009"

SM_NOW=$(mc "SELECT COUNT(*) FROM schema_migrations WHERE success=1;")
assert_eq "Incremental: 11 total" "11" "$SM_NOW"

OUTPUT=$(inst --upgrade)
assert "Incremental re-run: no-op" "already applied" "$OUTPUT"

# ---- Checksum change detection ----
echo -e "\n${CYAN}  [Checksum Detection]${NC}"

ORIG_CK=$(mc "SELECT checksum FROM schema_migrations WHERE filename='009_test_migration.sql';")
echo "-- modified" >> "$PROJECT_ROOT/sql/migrations/009_test_migration.sql"
OUTPUT=$(inst --upgrade)
assert_re "Checksum: detects change" "CHANGED|changed|WARN" "$OUTPUT"

# ---- Failed migration ----
echo -e "\n${CYAN}  [Failed Migration]${NC}"

cat > "$PROJECT_ROOT/sql/migrations/010_bad_migration.sql" << 'MSQL'
ALTER TABLE this_table_does_not_exist ADD COLUMN oops INT;
MSQL

OUTPUT=$(inst --upgrade)
assert "Bad migration: FAIL" "FAIL" "$OUTPUT"

SM_010=$(mc "SELECT success FROM schema_migrations WHERE filename='010_bad_migration.sql';")
assert_eq "Bad migration: success=0" "0" "$SM_010"

SM_010_ERR=$(mc "SELECT CASE WHEN error_message IS NOT NULL AND error_message != '' THEN 'has_error' ELSE 'no_error' END FROM schema_migrations WHERE filename='010_bad_migration.sql';")
assert_eq "Bad migration: error recorded" "has_error" "$SM_010_ERR"

rm -f "$PROJECT_ROOT/sql/migrations/009_test_migration.sql" "$PROJECT_ROOT/sql/migrations/010_bad_migration.sql"

# ---- Status display ----
echo -e "\n${CYAN}  [Status Display]${NC}"

OUTPUT=$(inst --status)
assert "Status: database name" "$TEST_DB" "$OUTPUT"
assert_re "Status: engine" "MySQL|MariaDB" "$OUTPUT"
assert "Status: app version" "1.0.1" "$OUTPUT"
assert "Status: migration history" "001_sessions" "$OUTPUT"

# ---- GitHub check ----
echo -e "\n${CYAN}  [GitHub Check]${NC}"

OUTPUT=$(inst --check)
TOTAL=$((TOTAL + 1))
if echo "$OUTPUT" | grep -qE "up to date|new migration|Could not reach"; then
    PASS=$((PASS + 1)); echo -e "  ${GREEN}PASS${NC} GitHub check: ran without crash"
else
    FAIL=$((FAIL + 1)); echo -e "  ${RED}FAIL${NC} GitHub check: unexpected output"
    FAILURES="${FAILURES}\n  ${RED}FAIL${NC} GitHub check"
fi

# ---- Wipe and reinstall ----
echo -e "\n${CYAN}  [Wipe and Reinstall]${NC}"

# Clean migration tracking of test artifacts before wipe
mc "DELETE FROM schema_migrations WHERE filename LIKE '009_%' OR filename LIKE '010_%';" 2>/dev/null
mc "DROP TABLE IF EXISTS _test_upgrade_marker;" 2>/dev/null

OUTPUT=$(printf "4\nWIPE\n" | SKIP_DEP_CHECK=1 bash "$INSTALLER" 2>&1)
# Strip ANSI codes for reliable matching
CLEAN=$(echo "$OUTPUT" | sed 's/\x1b\[[0-9;]*m//g')
assert "Wipe: backup" "acking up" "$CLEAN"
assert "Wipe: wiped" "wiped" "$CLEAN"
assert "Wipe: reinstall" "install complete" "$CLEAN"

BK=$(ls -t "$PROJECT_ROOT/storage/backups/"*.sql.gz 2>/dev/null | head -1)
TOTAL=$((TOTAL + 1))
if [[ -n "$BK" && -f "$BK" ]]; then
    PASS=$((PASS + 1)); echo -e "  ${GREEN}PASS${NC} Wipe: backup file exists ($(du -h "$BK" | cut -f1))"
else
    FAIL=$((FAIL + 1)); echo -e "  ${RED}FAIL${NC} Wipe: no backup file"
    FAILURES="${FAILURES}\n  ${RED}FAIL${NC} no backup"
fi

TC_RESTORED=$(mc "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='$TEST_DB' AND TABLE_TYPE='BASE TABLE';")
assert_eq "Wipe: 66 tables restored" "66" "$TC_RESTORED"

SV_RESTORED=$(mc "SELECT total_migrations FROM schema_version WHERE id=1;")
assert_eq "Wipe: migrations re-tracked" "10" "$SV_RESTORED"

# ---- .env parsing ----
echo -e "\n${CYAN}  [.env Parsing]${NC}"

OUTPUT=$(inst --status)
assert ".env: reads DB_DATABASE" "$TEST_DB" "$OUTPUT"

mv "$PROJECT_ROOT/.env" "$PROJECT_ROOT/.env.tmp_hide"
OUTPUT=$(bash "$INSTALLER" --status 2>&1)
assert "Missing .env: error" "No .env" "$OUTPUT"
mv "$PROJECT_ROOT/.env.tmp_hide" "$PROJECT_ROOT/.env"

# ============================================================================
echo -e "\n${YELLOW}[4/5] Cleanup...${NC}"
# Test artifacts already cleaned before wipe test

# ============================================================================
echo -e "\n${YELLOW}[5/5] Results${NC}"
echo "=========================================="
echo -e "  Total:  $TOTAL"
echo -e "  ${GREEN}Passed: $PASS${NC}"
if [ "$FAIL" -gt 0 ]; then
    echo -e "  ${RED}Failed: $FAIL${NC}"
    echo -e "\nFailures:${FAILURES}"
else
    echo -e "\n  ${GREEN}ALL TESTS PASSED${NC}"
fi
echo "=========================================="

[ "$FAIL" -gt 0 ] && exit 1
exit 0
