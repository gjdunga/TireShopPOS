<?php
declare(strict_types=1);

/**
 * API Route Definitions.
 *
 * All routes are registered on the $router instance from index.php.
 * Handler signature: function(array $params, array $body): array
 *
 * Middleware shorthands:
 *   $auth    = [Middleware::auth()]                    (session required)
 *   $permit  = [Middleware::auth(), Middleware::permit('KEY')]  (session + permission)
 *
 * DunganSoft Technologies, March 2026
 */

use App\Core\Database;
use App\Core\Session;
use App\Http\Auth;
use App\Http\Middleware;
use App\Http\Router;

/** @var Router $router */

// Convenience: middleware combos
$auth = [Middleware::auth()];

/**
 * Build a middleware stack: auth + one or more permissions (OR).
 * @param string ...$keys Permission keys
 */
function permit(string ...$keys): array {
    return [Middleware::auth(), Middleware::permit(...$keys)];
}


// ============================================================================
// Health (no auth)
// ============================================================================

$router->get('/api/health', function () use ($app) {
    $dbHealth = Database::health();
    $overall = $dbHealth['connected'] ? 'ok' : 'degraded';

    $cleaned = 0;
    if ($dbHealth['connected']) {
        try { $cleaned = Session::cleanup(); } catch (\Throwable $e) {}
    }

    return [
        'status' => $overall,
        'app' => $app->name(),
        'version' => $app->version(),
        'debug' => $app->isDebug(),
        'timestamp' => date('c'),
        'php' => PHP_VERSION,
        'database' => $dbHealth,
        'expired_sessions_cleaned' => $cleaned,
    ];
});


// ============================================================================
// Auth (no RBAC middleware; login is unauthenticated, others use token directly)
// ============================================================================

$router->post('/api/auth/login', function (array $params, array $body) {
    return Auth::login($body);
});

$router->post('/api/auth/logout', function () {
    return Auth::logout(Session::tokenFromRequest());
});

// Password change: requires a valid session but NOT the force_password_change
// gate (since this is the endpoint that clears it). No middleware -> Auth
// handles token validation internally.
$router->post('/api/auth/password', function (array $params, array $body) {
    return Auth::changePassword(Session::tokenFromRequest(), $body);
});

$router->get('/api/auth/session', function () {
    $token = Session::tokenFromRequest();
    if ($token === null) {
        Router::sendError('NOT_AUTHENTICATED', 'No token provided.', 401);
    }
    $session = Session::validate($token);
    if ($session === null) {
        Router::sendError('NOT_AUTHENTICATED', 'Invalid or expired session.', 401);
    }
    $permissions = Database::query(
        "SELECT p.permission_key FROM role_permissions rp
         JOIN users u ON rp.role_id = u.role_id
         JOIN permissions p ON rp.permission_id = p.permission_id
         WHERE u.user_id = ? AND u.is_active = 1",
        [(int) $session['user_id']]
    );
    return [
        'user_id' => (int) $session['user_id'],
        'username' => $session['username'],
        'display_name' => $session['display_name'],
        'role' => $session['role_name'],
        'session_created' => $session['created_at'],
        'session_expires' => $session['expires_at'],
        'permissions' => array_column($permissions, 'permission_key'),
    ];
});


// ============================================================================
// Tires / Inventory
// ============================================================================

$router->with(permit('INVENTORY_VIEW'))->get('/api/tires/search', function (array $params, array $body) {
    $size = Router::query('size', '');
    if ($size === '') {
        Router::sendError('MISSING_PARAM', 'Query parameter "size" is required.', 400);
    }
    $statusFilter = Router::query('status', null);
    $filters = $statusFilter ? explode(',', $statusFilter) : ['available'];
    return ['results' => searchTiresBySize($size, $filters)];
});

$router->with(permit('INVENTORY_VIEW'))->get('/api/tires/search/advanced', function (array $params, array $body) {
    return ['results' => searchTiresAdvanced(
        Router::query('size'),
        Router::query('brand'),
        Router::query('min_price'),
        Router::query('max_price'),
        Router::query('condition'),
        Router::query('status', 'available'),
        (int) Router::query('limit', '50'),
        (int) Router::query('offset', '0'),
        Router::query('sort_by', 'created_at'),
        Router::query('sort_dir', 'DESC')
    )];
});

$router->with(permit('INVENTORY_VIEW'))->get('/api/tires/parse-size', function () {
    $raw = Router::query('size', '');
    if ($raw === '') {
        Router::sendError('MISSING_PARAM', 'Query parameter "size" is required.', 400);
    }
    $parsed = parseTireSize($raw);
    if ($parsed === null) {
        Router::sendError('INVALID_SIZE', 'Could not parse tire size: ' . $raw, 400);
    }
    return $parsed;
});

$router->with(permit('INVENTORY_VIEW'))->get('/api/tires/{id}/dot', function (array $params) {
    $raw = Router::query('tin', '');
    if ($raw === '') {
        Router::sendError('MISSING_PARAM', 'Query parameter "tin" is required.', 400);
    }
    $parsed = parseDotTin($raw);
    if ($parsed === null) {
        Router::sendError('INVALID_TIN', 'Could not parse DOT/TIN: ' . $raw, 400);
    }
    $parsed['age_years'] = calculateTireAge($parsed['mfg_year'] ?? null, $parsed['mfg_week'] ?? null);
    $parsed['is_aged'] = isTireAged($parsed['mfg_year'] ?? null, $parsed['mfg_week'] ?? null);
    return $parsed;
});

$router->with(permit('INVENTORY_VIEW'))->get('/api/tires/{id}/waivers', function (array $params) {
    $tireId = (int) $params['id'];
    $isRepairOutside = (bool) Router::query('repair_outside_tread', '0');
    return ['waivers_needed' => detectWaiversNeeded($tireId, $isRepairOutside)];
});

$router->with(permit('WAIVER_CREATE'))->get('/api/waivers/template/{type}', function (array $params) {
    $template = getWaiverTemplate($params['type']);
    if ($template === null) {
        Router::sendError('NOT_FOUND', 'Waiver template not found: ' . $params['type'], 404);
    }
    return ['type' => $params['type'], 'template' => $template];
});


// ============================================================================
// Customers
// ============================================================================

$router->with(permit('CUSTOMER_MANAGE'))->get('/api/customers/search', function () {
    $q = Router::query('q', '');
    if ($q === '') {
        Router::sendError('MISSING_PARAM', 'Query parameter "q" is required.', 400);
    }
    $limit = (int) Router::query('limit', '20');
    return ['results' => searchCustomers($q, $limit)];
});


// ============================================================================
// Vehicles
// ============================================================================

$router->with(permit('VEHICLE_MANAGE'))->get('/api/vehicles/search', function () {
    $q = Router::query('q', '');
    if ($q === '') {
        Router::sendError('MISSING_PARAM', 'Query parameter "q" is required.', 400);
    }
    $limit = (int) Router::query('limit', '20');
    return ['results' => searchVehicles($q, $limit)];
});

$router->with(permit('VEHICLE_MANAGE'))->get('/api/vehicles/{id}/history', function (array $params) {
    return ['history' => getVehicleHistory((int) $params['id'])];
});

$router->with(permit('CUSTOMER_MANAGE'))->get('/api/customers/{id}/vehicles', function (array $params) {
    return ['vehicles' => getCustomerVehicles((int) $params['id'])];
});

$router->with(permit('VEHICLE_MANAGE'))->post('/api/vehicles/validate-vin', function (array $params, array $body) {
    $vin = $body['vin'] ?? '';
    if ($vin === '') {
        Router::sendError('MISSING_FIELD', 'Field "vin" is required.', 400);
    }
    return validateVin($vin);
});

$router->with(permit('VEHICLE_MANAGE'))->get('/api/vehicles/wheel-positions', function () {
    $drivetrain = Router::query('drivetrain');
    $isDually = (bool) Router::query('is_dually', '0');
    return ['positions' => getWheelPositions($drivetrain, $isDually)];
});


// ============================================================================
// Work Orders
// ============================================================================

$router->with(permit('WORK_ORDER_CREATE', 'WORK_ORDER_ASSIGN'))->get('/api/work-orders/open', function () {
    return ['work_orders' => getOpenWorkOrders()];
});

$router->with(permit('WORK_ORDER_CREATE'))->get('/api/work-orders/{id}/completable', function (array $params) {
    return canCompleteWorkOrder((int) $params['id']);
});


// ============================================================================
// Torque / Re-torque
// ============================================================================

$router->with(permit('WORK_ORDER_CREATE'))->post('/api/work-orders/{id}/schedule-retorque', function (array $params, array $body) {
    $woId = (int) $params['id'];
    $dueDays = (int) ($body['due_days'] ?? 7);
    $dueMiles = (int) ($body['due_miles'] ?? 75);
    scheduleRetorque($woId, $dueDays, $dueMiles);
    return ['message' => 'Re-torque scheduled.', 'work_order_id' => $woId];
});

$router->with(permit('WORK_ORDER_CREATE'))->get('/api/retorque/due', function () {
    return ['due_list' => getRetorqueDueList()];
});

$router->with(permit('WORK_ORDER_CREATE'))->post('/api/retorque/{id}/complete', function (array $params) {
    $woId = (int) $params['id'];
    completeRetorque($woId, Middleware::userId());
    return ['message' => 'Re-torque completed.', 'work_order_id' => $woId];
});


// ============================================================================
// Invoices
// ============================================================================

$router->with(permit('INVOICE_CREATE'))->get('/api/invoices/{id}/totals', function (array $params) {
    return calculateInvoiceTotals((int) $params['id']);
});

$router->with(permit('INVOICE_CREATE'))->post('/api/invoices/{id}/tire-fees', function (array $params, array $body) {
    $invoiceId = (int) $params['id'];
    $condition = $body['tire_condition'] ?? 'new';
    $qty = (int) ($body['quantity'] ?? 1);
    insertTireFees($invoiceId, $condition, $qty);
    return ['message' => 'Tire fees inserted.', 'invoice_id' => $invoiceId];
});

$router->with(permit('INVOICE_CREATE'))->post('/api/invoices/{id}/disposal-fee', function (array $params, array $body) {
    $invoiceId = (int) $params['id'];
    $qty = (int) ($body['quantity'] ?? 1);
    insertDisposalFee($invoiceId, $qty);
    return ['message' => 'Disposal fee inserted.', 'invoice_id' => $invoiceId];
});

$router->with(permit('INVOICE_CREATE'))->post('/api/invoices/{id}/add-service', function (array $params, array $body) {
    $invoiceId = (int) $params['id'];
    $serviceId = (int) ($body['service_id'] ?? 0);
    $qty = (int) ($body['quantity'] ?? 1);
    if ($serviceId === 0) {
        Router::sendError('MISSING_FIELD', 'Field "service_id" is required.', 400);
    }
    addServiceToInvoice($invoiceId, $serviceId, $qty);
    return ['message' => 'Service added.', 'invoice_id' => $invoiceId, 'service_id' => $serviceId];
});

$router->with(permit('PRICE_OVERRIDE', 'PRICE_OVERRIDE_HIGH'))->get('/api/services/{id}/check-override', function (array $params) {
    $serviceId = (int) $params['id'];
    $newPrice = Router::query('price', '');
    if ($newPrice === '') {
        Router::sendError('MISSING_PARAM', 'Query parameter "price" is required.', 400);
    }
    $result = checkPriceOverride($serviceId, $newPrice);
    return ['service_id' => $serviceId, 'new_price' => $newPrice, 'decision' => $result];
});


// ============================================================================
// Tax and Fees
// ============================================================================

$router->with($auth)->get('/api/tax/current-rate', function () {
    return ['rate' => getCurrentTaxRate()];
});


// ============================================================================
// Deposits
// ============================================================================

$router->with(permit('DEPOSIT_ACCEPT'))->get('/api/deposits/config', function () {
    return [
        'minimum_percent' => getMinimumDepositPercent(),
        'expiration_days' => getDepositExpirationDays(),
    ];
});

$router->with(permit('DEPOSIT_FORFEIT'))->get('/api/deposits/expired', function () {
    return ['deposits' => getExpiredDeposits()];
});

$router->with(permit('DEPOSIT_ACCEPT'))->get('/api/deposits/expiring', function () {
    $withinDays = (int) Router::query('within_days', '7');
    return ['deposits' => getExpiringDeposits($withinDays)];
});


// ============================================================================
// Refunds
// ============================================================================

$router->with(permit('REFUND_REQUEST'))->post('/api/refunds/validate', function (array $params, array $body) {
    $invoiceId = (int) ($body['invoice_id'] ?? 0);
    $amount = $body['amount'] ?? '0.00';
    if ($invoiceId === 0) {
        Router::sendError('MISSING_FIELD', 'Field "invoice_id" is required.', 400);
    }
    return validateRefundRequest($invoiceId, $amount, Middleware::userId());
});

$router->with(permit('REFUND_APPROVE', 'REFUND_APPROVE_HIGH'))->get('/api/refunds/pending', function () {
    return ['refunds' => getPendingRefunds()];
});


// ============================================================================
// Cash Drawer
// ============================================================================

$router->with(permit('CASH_DRAWER_OPEN'))->post('/api/cash-drawer/open', function (array $params, array $body) {
    $balance = $body['opening_balance'] ?? '0.00';
    $drawerId = openCashDrawer(Middleware::userId(), $balance);
    if ($drawerId === null) {
        Router::sendError('DRAWER_OPEN', 'A cash drawer is already open today.', 409);
    }
    return ['message' => 'Cash drawer opened.', 'drawer_id' => $drawerId];
});

$router->with(permit('CASH_DRAWER_OPEN'))->get('/api/cash-drawer/today', function () {
    $drawer = getCashDrawerToday();
    if ($drawer === null) {
        return ['open' => false, 'drawer' => null];
    }
    return ['open' => true, 'drawer' => $drawer];
});

$router->with(permit('CASH_DRAWER_CLOSE'))->post('/api/cash-drawer/close', function (array $params, array $body) {
    $closingCount = $body['closing_count'] ?? '0.00';
    closeCashDrawer(Middleware::userId(), $closingCount);
    return ['message' => 'Cash drawer closed.'];
});

$router->with(permit('CASH_DRAWER_OPEN'))->post('/api/cash-drawer/transaction', function (array $params, array $body) {
    $txnType = $body['type'] ?? '';
    $amount = $body['amount'] ?? '0.00';
    if ($txnType === '') {
        Router::sendError('MISSING_FIELD', 'Field "type" is required.', 400);
    }
    recordCashTransaction(
        $txnType,
        $amount,
        Middleware::userId(),
        isset($body['payment_id']) ? (int) $body['payment_id'] : null,
        isset($body['refund_id']) ? (int) $body['refund_id'] : null,
        $body['description'] ?? null
    );
    return ['message' => 'Transaction recorded.'];
});


// ============================================================================
// Appointments
// ============================================================================

$router->with(permit('APPOINTMENT_MANAGE'))->get('/api/appointments/today', function () {
    return ['appointments' => getTodaysAppointments()];
});


// ============================================================================
// Purchase Orders
// ============================================================================

$router->with(permit('PO_CREATE', 'PO_RECEIVE'))->get('/api/purchase-orders/open', function () {
    return ['purchase_orders' => getOpenPurchaseOrders()];
});


// ============================================================================
// Reports (all require REPORT_VIEW)
// ============================================================================

$router->with(permit('REPORT_VIEW'))->get('/api/reports/quarterly-fees', function () {
    $year = (int) Router::query('year', (string) date('Y'));
    $quarter = (int) Router::query('quarter', (string) ceil(date('n') / 3));
    return ['year' => $year, 'quarter' => $quarter, 'report' => getQuarterlyFeeReport($year, $quarter)];
});

$router->with(permit('REPORT_VIEW'))->get('/api/reports/monthly-tax', function () {
    $year = (int) Router::query('year', (string) date('Y'));
    $month = (int) Router::query('month', (string) date('n'));
    return ['year' => $year, 'month' => $month, 'breakdown' => getMonthlyTaxBreakdown($year, $month)];
});

$router->with(permit('REPORT_VIEW'))->get('/api/reports/service-usage', function () {
    return ['report' => getServiceUsageReport()];
});

$router->with(permit('REPORT_VIEW'))->get('/api/reports/employee-activity', function () {
    $userId = (int) Router::query('user_id', '0');
    $start = Router::query('start', date('Y-m-01'));
    $end = Router::query('end', date('Y-m-d'));
    if ($userId === 0) {
        Router::sendError('MISSING_PARAM', 'Query parameter "user_id" is required.', 400);
    }
    return ['user_id' => $userId, 'start' => $start, 'end' => $end,
            'activity' => getEmployeeActivity($userId, $start, $end)];
});

$router->with(permit('REPORT_VIEW'))->get('/api/reports/active-warranties', function () {
    return ['warranties' => getActiveWarranties()];
});


// ============================================================================
// Audit (owner only)
// ============================================================================

$router->with(permit('AUDIT_VIEW'))->get('/api/audit', function () {
    $table = Router::query('table');
    $action = Router::query('action');
    $userId = Router::query('user_id');
    $limit = (int) Router::query('limit', '50');
    $offset = (int) Router::query('offset', '0');

    $where = [];
    $binds = [];

    if ($table !== null) {
        $where[] = 'a.table_name = ?';
        $binds[] = $table;
    }
    if ($action !== null) {
        $where[] = 'a.action = ?';
        $binds[] = $action;
    }
    if ($userId !== null) {
        $where[] = 'a.changed_by = ?';
        $binds[] = (int) $userId;
    }

    $sql = "SELECT a.*, u.username AS changed_by_username
            FROM audit_log a
            LEFT JOIN users u ON a.changed_by = u.user_id";

    if (!empty($where)) {
        $sql .= ' WHERE ' . implode(' AND ', $where);
    }

    $sql .= " ORDER BY a.changed_at DESC LIMIT ? OFFSET ?";
    $binds[] = $limit;
    $binds[] = $offset;

    return ['entries' => Database::query($sql, $binds)];
});


// ============================================================================
// User Management (owner only)
// ============================================================================

$router->with(permit('USER_MANAGE'))->get('/api/users', function () {
    return ['users' => Database::query(
        "SELECT u.user_id, u.username, u.display_name, u.email, u.phone,
                r.role_name, u.is_active, u.last_login_at, u.created_at
         FROM users u JOIN roles r ON u.role_id = r.role_id
         ORDER BY u.display_name"
    )];
});

$router->with(permit('USER_MANAGE'))->get('/api/users/{id}', function (array $params) {
    $user = Database::queryOne(
        "SELECT u.user_id, u.username, u.display_name, u.email, u.phone,
                u.role_id, r.role_name, u.is_active, u.force_password_change,
                u.failed_login_count, u.locked_until, u.last_login_at,
                u.password_changed_at, u.created_at, u.updated_at
         FROM users u JOIN roles r ON u.role_id = r.role_id
         WHERE u.user_id = ?",
        [(int) $params['id']]
    );
    if ($user === null) {
        Router::sendError('NOT_FOUND', 'User not found.', 404);
    }
    return $user;
});

$router->with(permit('USER_MANAGE'))->post('/api/users', function (array $params, array $body) {
    $username = trim($body['username'] ?? '');
    $displayName = trim($body['display_name'] ?? '');
    $password = $body['password'] ?? '';
    $roleId = (int) ($body['role_id'] ?? 0);

    if ($username === '' || $displayName === '' || $password === '' || $roleId === 0) {
        Router::sendError('MISSING_FIELDS', 'Fields username, display_name, password, and role_id are required.', 400);
    }

    $exists = Database::scalar("SELECT COUNT(*) FROM users WHERE username = ?", [$username]);
    if ((int) $exists > 0) {
        Router::sendError('DUPLICATE', 'Username already exists.', 409);
    }

    $hash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);

    Database::execute(
        "INSERT INTO users (username, password_hash, display_name, email, phone, role_id, is_active, force_password_change)
         VALUES (?, ?, ?, ?, ?, ?, 1, 1)",
        [$username, $hash, $displayName, $body['email'] ?? null, $body['phone'] ?? null, $roleId]
    );

    $newId = Database::lastInsertId();

    auditLog('users', $newId, 'INSERT', null, null, null, Middleware::userId());
    logActivity(Middleware::userId(), 'USER_CREATE', 'users', $newId, 'Created user: ' . $username);

    return ['message' => 'User created.', 'user_id' => $newId, 'force_password_change' => true];
});

$router->with(permit('USER_MANAGE'))->patch('/api/users/{id}', function (array $params, array $body) {
    $userId = (int) $params['id'];

    $user = Database::queryOne("SELECT * FROM users WHERE user_id = ?", [$userId]);
    if ($user === null) {
        Router::sendError('NOT_FOUND', 'User not found.', 404);
    }

    $fields = [];
    $binds = [];
    $changes = [];

    foreach (['display_name', 'email', 'phone'] as $f) {
        if (array_key_exists($f, $body)) {
            $fields[] = "{$f} = ?";
            $binds[] = $body[$f];
            $changes[$f] = ['old' => $user[$f], 'new' => $body[$f]];
        }
    }

    if (array_key_exists('role_id', $body)) {
        $fields[] = "role_id = ?";
        $binds[] = (int) $body['role_id'];
        $changes['role_id'] = ['old' => $user['role_id'], 'new' => $body['role_id']];
    }

    if (array_key_exists('is_active', $body)) {
        $fields[] = "is_active = ?";
        $binds[] = (int) $body['is_active'];
        $changes['is_active'] = ['old' => $user['is_active'], 'new' => $body['is_active']];

        if (!(int) $body['is_active']) {
            Session::destroyAllForUser($userId);
        }
    }

    if (empty($fields)) {
        Router::sendError('NO_CHANGES', 'No fields to update.', 400);
    }

    $binds[] = $userId;
    Database::execute("UPDATE users SET " . implode(', ', $fields) . " WHERE user_id = ?", $binds);

    foreach ($changes as $field => $vals) {
        auditLog('users', $userId, 'UPDATE', $field, (string) $vals['old'], (string) $vals['new'], Middleware::userId());
    }

    return ['message' => 'User updated.', 'user_id' => $userId, 'changes' => array_keys($changes)];
});

$router->with(permit('USER_MANAGE'))->post('/api/users/{id}/unlock', function (array $params) {
    $userId = (int) $params['id'];
    Database::execute("UPDATE users SET failed_login_count = 0, locked_until = NULL WHERE user_id = ?", [$userId]);
    auditLog('users', $userId, 'UPDATE', 'locked_until', null, null, Middleware::userId());
    return ['message' => 'User unlocked.', 'user_id' => $userId];
});

$router->with(permit('USER_MANAGE'))->post('/api/users/{id}/force-password-reset', function (array $params) {
    $userId = (int) $params['id'];
    Database::execute("UPDATE users SET force_password_change = 1 WHERE user_id = ?", [$userId]);
    Session::destroyAllForUser($userId);
    auditLog('users', $userId, 'UPDATE', 'force_password_change', '0', '1', Middleware::userId());
    return ['message' => 'Password reset required on next login.', 'user_id' => $userId, 'sessions_terminated' => true];
});

$router->with(permit('USER_MANAGE'))->get('/api/roles', function () {
    return ['roles' => Database::query("SELECT role_id, role_name, description FROM roles ORDER BY role_id")];
});

$router->with(permit('USER_MANAGE'))->get('/api/roles/{id}/permissions', function (array $params) {
    $roleId = (int) $params['id'];
    return ['role_id' => $roleId, 'permissions' => Database::query(
        "SELECT p.permission_id, p.permission_key, p.description
         FROM role_permissions rp
         JOIN permissions p ON rp.permission_id = p.permission_id
         WHERE rp.role_id = ?
         ORDER BY p.permission_key",
        [$roleId]
    )];
});


// ============================================================================
// Sequence generators (auth only, used internally by invoice/WO creation)
// ============================================================================

$router->with(permit('INVOICE_CREATE'))->get('/api/sequences/next-invoice', function () {
    return ['number' => nextInvoiceNumber()];
});

$router->with(permit('WORK_ORDER_CREATE'))->get('/api/sequences/next-work-order', function () {
    return ['number' => nextWorkOrderNumber()];
});

$router->with(permit('PO_CREATE'))->get('/api/sequences/next-po', function () {
    return ['number' => nextPONumber()];
});
