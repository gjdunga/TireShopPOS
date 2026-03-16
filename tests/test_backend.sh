#!/usr/bin/env bash
# ============================================================================
# test_backend.sh
# Integration tests for TireShopPOS backend.
# Starts a local MySQL, loads schema, boots PHP built-in server, and
# exercises all major API endpoints via curl.
#
# DunganSoft Technologies, March 2026
# ============================================================================
set -uo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_DB="tire_test_$$"
MYSQL_SOCK="/tmp/mysql_test_$$.sock"
MYSQL_DATA="/tmp/mysql_test_data_$$"
MYSQL_LOG="/tmp/mysql_test_$$.log"
MYSQL_PID=""
PHP_PID=""
API_PORT=18080
API_BASE="http://127.0.0.1:${API_PORT}/api"
PASS=0
FAIL=0
TOTAL=0
FAILURES=""

cleanup() {
    [ -n "$PHP_PID" ] && kill "$PHP_PID" 2>/dev/null
    [ -n "$MYSQL_PID" ] && kill "$MYSQL_PID" 2>/dev/null
    sleep 1
    rm -rf "$MYSQL_DATA" "$MYSQL_SOCK" "$MYSQL_LOG"
}
trap cleanup EXIT

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

assert() {
    local name="$1"
    local expected="$2"
    local actual="$3"
    TOTAL=$((TOTAL + 1))
    # Strip whitespace from both for JSON comparison
    local clean_actual
    clean_actual=$(echo "$actual" | tr -d ' \n\r\t')
    local clean_expected
    clean_expected=$(echo "$expected" | tr -d ' ')
    if echo "$clean_actual" | grep -qF "$clean_expected"; then
        PASS=$((PASS + 1))
        echo -e "  ${GREEN}PASS${NC} $name"
    else
        # Also try plain match for non-JSON strings
        if echo "$actual" | grep -q "$expected"; then
            PASS=$((PASS + 1))
            echo -e "  ${GREEN}PASS${NC} $name"
        else
            FAIL=$((FAIL + 1))
            FAILURES="${FAILURES}\n  ${RED}FAIL${NC} $name (expected: $expected)"
            echo -e "  ${RED}FAIL${NC} $name"
            echo "    Expected to contain: $expected"
            echo "    Got: $(echo "$actual" | head -3)"
        fi
    fi
}

assert_status() {
    local name="$1"
    local expected_code="$2"
    local actual_code="$3"
    local body="$4"
    TOTAL=$((TOTAL + 1))
    if [ "$actual_code" = "$expected_code" ]; then
        PASS=$((PASS + 1))
        echo -e "  ${GREEN}PASS${NC} $name (HTTP $actual_code)"
    else
        FAIL=$((FAIL + 1))
        FAILURES="${FAILURES}\n  ${RED}FAIL${NC} $name (expected HTTP $expected_code, got $actual_code)"
        echo -e "  ${RED}FAIL${NC} $name (expected HTTP $expected_code, got $actual_code)"
        echo "    Body: $(echo "$body" | head -2)"
    fi
}

# ---- Start MySQL ----
echo -e "\n${YELLOW}[1/6] Starting MySQL...${NC}"
rm -rf "$MYSQL_DATA"
mkdir -p "$MYSQL_DATA"
mysqld --initialize-insecure --datadir="$MYSQL_DATA" 2>/dev/null
mysqld --datadir="$MYSQL_DATA" --socket="$MYSQL_SOCK" --port=0 --skip-grant-tables --log-error="$MYSQL_LOG" --pid-file="/tmp/mysql_test_$$.pid" &
MYSQL_PID=$!
# Wait for socket
for i in $(seq 1 15); do
    if mysql -u root -S "$MYSQL_SOCK" -e "SELECT 1" >/dev/null 2>&1; then
        echo "  MySQL ready (PID $MYSQL_PID)"
        break
    fi
    sleep 1
done
if ! mysql -u root -S "$MYSQL_SOCK" -e "SELECT 1" >/dev/null 2>&1; then
    echo -e "${RED}MySQL failed to start. Log:${NC}"
    cat "$MYSQL_LOG" | tail -10
    exit 1
fi

MC="mysql -u root -S $MYSQL_SOCK"

# ---- Load schema ----
echo -e "\n${YELLOW}[2/6] Loading schema...${NC}"
$MC -e "CREATE DATABASE $TEST_DB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
$MC --default-character-set=utf8mb4 "$TEST_DB" < "$PROJECT_ROOT/sql/tire_pos_schema_full.sql" 2>&1
for m in "$PROJECT_ROOT/sql/migrations/"*.sql; do
    $MC --default-character-set=utf8mb4 "$TEST_DB" < "$m" 2>&1
done
TABLE_COUNT=$($MC -N -e "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = '$TEST_DB' AND TABLE_TYPE = 'BASE TABLE';")
echo "  Tables loaded: $TABLE_COUNT"

# Seed minimum data for public endpoints
$MC "$TEST_DB" -e "INSERT IGNORE INTO shop_settings (setting_key, setting_value) VALUES
  ('shop_name', 'Test Tire Shop'), ('shop_phone', '719-555-0000'),
  ('shop_address', '123 Test St'), ('shop_city', 'Florence'),
  ('shop_state', 'CO'), ('shop_zip', '81226'),
  ('tax_rate', '0.029'), ('tire_fee_new', '1.50'),
  ('tire_fee_used', '1.00'), ('disposal_fee', '3.50'),
  ('website_enabled', '1');" 2>/dev/null
$MC "$TEST_DB" -e "INSERT IGNORE INTO website_config (config_key, config_value) VALUES
  ('hero_title', 'Test Shop'), ('hero_subtitle', 'Testing'),
  ('show_inventory', '1'), ('show_appointments', '1'),
  ('enabled', '1');" 2>/dev/null
echo "  Seed data inserted"

# Verify estimated_price column exists
EP_CHECK=$($MC -N -e "SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = '$TEST_DB' AND TABLE_NAME = 'work_orders' AND COLUMN_NAME = 'estimated_price';")
assert "estimated_price column exists in work_orders" "1" "$EP_CHECK"

# ---- Write test .env ----
echo -e "\n${YELLOW}[3/6] Configuring test environment...${NC}"
cat > "$PROJECT_ROOT/.env.test" << EOF
APP_NAME="Test"
APP_DEBUG=true
APP_TIMEZONE=America/Denver
APP_URL=http://127.0.0.1:${API_PORT}
DB_HOST=localhost
DB_PORT=3306
DB_DATABASE=$TEST_DB
DB_USERNAME=root
DB_PASSWORD=
DB_SOCKET=$MYSQL_SOCK
CORS_ORIGIN=*
SESSION_LIFETIME=3600
BACKUP_PATH=/tmp/test_backups
PHOTO_PATH=/tmp/test_photos
EOF

echo "  Test .env written"

# ---- Start PHP built-in server ----
echo -e "\n${YELLOW}[4/6] Starting PHP test server...${NC}"
mkdir -p /tmp/test_backups /tmp/test_photos

# Swap .env for test config
cp "$PROJECT_ROOT/.env" "$PROJECT_ROOT/.env.backup" 2>/dev/null || true
cp "$PROJECT_ROOT/.env.test" "$PROJECT_ROOT/.env"

# Create router script for PHP built-in server
cat > "/tmp/test_router_$$.php" << ROUTEREOF
<?php
\$uri = parse_url(\$_SERVER['REQUEST_URI'], PHP_URL_PATH);
if (preg_match('/\.(css|js|html|png|jpg|gif|svg|ico)$/', \$uri)) {
    return false;
}
require '$PROJECT_ROOT/public/index.php';
ROUTEREOF

# Start PHP server
cd "$PROJECT_ROOT/public"
php -S 127.0.0.1:$API_PORT -t "$PROJECT_ROOT/public" "/tmp/test_router_$$.php" >/tmp/php_test_$$.log 2>&1 &
PHP_PID=$!
sleep 2

if ! kill -0 "$PHP_PID" 2>/dev/null; then
    echo -e "${RED}PHP server failed to start. Log:${NC}"
    cat /tmp/php_test_$$.log | tail -10
    # Restore .env
    mv "$PROJECT_ROOT/.env.backup" "$PROJECT_ROOT/.env" 2>/dev/null || true
    exit 1
fi
echo "  PHP server ready on port $API_PORT (PID $PHP_PID)"

# ---- Run Tests ----
echo -e "\n${YELLOW}[5/6] Running API tests...${NC}"

# Helper: curl with JSON
api() {
    curl -s -w "\n%{http_code}" -H "Content-Type: application/json" -H "Accept: application/json" "$@" 2>/dev/null
}

api_auth() {
    curl -s -w "\n%{http_code}" -H "Content-Type: application/json" -H "Accept: application/json" -H "Authorization: Bearer $TOKEN" "$@" 2>/dev/null
}

extract_code() {
    echo "$1" | tail -1
}

extract_body() {
    echo "$1" | sed '$d'
}

# ================================================================
echo -e "\n  --- Health ---"
RESP=$(api "$API_BASE/health")
CODE=$(extract_code "$RESP")
BODY=$(extract_body "$RESP")
assert_status "GET /api/health returns 200" "200" "$CODE" "$BODY"
assert "Health: status ok" '"status"' "$BODY"
assert "Health: database connected" '"connected":true' "$BODY"
assert "Health: table count 70" '"table_count":70' "$BODY"

# ================================================================
echo -e "\n  --- Auth ---"
RESP=$(api -X POST -d '{"username":"admin","password":"admin"}' "$API_BASE/auth/login")
CODE=$(extract_code "$RESP")
BODY=$(extract_body "$RESP")
assert_status "POST /api/auth/login returns 200" "200" "$CODE" "$BODY"
assert "Login: returns token" '"token"' "$BODY"
assert "Login: returns nested user" '"user":{' "$BODY"
assert "Login: user has permissions array" '"permissions":[' "$BODY"

TOKEN=$(echo "$BODY" | tr -d ' \n\r\t' | grep -o '"token":"[^"]*"' | head -1 | sed 's/"token":"//;s/"//')
if [ -z "$TOKEN" ]; then
    echo -e "  ${RED}TOKEN EXTRACTION FAILED. Login response:${NC}"
    echo "$BODY" | head -5
fi
echo "  Token: ${TOKEN:0:16}..."

# Auth: bad password
RESP=$(api -X POST -d '{"username":"admin","password":"wrong"}' "$API_BASE/auth/login")
CODE=$(extract_code "$RESP")
assert_status "POST /api/auth/login bad password returns 401" "401" "$CODE" "$(extract_body "$RESP")"

# Auth: session check
RESP=$(api_auth "$API_BASE/auth/session")
CODE=$(extract_code "$RESP")
BODY=$(extract_body "$RESP")
assert_status "GET /api/auth/session returns 200" "200" "$CODE" "$BODY"
assert "Session: has user_id" '"user_id"' "$BODY"
assert "Session: has permissions" '"permissions"' "$BODY"

# Auth: no token
RESP=$(api "$API_BASE/auth/session")
CODE=$(extract_code "$RESP")
assert_status "GET /api/auth/session no token returns 401" "401" "$CODE" "$(extract_body "$RESP")"

# ================================================================
echo -e "\n  --- Password Change (must happen before CRUD, force_password_change blocks all business routes) ---"
RESP=$(api_auth -X POST -d '{"current_password":"admin","new_password":"NewP@ss2026!"}' "$API_BASE/auth/password")
CODE=$(extract_code "$RESP")
BODY=$(extract_body "$RESP")
assert_status "POST /api/auth/password returns 200" "200" "$CODE" "$BODY"

# Re-login with new password to get a clean token with force_password_change cleared
RESP=$(api -X POST -d '{"username":"admin","password":"NewP@ss2026!"}' "$API_BASE/auth/login")
CODE=$(extract_code "$RESP")
BODY=$(extract_body "$RESP")
assert_status "Login with new password returns 200" "200" "$CODE" "$BODY"
TOKEN=$(echo "$BODY" | tr -d ' \n\r\t' | grep -o '"token":"[^"]*"' | head -1 | sed 's/"token":"//;s/"//')
echo "  New token: ${TOKEN:0:16}..."

# ================================================================
echo -e "\n  --- Customers ---"
RESP=$(api_auth -X POST -d '{"first_name":"Richard","last_name":"Novoa","phone":"719-555-0100"}' "$API_BASE/customers")
CODE=$(extract_code "$RESP")
BODY=$(extract_body "$RESP")
assert_status "POST /api/customers returns 200" "200" "$CODE" "$BODY"
assert "Customer create: returns customer_id" '"customer_id"' "$BODY"
CUST_ID=$(echo "$BODY" | tr -d ' \n\r\t' | grep -o '"customer_id":[0-9]*' | head -1 | sed 's/"customer_id"://')

RESP=$(api_auth "$API_BASE/customers/$CUST_ID")
CODE=$(extract_code "$RESP")
BODY=$(extract_body "$RESP")
assert_status "GET /api/customers/:id returns 200" "200" "$CODE" "$BODY"
assert "Customer detail: name correct" 'Richard' "$BODY"

RESP=$(api_auth "$API_BASE/customers/search?q=Novoa")
CODE=$(extract_code "$RESP")
BODY=$(extract_body "$RESP")
assert_status "GET /api/customers/search returns 200" "200" "$CODE" "$BODY"
assert "Customer search: finds result" 'Novoa' "$BODY"

# ================================================================
echo -e "\n  --- Vehicles ---"
RESP=$(api_auth -X POST -d "{\"customer_id\":$CUST_ID,\"year\":2020,\"make\":\"Ford\",\"model\":\"F-150\",\"license_plate\":\"ABC123\"}" "$API_BASE/vehicles")
CODE=$(extract_code "$RESP")
BODY=$(extract_body "$RESP")
assert_status "POST /api/vehicles returns 200" "200" "$CODE" "$BODY"
assert "Vehicle create: returns vehicle_id" '"vehicle_id"' "$BODY"
VEH_ID=$(echo "$BODY" | tr -d ' \n\r\t' | grep -o '"vehicle_id":[0-9]*' | head -1 | sed 's/"vehicle_id"://')

RESP=$(api_auth "$API_BASE/vehicles/$VEH_ID")
CODE=$(extract_code "$RESP")
BODY=$(extract_body "$RESP")
assert_status "GET /api/vehicles/:id returns 200" "200" "$CODE" "$BODY"
assert "Vehicle detail: make correct" 'Ford' "$BODY"

# ================================================================
echo -e "\n  --- Tires ---"
RESP=$(api_auth -X POST -d '{"brand_id":1,"full_size_string":"265/70R17","condition":"U","tread_depth_32nds":8,"retail_price":89.99,"status":"available","width_mm":265,"aspect_ratio":70,"wheel_diameter":17}' "$API_BASE/tires")
CODE=$(extract_code "$RESP")
BODY=$(extract_body "$RESP")
assert_status "POST /api/tires returns 200" "200" "$CODE" "$BODY"
assert "Tire create: returns tire_id" '"tire_id"' "$BODY"
TIRE_ID=$(echo "$BODY" | tr -d ' \n\r\t' | grep -o '"tire_id":[0-9]*' | head -1 | sed 's/"tire_id"://')

RESP=$(api_auth "$API_BASE/tires/$TIRE_ID")
CODE=$(extract_code "$RESP")
BODY=$(extract_body "$RESP")
assert_status "GET /api/tires/:id returns 200" "200" "$CODE" "$BODY"
assert "Tire detail: size correct" '265/70R17' "$BODY"

RESP=$(api_auth "$API_BASE/tires/search/advanced?size=265&limit=5")
CODE=$(extract_code "$RESP")
assert_status "GET /api/tires/search/advanced returns 200" "200" "$CODE" "$(extract_body "$RESP")"

# ================================================================
echo -e "\n  --- Work Orders ---"
RESP=$(api_auth -X POST -d "{\"customer_id\":$CUST_ID,\"vehicle_id\":$VEH_ID,\"mileage_in\":45000,\"customer_complaint\":\"Tire rotation needed\",\"estimated_price\":149.99}" "$API_BASE/work-orders")
CODE=$(extract_code "$RESP")
BODY=$(extract_body "$RESP")
assert_status "POST /api/work-orders returns 200" "200" "$CODE" "$BODY"
assert "WO create: returns work_order_id" '"work_order_id"' "$BODY"
WO_ID=$(echo "$BODY" | tr -d ' \n\r\t' | grep -o '"work_order_id":[0-9]*' | head -1 | sed 's/"work_order_id"://')

RESP=$(api_auth "$API_BASE/work-orders/$WO_ID")
CODE=$(extract_code "$RESP")
BODY=$(extract_body "$RESP")
assert_status "GET /api/work-orders/:id returns 200" "200" "$CODE" "$BODY"
assert "WO detail: has customer_complaint" 'Tire rotation needed' "$BODY"
assert "WO detail: has estimated_price" '"estimated_price"' "$BODY"
assert "WO detail: estimated_price value correct" '149.99' "$BODY"

# Update estimated_price
RESP=$(api_auth -X PATCH -d '{"estimated_price":"225.50"}' "$API_BASE/work-orders/$WO_ID")
CODE=$(extract_code "$RESP")
BODY=$(extract_body "$RESP")
assert_status "PATCH /api/work-orders/:id returns 200" "200" "$CODE" "$BODY"
assert "WO update: estimated_price in changed fields" 'estimated_price' "$BODY"

# Verify update
RESP=$(api_auth "$API_BASE/work-orders/$WO_ID")
BODY=$(extract_body "$RESP")
assert "WO detail after update: price is 225.50" '225.50' "$BODY"

RESP=$(api_auth "$API_BASE/work-orders")
CODE=$(extract_code "$RESP")
assert_status "GET /api/work-orders (list) returns 200" "200" "$CODE" "$(extract_body "$RESP")"

# ================================================================
echo -e "\n  --- Appointments ---"
RESP=$(api_auth -X POST -d "{\"customer_id\":$CUST_ID,\"vehicle_id\":$VEH_ID,\"service_type\":\"rotation\",\"appointment_date\":\"2026-03-20\",\"appointment_time\":\"10:00\",\"notes\":\"Rotate and balance\"}" "$API_BASE/appointments")
CODE=$(extract_code "$RESP")
BODY=$(extract_body "$RESP")
assert_status "POST /api/appointments returns 200" "200" "$CODE" "$BODY"
assert "Appointment create: returns appointment_id" '"appointment_id"' "$BODY"

RESP=$(api_auth "$API_BASE/appointments")
CODE=$(extract_code "$RESP")
assert_status "GET /api/appointments (list) returns 200" "200" "$CODE" "$(extract_body "$RESP")"

# ================================================================
echo -e "\n  --- Purchase Orders ---"
# Seed a vendor first
RESP=$(api_auth -X POST -d '{"vendor_name":"ATD","contact_name":"Sales","phone":"800-555-0001"}' "$API_BASE/vendors")
VENDOR_ID=$(echo "$RESP" | tr -d ' \n\r\t' | grep -o '"vendor_id":[0-9]*' | head -1 | sed 's/"vendor_id"://')
[ -z "$VENDOR_ID" ] && VENDOR_ID=1

RESP=$(api_auth -X POST -d "{\"vendor_id\":$VENDOR_ID,\"notes\":\"Test PO\"}" "$API_BASE/purchase-orders")
CODE=$(extract_code "$RESP")
BODY=$(extract_body "$RESP")
assert_status "POST /api/purchase-orders returns 200" "200" "$CODE" "$BODY"
assert "PO create: returns po_id" '"po_id"' "$BODY"

RESP=$(api_auth "$API_BASE/purchase-orders")
CODE=$(extract_code "$RESP")
assert_status "GET /api/purchase-orders (list) returns 200" "200" "$CODE" "$(extract_body "$RESP")"

# ================================================================
echo -e "\n  --- Quotes ---"
# Note: QuoteTool is a client-side calculator. No backend API for quotes.
# Verifying the GET /api/public/inventory endpoint which the quote tool uses.
RESP=$(api "$API_BASE/public/brands")
CODE=$(extract_code "$RESP")
assert_status "GET /api/public/brands (used by quote tool) returns 200" "200" "$CODE" "$(extract_body "$RESP")"

# ================================================================
echo -e "\n  --- Brands / Lookups ---"
RESP=$(api "$API_BASE/public/brands")
CODE=$(extract_code "$RESP")
BODY=$(extract_body "$RESP")
assert_status "GET /api/public/brands returns 200" "200" "$CODE" "$BODY"
assert "Brands: contains Goodyear" 'Goodyear' "$BODY"

# ================================================================
echo -e "\n  --- Settings ---"
RESP=$(api_auth "$API_BASE/settings")
CODE=$(extract_code "$RESP")
assert_status "GET /api/settings returns 200" "200" "$CODE" "$(extract_body "$RESP")"

# ================================================================
echo -e "\n  --- Roles / Users ---"
RESP=$(api_auth "$API_BASE/roles")
CODE=$(extract_code "$RESP")
BODY=$(extract_body "$RESP")
assert_status "GET /api/roles returns 200" "200" "$CODE" "$BODY"
assert "Roles: contains owner" 'owner' "$BODY"

# ================================================================
echo -e "\n  --- Marketplace ---"
RESP=$(api_auth "$API_BASE/integrations")
CODE=$(extract_code "$RESP")
assert_status "GET /api/integrations returns 200" "200" "$CODE" "$(extract_body "$RESP")"

RESP=$(api_auth "$API_BASE/marketplace/listings")
CODE=$(extract_code "$RESP")
assert_status "GET /api/marketplace/listings returns 200" "200" "$CODE" "$(extract_body "$RESP")"

RESP=$(api_auth "$API_BASE/marketplace/orders")
CODE=$(extract_code "$RESP")
assert_status "GET /api/marketplace/orders returns 200" "200" "$CODE" "$(extract_body "$RESP")"

RESP=$(api_auth "$API_BASE/b2b/inventory")
CODE=$(extract_code "$RESP")
assert_status "GET /api/b2b/inventory returns 200" "200" "$CODE" "$(extract_body "$RESP")"

RESP=$(api_auth "$API_BASE/directory-listings")
CODE=$(extract_code "$RESP")
assert_status "GET /api/directory-listings returns 200" "200" "$CODE" "$(extract_body "$RESP")"

# ================================================================
echo -e "\n  --- Warranties ---"
RESP=$(api_auth "$API_BASE/warranty-policies")
CODE=$(extract_code "$RESP")
assert_status "GET /api/warranty-policies returns 200" "200" "$CODE" "$(extract_body "$RESP")"

# ================================================================
echo -e "\n  --- Public Storefront ---"
RESP=$(api "$API_BASE/public/shop-info")
CODE=$(extract_code "$RESP")
assert_status "GET /api/public/shop-info (no auth) returns 200" "200" "$CODE" "$(extract_body "$RESP")"

RESP=$(api "$API_BASE/public/inventory")
CODE=$(extract_code "$RESP")
assert_status "GET /api/public/inventory (no auth) returns 200" "200" "$CODE" "$(extract_body "$RESP")"

RESP=$(api "$API_BASE/public/brands")
CODE=$(extract_code "$RESP")
assert_status "GET /api/public/brands (no auth) returns 200" "200" "$CODE" "$(extract_body "$RESP")"

RESP=$(api "$API_BASE/public/warranty-policies")
CODE=$(extract_code "$RESP")
assert_status "GET /api/public/warranty-policies (no auth) returns 200" "200" "$CODE" "$(extract_body "$RESP")"

# ================================================================
echo -e "\n  --- RBAC enforcement ---"
# Test that protected routes reject unauthenticated requests
RESP=$(api "$API_BASE/tires/search/advanced?limit=1")
CODE=$(extract_code "$RESP")
assert_status "GET /api/tires/search/advanced without auth returns 401" "401" "$CODE" "$(extract_body "$RESP")"

RESP=$(api "$API_BASE/work-orders")
CODE=$(extract_code "$RESP")
assert_status "GET /api/work-orders without auth returns 401" "401" "$CODE" "$(extract_body "$RESP")"

RESP=$(api "$API_BASE/customers/search?q=test")
CODE=$(extract_code "$RESP")
assert_status "GET /api/customers/search without auth returns 401" "401" "$CODE" "$(extract_body "$RESP")"

# ================================================================
echo -e "\n  --- Logout ---"
RESP=$(api_auth -X POST "$API_BASE/auth/logout")
CODE=$(extract_code "$RESP")
assert_status "POST /api/auth/logout returns 200" "200" "$CODE" "$(extract_body "$RESP")"

# Verify token invalidated
RESP=$(api_auth "$API_BASE/auth/session")
CODE=$(extract_code "$RESP")
assert_status "Session after logout returns 401" "401" "$CODE" "$(extract_body "$RESP")"


# ================================================================
# Diagnostics: capture actual error messages from 500 endpoints
# ================================================================
echo -e "\n  --- Diagnostics (500 error details) ---"
for ep in "/api/settings" "/api/warranty-policies" "/api/integrations" "/api/marketplace/listings" "/api/public/shop-info" "/api/public/inventory" "/api/public/warranty-policies"; do
    RESP=$(api_auth "$API_BASE${ep#/api}")
    CODE=$(extract_code "$RESP")
    if [ "$CODE" = "500" ]; then
        BODY=$(extract_body "$RESP")
        MSG=$(echo "$BODY" | tr -d '\n' | grep -o '"message":"[^"]*"' | head -1)
        echo "  $ep => $MSG"
    fi
done

# Try create operations with debug output
echo ""
for desc in "POST /api/tires" "POST /api/vehicles" "POST /api/work-orders"; do
    if [ "$desc" = "POST /api/tires" ]; then
        RESP=$(api_auth -X POST -d '{"brand_id":1,"full_size_string":"265/70R17","condition":"U","tread_depth_32nds":8,"retail_price":89.99,"status":"available","width_mm":265,"aspect_ratio":70,"wheel_diameter":17}' "$API_BASE/tires")
    elif [ "$desc" = "POST /api/vehicles" ]; then
        RESP=$(api_auth -X POST -d '{"customer_id":1,"year":2020,"make":"Ford","model":"F-150","license_plate":"XYZ789"}' "$API_BASE/vehicles")
    elif [ "$desc" = "POST /api/work-orders" ]; then
        RESP=$(api_auth -X POST -d '{"customer_id":1,"customer_complaint":"test","estimated_price":100}' "$API_BASE/work-orders")
    fi
    CODE=$(extract_code "$RESP")
    if [ "$CODE" != "200" ]; then
        BODY=$(extract_body "$RESP")
        MSG=$(echo "$BODY" | tr -d '\n' | grep -o '"message":"[^"]*"' | head -1)
        echo "  $desc => HTTP $CODE: $MSG"
    fi
done

# Also check customer detail route pattern
echo ""
echo "  Customer routes test:"
RESP=$(api_auth "$API_BASE/customers/1")
CODE=$(extract_code "$RESP")
echo "  GET /api/customers/1 => HTTP $CODE"
RESP=$(api_auth "$API_BASE/customers?id=1")
CODE=$(extract_code "$RESP")
echo "  GET /api/customers?id=1 => HTTP $CODE"

# ================================================================
# ================================================================
echo -e "\n${YELLOW}[6/6] Test Results${NC}"
echo "=========================================="
echo -e "  Total:  $TOTAL"
echo -e "  ${GREEN}Passed: $PASS${NC}"
if [ "$FAIL" -gt 0 ]; then
    echo -e "  ${RED}Failed: $FAIL${NC}"
    echo -e "\nFailures:${FAILURES}"
fi
echo "=========================================="

# Restore original .env
mv "$PROJECT_ROOT/.env.backup" "$PROJECT_ROOT/.env" 2>/dev/null || true
rm -f "$PROJECT_ROOT/.env.test" "/tmp/test_router_$$.php" "/tmp/php_test_$$.log"

if [ "$FAIL" -gt 0 ]; then
    exit 1
fi
exit 0
