#!/usr/bin/env bash
# ============================================================================
# test_backend.sh (v2, clean rewrite)
# TireShopPOS: Comprehensive backend integration + validation test suite
#
# Coverage: infrastructure, auth lifecycle, RBAC, input validation (missing
# fields, bad types, SQL injection, XSS, boundary values, invalid ENUMs,
# referential integrity), CRUD lifecycle, estimated_price, marketplace,
# public storefront, lookups, logout/token invalidation.
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
TOKEN=""
PASS=0; FAIL=0; TOTAL=0; FAILURES=""

cleanup() {
    [ -n "$PHP_PID" ] && kill "$PHP_PID" 2>/dev/null
    [ -n "$MYSQL_PID" ] && kill "$MYSQL_PID" 2>/dev/null
    sleep 1
    mv "$PROJECT_ROOT/.env.backup" "$PROJECT_ROOT/.env" 2>/dev/null || true
    rm -rf "$MYSQL_DATA" "$MYSQL_SOCK" "$MYSQL_LOG" \
           "$PROJECT_ROOT/.env.test" "/tmp/test_router_$$.php" "/tmp/php_test_$$.log" \
           "/tmp/test_backups_$$" "/tmp/test_photos_$$"
}
trap cleanup EXIT

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

assert() {
    local name="$1" expected="$2" actual="$3"
    TOTAL=$((TOTAL + 1))
    local clean; clean=$(echo "$actual" | tr -d ' \n\r\t')
    if echo "$clean" | grep -qF "$expected" || echo "$actual" | grep -qF "$expected"; then
        PASS=$((PASS + 1)); echo -e "  ${GREEN}PASS${NC} $name"; return 0
    else
        FAIL=$((FAIL + 1))
        FAILURES="${FAILURES}\n  ${RED}FAIL${NC} $name (expected: $expected)"
        echo -e "  ${RED}FAIL${NC} $name"
        echo "    Expected: $expected"
        echo "    Got: $(echo "$actual" | head -3)"
        return 1
    fi
}

assert_status() {
    local name="$1" expected="$2" actual_code="$3" body="$4"
    TOTAL=$((TOTAL + 1))
    if [ "$actual_code" = "$expected" ]; then
        PASS=$((PASS + 1)); echo -e "  ${GREEN}PASS${NC} $name (HTTP $actual_code)"; return 0
    else
        FAIL=$((FAIL + 1))
        local msg; msg=$(echo "$body" | tr -d '\n' | grep -o '"message": *"[^"]*"' | head -1)
        FAILURES="${FAILURES}\n  ${RED}FAIL${NC} $name (expected $expected, got $actual_code) $msg"
        echo -e "  ${RED}FAIL${NC} $name (expected HTTP $expected, got $actual_code)"
        [ -n "$msg" ] && echo "    $msg"
        return 1
    fi
}

# Match any of several expected status codes
assert_status_any() {
    local name="$1"; shift
    local actual_code="${!#}"; # last arg
    local body_arg="${@: -2:1}" # second to last
    local match=0
    for exp in "$@"; do
        [ "$exp" = "$actual_code" ] && match=1 && break
        [ "$exp" = "$body_arg" ] && continue
    done
    TOTAL=$((TOTAL + 1))
    if [ "$match" = "1" ]; then
        PASS=$((PASS + 1)); echo -e "  ${GREEN}PASS${NC} $name (HTTP $actual_code)"; return 0
    else
        FAIL=$((FAIL + 1))
        FAILURES="${FAILURES}\n  ${RED}FAIL${NC} $name (got $actual_code, expected one of: $*)"
        echo -e "  ${RED}FAIL${NC} $name (HTTP $actual_code)"
        return 1
    fi
}

api()      { curl -s -w "\n%{http_code}" -H "Content-Type: application/json" -H "Accept: application/json" "$@" 2>/dev/null; }
api_auth() { curl -s -w "\n%{http_code}" -H "Content-Type: application/json" -H "Accept: application/json" -H "Authorization: Bearer $TOKEN" "$@" 2>/dev/null; }
code()     { echo "$1" | tail -1; }
body()     { echo "$1" | sed '$d'; }
jval()     { echo "$1" | tr -d ' \n\r\t' | grep -o "\"$2\":[^,}]*" | head -1 | sed "s/\"$2\"://;s/\"//g"; }

# ============================================================================
echo -e "\n${YELLOW}[1/5] Starting MySQL...${NC}"
rm -rf "$MYSQL_DATA" "$MYSQL_SOCK"; mkdir -p "$MYSQL_DATA"
mysqld --initialize-insecure --datadir="$MYSQL_DATA" 2>/dev/null
mysqld --datadir="$MYSQL_DATA" --socket="$MYSQL_SOCK" --port=0 --skip-grant-tables --log-error="$MYSQL_LOG" --pid-file="/tmp/mysql_test_$$.pid" &
MYSQL_PID=$!
for i in $(seq 1 20); do mysql -u root -S "$MYSQL_SOCK" -e "SELECT 1" >/dev/null 2>&1 && break; sleep 1; done
if ! mysql -u root -S "$MYSQL_SOCK" -e "SELECT 1" >/dev/null 2>&1; then
    echo -e "${RED}MySQL failed to start${NC}"; cat "$MYSQL_LOG" | tail -5; exit 1
fi
echo "  MySQL ready (PID $MYSQL_PID)"
MC="mysql -u root -S $MYSQL_SOCK"

# ============================================================================
echo -e "\n${YELLOW}[2/5] Loading schema...${NC}"
$MC -e "CREATE DATABASE $TEST_DB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
$MC $TEST_DB < "$PROJECT_ROOT/sql/tire_pos_schema_full.sql" 2>&1 | grep -iv "^$\|torque\|^-" || true
for m in "$PROJECT_ROOT/sql/migrations/"*.sql; do $MC $TEST_DB < "$m" 2>&1 | grep -i "^ERROR" || true; done
$MC $TEST_DB -e "UPDATE shop_settings SET setting_value='1' WHERE setting_key='website_enabled';" 2>/dev/null

TABLE_COUNT=$($MC -N -e "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='$TEST_DB' AND TABLE_TYPE='BASE TABLE';")
echo "  Tables: $TABLE_COUNT"

assert "Schema: 67 tables" "67" "$TABLE_COUNT"
assert "Schema: estimated_price exists" "1" "$($MC -N -e "SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='$TEST_DB' AND TABLE_NAME='work_orders' AND COLUMN_NAME='estimated_price';")"
assert "Schema: full_size_string exists" "1" "$($MC -N -e "SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='$TEST_DB' AND TABLE_NAME='tires' AND COLUMN_NAME='full_size_string';")"
assert "Schema: 9 views" "9" "$($MC -N -e "SELECT COUNT(*) FROM information_schema.VIEWS WHERE TABLE_SCHEMA='$TEST_DB';")"
assert "Schema: brands seeded" "53" "$($MC -N -e "SELECT COUNT(*) FROM $TEST_DB.lkp_brands;")"

# ============================================================================
echo -e "\n${YELLOW}[3/5] Starting PHP server...${NC}"
cp "$PROJECT_ROOT/.env" "$PROJECT_ROOT/.env.backup" 2>/dev/null || true
cat > "$PROJECT_ROOT/.env" << EOF
APP_DEBUG=true
DB_HOST=localhost
DB_DATABASE=$TEST_DB
DB_USERNAME=root
DB_PASSWORD=
DB_SOCKET=$MYSQL_SOCK
CORS_ORIGIN=*
SESSION_LIFETIME=3600
BACKUP_PATH=/tmp/test_backups_$$
PHOTO_PATH=/tmp/test_photos_$$
EOF
cat > "/tmp/test_router_$$.php" << REOF
<?php
\$u = parse_url(\$_SERVER['REQUEST_URI'], PHP_URL_PATH);
if (preg_match('/\.(css|js|html)$/', \$u)) return false;
require '$PROJECT_ROOT/public/index.php';
REOF
mkdir -p "/tmp/test_backups_$$" "/tmp/test_photos_$$" "$PROJECT_ROOT/storage/logs"
php -S 127.0.0.1:$API_PORT -t "$PROJECT_ROOT/public" "/tmp/test_router_$$.php" >"/tmp/php_test_$$.log" 2>&1 &
PHP_PID=$!; sleep 2
if ! kill -0 "$PHP_PID" 2>/dev/null; then
    echo -e "${RED}PHP server failed${NC}"; cat "/tmp/php_test_$$.log" | tail -10; exit 1
fi
echo "  PHP server ready (port $API_PORT)"

# ============================================================================
echo -e "\n${YELLOW}[4/5] Running tests...${NC}"

# ---- HEALTH ----
echo -e "\n${CYAN}  [Health]${NC}"
R=$(api "$API_BASE/health"); C=$(code "$R"); B=$(body "$R")
assert_status "GET /health" "200" "$C" "$B"
assert "Health: connected" '"connected":true' "$B"
assert "Health: 67 tables" '"table_count":67' "$B"
assert "Health: PHP version" '"php_version"' "$B"

# ---- AUTH: LOGIN ----
echo -e "\n${CYAN}  [Auth: Login]${NC}"
R=$(api -X POST -d '{"username":"admin","password":"admin"}' "$API_BASE/auth/login"); C=$(code "$R"); B=$(body "$R")
assert_status "Login valid" "200" "$C" "$B"
assert "Login: token" '"token"' "$B"
assert "Login: nested user" '"user":{' "$B"
assert "Login: permissions" '"permissions":[' "$B"
assert "Login: force_password_change" '"force_password_change":true' "$B"
TOKEN=$(jval "$B" token)
echo "  Token: ${TOKEN:0:16}..."

# ---- AUTH: BAD CREDS ----
echo -e "\n${CYAN}  [Auth: Invalid credentials]${NC}"
R=$(api -X POST -d '{"username":"admin","password":"wrong"}' "$API_BASE/auth/login"); C=$(code "$R")
assert_status "Bad password => 401" "401" "$C" "$(body "$R")"
R=$(api -X POST -d '{"username":"ghost","password":"x"}' "$API_BASE/auth/login"); C=$(code "$R")
assert_status "Bad username => 401" "401" "$C" "$(body "$R")"
R=$(api -X POST -d '{}' "$API_BASE/auth/login"); C=$(code "$R")
assert_status "Empty body => 400" "400" "$C" "$(body "$R")"
R=$(api -X POST -d '{"username":"","password":""}' "$API_BASE/auth/login"); C=$(code "$R")
assert_status "Empty strings => 400" "400" "$C" "$(body "$R")"

# ---- AUTH: SESSION ----
echo -e "\n${CYAN}  [Auth: Session]${NC}"
R=$(api_auth "$API_BASE/auth/session"); C=$(code "$R"); B=$(body "$R")
assert_status "Session valid" "200" "$C" "$B"
assert "Session: user_id" '"user_id"' "$B"
assert "Session: permissions" '"permissions"' "$B"
R=$(api "$API_BASE/auth/session"); C=$(code "$R")
assert_status "Session no token => 401" "401" "$C" "$(body "$R")"
R=$(api -H "Authorization: Bearer fake_token_12345" "$API_BASE/auth/session"); C=$(code "$R")
assert_status "Session bad token => 401" "401" "$C" "$(body "$R")"

# ---- AUTH: PASSWORD CHANGE ----
echo -e "\n${CYAN}  [Auth: Password change + validation]${NC}"
R=$(api_auth -X POST -d '{"current_password":"admin","new_password":"NewPass2026!"}' "$API_BASE/auth/password"); C=$(code "$R")
assert_status "Password change" "200" "$C" "$(body "$R")"
R=$(api -X POST -d '{"username":"admin","password":"NewPass2026!"}' "$API_BASE/auth/login"); C=$(code "$R"); B=$(body "$R")
assert_status "Login new password" "200" "$C" "$B"
TOKEN=$(jval "$B" token)
R=$(api -X POST -d '{"username":"admin","password":"admin"}' "$API_BASE/auth/login"); C=$(code "$R")
assert_status "Old password rejected => 401" "401" "$C" "$(body "$R")"

# Password validation
R=$(api_auth -X POST -d '{"current_password":"NewPass2026!","new_password":"short"}' "$API_BASE/auth/password"); C=$(code "$R")
assert_status "Short password => 400" "400" "$C" "$(body "$R")"
R=$(api_auth -X POST -d '{"current_password":"wrong","new_password":"GoodPass2026!"}' "$API_BASE/auth/password"); C=$(code "$R")
# Could be 400 or 401 depending on implementation
TOTAL=$((TOTAL + 1))
if [ "$C" = "400" ] || [ "$C" = "401" ] || [ "$C" = "403" ]; then
    PASS=$((PASS + 1)); echo -e "  ${GREEN}PASS${NC} Wrong current password => $C"
else
    FAIL=$((FAIL + 1)); echo -e "  ${RED}FAIL${NC} Wrong current password => $C (expected 400 or 401)"
    FAILURES="${FAILURES}\n  ${RED}FAIL${NC} Wrong current password => $C"
fi
R=$(api_auth -X POST -d '{}' "$API_BASE/auth/password"); C=$(code "$R")
assert_status "Empty password body => 400" "400" "$C" "$(body "$R")"

# ---- RBAC ----
echo -e "\n${CYAN}  [RBAC: Protected routes]${NC}"
for ep in "/work-orders" "/customers/search?q=x" "/tires/search/advanced?limit=1" \
          "/appointments" "/purchase-orders" "/settings" "/roles" "/warranty-policies"; do
    R=$(api "$API_BASE$ep"); C=$(code "$R")
    assert_status "GET $ep no auth => 401" "401" "$C" "$(body "$R")"
done

echo -e "\n${CYAN}  [RBAC: Public routes]${NC}"
for ep in "/public/shop-info" "/public/brands" "/public/warranty-policies" "/public/website-config"; do
    R=$(api "$API_BASE$ep"); C=$(code "$R")
    assert_status "GET $ep no auth => 200" "200" "$C" "$(body "$R")"
done

# ---- CUSTOMERS ----
echo -e "\n${CYAN}  [Customers: CRUD + validation]${NC}"
R=$(api_auth -X POST -d '{"first_name":"Richard","last_name":"Novoa","phone":"719-555-0100"}' "$API_BASE/customers"); C=$(code "$R"); B=$(body "$R")
assert_status "Customer create" "200" "$C" "$B"
CUST_ID=$(jval "$B" customer_id)

R=$(api_auth "$API_BASE/customers/$CUST_ID"); C=$(code "$R"); B=$(body "$R")
assert_status "Customer detail" "200" "$C" "$B"
assert "Customer name" 'Richard' "$B"

R=$(api_auth "$API_BASE/customers/search?q=Novoa"); C=$(code "$R"); B=$(body "$R")
assert_status "Customer search" "200" "$C" "$B"
assert "Customer found" 'Novoa' "$B"

R=$(api_auth -X PATCH -d '{"email":"rich@test.com"}' "$API_BASE/customers/$CUST_ID"); C=$(code "$R")
assert_status "Customer update" "200" "$C" "$(body "$R")"

# Validation
R=$(api_auth -X POST -d '{"first_name":""}' "$API_BASE/customers"); C=$(code "$R")
assert_status "Customer empty name => error" "500" "$C" "$(body "$R")"
R=$(api_auth -X POST -d '{}' "$API_BASE/customers"); C=$(code "$R")
assert_status "Customer empty body => error" "500" "$C" "$(body "$R")"
R=$(api_auth "$API_BASE/customers/99999"); C=$(code "$R")
assert_status "Customer 99999 => 404" "404" "$C" "$(body "$R")"

# SQL injection
R=$(api_auth "$API_BASE/customers/search?q=%27%3BDROP%20TABLE%20customers%3B--"); C=$(code "$R")
assert_status "SQLi customer search => safe" "200" "$C" "$(body "$R")"
R=$(api_auth -X POST -d '{"first_name":"Robert\"); DROP TABLE customers;--","last_name":"Tables","phone":"555"}' "$API_BASE/customers"); C=$(code "$R")
assert_status "SQLi in name => safe create" "200" "$C" "$(body "$R")"
R=$(api_auth "$API_BASE/customers/search?q=Tables"); C=$(code "$R")
assert "Table survived injection" 'Tables' "$(body "$R")"

# XSS
R=$(api_auth -X POST -d '{"first_name":"<script>alert(1)</script>","last_name":"XSS","phone":"555"}' "$API_BASE/customers"); C=$(code "$R")
assert_status "XSS in name => stores safely" "200" "$C" "$(body "$R")"

# ---- VEHICLES ----
echo -e "\n${CYAN}  [Vehicles: CRUD + validation]${NC}"
R=$(api_auth -X POST -d "{\"customer_id\":$CUST_ID,\"year\":2020,\"make\":\"Ford\",\"model\":\"F-150\",\"license_plate\":\"CO-TEST1\"}" "$API_BASE/vehicles"); C=$(code "$R"); B=$(body "$R")
assert_status "Vehicle create" "200" "$C" "$B"
VEH_ID=$(jval "$B" vehicle_id)

R=$(api_auth "$API_BASE/vehicles/$VEH_ID"); C=$(code "$R"); B=$(body "$R")
assert_status "Vehicle detail" "200" "$C" "$B"
assert "Vehicle make" 'Ford' "$B"

R=$(api_auth -X POST -d '{"customer_id":1}' "$API_BASE/vehicles"); C=$(code "$R")
assert_status "Vehicle missing fields => error" "500" "$C" "$(body "$R")"
# customer_id is not a column on vehicles (linked via customer_vehicles join table)
# So passing a bad customer_id is simply ignored, not an FK violation
R=$(api_auth -X POST -d '{"customer_id":99999,"year":2020,"make":"X","model":"Y"}' "$API_BASE/vehicles"); C=$(code "$R")
assert_status "Vehicle extra customer_id ignored => 200" "200" "$C" "$(body "$R")"
R=$(api_auth "$API_BASE/vehicles/99999"); C=$(code "$R")
assert_status "Vehicle 99999 => 404" "404" "$C" "$(body "$R")"

# ---- TIRES ----
echo -e "\n${CYAN}  [Tires: CRUD + validation]${NC}"
R=$(api_auth -X POST -d '{"brand_id":1,"full_size_string":"265/70R17","condition":"U","tread_depth_32nds":8,"retail_price":89.99,"width_mm":265,"aspect_ratio":70,"wheel_diameter":17}' "$API_BASE/tires"); C=$(code "$R"); B=$(body "$R")
assert_status "Tire create" "200" "$C" "$B"
TIRE_ID=$(jval "$B" tire_id)

R=$(api_auth "$API_BASE/tires/$TIRE_ID"); C=$(code "$R"); B=$(body "$R")
assert_status "Tire detail" "200" "$C" "$B"
assert "Tire: brand_name" 'brand_name' "$B"

R=$(api_auth "$API_BASE/tires/search/advanced?size=265&limit=5"); C=$(code "$R")
assert_status "Tire search" "200" "$C" "$(body "$R")"

R=$(api_auth -X PATCH -d '{"retail_price":99.99}' "$API_BASE/tires/$TIRE_ID"); C=$(code "$R")
assert_status "Tire update" "200" "$C" "$(body "$R")"

R=$(api_auth -X POST -d '{}' "$API_BASE/tires"); C=$(code "$R")
assert_status "Tire empty body => error" "500" "$C" "$(body "$R")"
R=$(api_auth -X POST -d '{"brand_id":1,"condition":"INVALID","retail_price":50,"width_mm":215,"aspect_ratio":65,"wheel_diameter":15}' "$API_BASE/tires"); C=$(code "$R")
assert_status "Tire bad ENUM => error" "500" "$C" "$(body "$R")"
R=$(api_auth "$API_BASE/tires/99999"); C=$(code "$R")
assert_status "Tire 99999 => 404" "404" "$C" "$(body "$R")"
R=$(api_auth -X POST -d '{"brand_id":99999,"condition":"N","retail_price":50,"width_mm":215,"aspect_ratio":65,"wheel_diameter":15}' "$API_BASE/tires"); C=$(code "$R")
assert_status "Tire bad brand FK => error" "500" "$C" "$(body "$R")"

# Negative price (validation gap test)
R=$(api_auth -X POST -d '{"brand_id":1,"condition":"N","retail_price":-10,"width_mm":215,"aspect_ratio":65,"wheel_diameter":15}' "$API_BASE/tires"); C=$(code "$R"); B=$(body "$R")
TOTAL=$((TOTAL + 1))
NEG_ID=$(jval "$B" tire_id)
if [ -n "$NEG_ID" ] && [ "$C" = "200" ]; then
    FAIL=$((FAIL + 1))
    echo -e "  ${RED}FAIL${NC} Tire negative price accepted (validation gap)"
    FAILURES="${FAILURES}\n  ${RED}FAIL${NC} Tire negative price accepted"
else
    PASS=$((PASS + 1))
    echo -e "  ${GREEN}PASS${NC} Tire negative price rejected"
fi

# SQLi in tire search
R=$(api_auth "$API_BASE/tires/search/advanced?size=265%27%20OR%201%3D1%20--"); C=$(code "$R")
assert_status "SQLi tire search => safe" "200" "$C" "$(body "$R")"

# ---- WORK ORDERS ----
echo -e "\n${CYAN}  [Work Orders: CRUD + estimated_price]${NC}"
R=$(api_auth -X POST -d "{\"customer_id\":$CUST_ID,\"vehicle_id\":$VEH_ID,\"mileage_in\":45000,\"customer_complaint\":\"Tire rotation\",\"estimated_price\":149.99}" "$API_BASE/work-orders"); C=$(code "$R"); B=$(body "$R")
assert_status "WO create" "200" "$C" "$B"
WO_ID=$(jval "$B" work_order_id)

R=$(api_auth "$API_BASE/work-orders/$WO_ID"); C=$(code "$R"); B=$(body "$R")
assert_status "WO detail" "200" "$C" "$B"
assert "WO: complaint" 'Tire rotation' "$B"
assert "WO: estimated_price field" '"estimated_price"' "$B"
assert "WO: price = 149.99" '149.99' "$B"
assert "WO: positions array" '"positions"' "$B"

R=$(api_auth -X PATCH -d '{"estimated_price":"225.50"}' "$API_BASE/work-orders/$WO_ID"); C=$(code "$R"); B=$(body "$R")
assert_status "WO update price" "200" "$C" "$B"
assert "WO: price in changes" 'estimated_price' "$B"

R=$(api_auth "$API_BASE/work-orders/$WO_ID"); B=$(body "$R")
assert "WO: price persisted 225.50" '225.50' "$B"

R=$(api_auth -X PATCH -d '{"estimated_price":null}' "$API_BASE/work-orders/$WO_ID"); C=$(code "$R")
assert_status "WO clear price" "200" "$C" "$(body "$R")"

# WO without price
R=$(api_auth -X POST -d "{\"customer_id\":$CUST_ID,\"customer_complaint\":\"Flat\"}" "$API_BASE/work-orders"); C=$(code "$R"); B=$(body "$R")
assert_status "WO no price" "200" "$C" "$B"
WO2=$(jval "$B" work_order_id)
R=$(api_auth "$API_BASE/work-orders/$WO2"); B=$(body "$R")
assert "WO2: price null" '"estimated_price":null' "$B"

R=$(api_auth "$API_BASE/work-orders"); C=$(code "$R")
assert_status "WO list" "200" "$C" "$(body "$R")"

R=$(api_auth -X PATCH -d '{"status":"in_progress"}' "$API_BASE/work-orders/$WO_ID"); C=$(code "$R")
assert_status "WO status update" "200" "$C" "$(body "$R")"

# ---- APPOINTMENTS ----
echo -e "\n${CYAN}  [Appointments]${NC}"
R=$(api_auth -X POST -d "{\"customer_id\":$CUST_ID,\"vehicle_id\":$VEH_ID,\"appointment_date\":\"2026-03-20\",\"appointment_time\":\"10:00\",\"service_requested\":\"Rotation\"}" "$API_BASE/appointments"); C=$(code "$R"); B=$(body "$R")
assert_status "Appointment create" "200" "$C" "$B"
assert "Appointment ID" '"appointment_id"' "$B"

R=$(api_auth "$API_BASE/appointments"); C=$(code "$R")
assert_status "Appointment list" "200" "$C" "$(body "$R")"

R=$(api_auth -X POST -d "{\"customer_id\":$CUST_ID}" "$API_BASE/appointments"); C=$(code "$R")
assert_status "Appointment no date => error" "500" "$C" "$(body "$R")"

# ---- VENDORS + PO ----
echo -e "\n${CYAN}  [Vendors + Purchase Orders]${NC}"
R=$(api_auth -X POST -d '{"vendor_name":"ATD","contact_name":"Sales","phone":"800-555-1234"}' "$API_BASE/vendors"); C=$(code "$R"); B=$(body "$R")
assert_status "Vendor create" "200" "$C" "$B"
VID=$(jval "$B" vendor_id)

R=$(api_auth -X POST -d "{\"vendor_id\":$VID,\"notes\":\"Test\"}" "$API_BASE/purchase-orders"); C=$(code "$R"); B=$(body "$R")
assert_status "PO create" "200" "$C" "$B"
assert "PO ID" '"po_id"' "$B"

R=$(api_auth "$API_BASE/purchase-orders"); C=$(code "$R")
assert_status "PO list" "200" "$C" "$(body "$R")"

R=$(api_auth -X POST -d '{"notes":"no vendor"}' "$API_BASE/purchase-orders"); C=$(code "$R")
assert_status "PO no vendor => error" "500" "$C" "$(body "$R")"

R=$(api_auth -X POST -d '{"vendor_name":""}' "$API_BASE/vendors"); C=$(code "$R")
assert_status "Vendor empty name => error" "500" "$C" "$(body "$R")"

# ---- SETTINGS / ROLES / WARRANTIES ----
echo -e "\n${CYAN}  [Settings + Roles + Warranties]${NC}"
R=$(api_auth "$API_BASE/settings"); C=$(code "$R")
assert_status "Settings" "200" "$C" "$(body "$R")"
R=$(api_auth "$API_BASE/roles"); C=$(code "$R"); B=$(body "$R")
assert_status "Roles" "200" "$C" "$B"
assert "Roles: owner" 'owner' "$B"
R=$(api_auth "$API_BASE/warranty-policies"); C=$(code "$R")
assert_status "Warranty policies" "200" "$C" "$(body "$R")"

# ---- MARKETPLACE ----
echo -e "\n${CYAN}  [Marketplace + B2B]${NC}"
R=$(api_auth "$API_BASE/integrations"); C=$(code "$R")
assert_status "Integrations" "200" "$C" "$(body "$R")"
R=$(api_auth "$API_BASE/marketplace/listings"); C=$(code "$R")
assert_status "Listings" "200" "$C" "$(body "$R")"
R=$(api_auth "$API_BASE/marketplace/orders"); C=$(code "$R")
assert_status "Orders" "200" "$C" "$(body "$R")"
R=$(api_auth "$API_BASE/b2b/inventory"); C=$(code "$R")
assert_status "B2B" "200" "$C" "$(body "$R")"
R=$(api_auth "$API_BASE/directory-listings"); C=$(code "$R")
assert_status "Directory" "200" "$C" "$(body "$R")"

R=$(api_auth -X POST -d "{\"platform\":\"craigslist\",\"tire_id\":$TIRE_ID,\"title\":\"Test\",\"price\":89.99}" "$API_BASE/marketplace/listings"); C=$(code "$R"); B=$(body "$R")
assert_status "Listing create" "200" "$C" "$B"
assert "Listing ID" '"listing_id"' "$B"

R=$(api_auth "$API_BASE/marketplace/generate-content/$TIRE_ID?platform=craigslist"); C=$(code "$R"); B=$(body "$R")
assert_status "Generate content" "200" "$C" "$B"
assert "Content: title" '"title"' "$B"

# ---- PUBLIC STOREFRONT ----
echo -e "\n${CYAN}  [Public Storefront]${NC}"
R=$(api "$API_BASE/public/shop-info"); C=$(code "$R")
assert_status "Public shop-info" "200" "$C" "$(body "$R")"
R=$(api "$API_BASE/public/inventory"); C=$(code "$R")
assert_status "Public inventory" "200" "$C" "$(body "$R")"
R=$(api "$API_BASE/public/brands"); C=$(code "$R"); B=$(body "$R")
assert_status "Public brands" "200" "$C" "$B"
assert "Public: Goodyear" 'Goodyear' "$B"
R=$(api "$API_BASE/public/warranty-policies"); C=$(code "$R")
assert_status "Public warranties" "200" "$C" "$(body "$R")"
R=$(api "$API_BASE/public/website-config"); C=$(code "$R")
assert_status "Public config" "200" "$C" "$(body "$R")"

# ---- LOOKUPS ----
echo -e "\n${CYAN}  [Lookups]${NC}"
R=$(api_auth "$API_BASE/lookups/brands"); C=$(code "$R"); B=$(body "$R")
assert_status "Lookup brands" "200" "$C" "$B"
assert "Lookup: Goodyear" 'Goodyear' "$B"
R=$(api_auth "$API_BASE/lookups/tire-types"); C=$(code "$R")
assert_status "Lookup tire-types" "200" "$C" "$(body "$R")"
R=$(api_auth "$API_BASE/lookups/construction-types"); C=$(code "$R")
assert_status "Lookup construction" "200" "$C" "$(body "$R")"

# ---- BOUNDARY VALUES ----
echo -e "\n${CYAN}  [Boundary values]${NC}"
LONG=$(python3 -c "print('A' * 500)")
R=$(api_auth -X POST -d "{\"first_name\":\"$LONG\",\"last_name\":\"Boundary\",\"phone\":\"555\"}" "$API_BASE/customers"); C=$(code "$R")
TOTAL=$((TOTAL + 1))
if [ "$C" = "200" ] || [ "$C" = "500" ]; then
    PASS=$((PASS + 1)); echo -e "  ${GREEN}PASS${NC} 500-char name handled (HTTP $C)"
else
    FAIL=$((FAIL + 1)); echo -e "  ${RED}FAIL${NC} 500-char name unhandled (HTTP $C)"
    FAILURES="${FAILURES}\n  ${RED}FAIL${NC} Boundary: 500-char name => $C"
fi

# ---- LOGOUT ----
echo -e "\n${CYAN}  [Logout + token invalidation]${NC}"
R=$(api_auth -X POST "$API_BASE/auth/logout"); C=$(code "$R")
assert_status "Logout" "200" "$C" "$(body "$R")"
R=$(api_auth "$API_BASE/auth/session"); C=$(code "$R")
assert_status "Session after logout => 401" "401" "$C" "$(body "$R")"
R=$(api_auth "$API_BASE/work-orders"); C=$(code "$R")
assert_status "Protected after logout => 401" "401" "$C" "$(body "$R")"

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
[ "$FAIL" -gt 0 ] && exit 1; exit 0
