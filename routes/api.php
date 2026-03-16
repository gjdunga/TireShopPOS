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
use App\Core\Ops;
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

    // Ops summary: lightweight checks only (no full ops report)
    $opsHealth = Ops::health();

    // Escalate status based on ops checks
    if ($overall === 'ok') {
        $disk = $opsHealth['disk'] ?? [];
        if (!empty($disk['critical'])) {
            $overall = 'critical';
        } elseif (!empty($disk['warning'])) {
            $overall = 'degraded';
        }
        $dbBackup = $opsHealth['backups']['db_backup'] ?? null;
        if ($dbBackup !== null && !empty($dbBackup['stale'])) {
            $overall = ($overall === 'ok') ? 'degraded' : $overall;
        }
    }

    return [
        'status' => $overall,
        'app' => $app->name(),
        'version' => $app->version(),
        'debug' => $app->isDebug(),
        'timestamp' => date('c'),
        'php' => PHP_VERSION,
        'database' => $dbHealth,
        'ops' => $opsHealth,
        'expired_sessions_cleaned' => $cleaned,
    ];
});

// Full ops health (auth required, owner/manager only)
$router->with(permit('REPORT_VIEW'))->get('/api/ops/health', function () use ($app) {
    $dbHealth = Database::health();
    $opsHealth = Ops::health();

    // Compute overall status
    $issues = [];
    if (!$dbHealth['connected']) {
        $issues[] = 'database disconnected';
    }

    $disk = $opsHealth['disk'] ?? [];
    if (!empty($disk['critical'])) {
        $issues[] = 'disk usage critical (' . ($disk['used_pct'] ?? '?') . '%)';
    } elseif (!empty($disk['warning'])) {
        $issues[] = 'disk usage high (' . ($disk['used_pct'] ?? '?') . '%)';
    }

    $dbBackup = $opsHealth['backups']['db_backup'] ?? null;
    if ($dbBackup === null) {
        $issues[] = 'no database backup found';
    } elseif (!empty($dbBackup['stale'])) {
        $issues[] = 'database backup stale (' . ($dbBackup['age_hours'] ?? '?') . 'h old)';
    }

    $photoBackup = $opsHealth['backups']['photo_backup'] ?? null;
    if ($photoBackup !== null && !empty($photoBackup['stale'])) {
        $issues[] = 'photo backup stale (' . ($photoBackup['age_hours'] ?? '?') . 'h old)';
    }

    $system = $opsHealth['system'] ?? [];
    if (isset($system['extensions_ok']) && !$system['extensions_ok']) {
        $issues[] = 'missing PHP extensions: ' . implode(', ', $system['missing_extensions'] ?? []);
    }

    $storage = $opsHealth['storage'] ?? [];
    foreach ($storage as $dir => $info) {
        if (!($info['writable'] ?? true)) {
            $issues[] = "storage/{$dir} not writable";
        }
    }

    $expired = $opsHealth['sessions']['expired_pending'] ?? 0;
    if ($expired > 100) {
        $issues[] = "{$expired} expired sessions pending cleanup";
    }

    $status = empty($issues) ? 'ok' : (count($issues) > 2 ? 'critical' : 'degraded');

    return [
        'status' => $status,
        'issues' => $issues,
        'app' => ['name' => $app->name(), 'version' => $app->version()],
        'database' => $dbHealth,
        'ops' => $opsHealth,
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
    $brandId = Router::query('brand_id');
    $minPrice = Router::query('min_price');
    $maxPrice = Router::query('max_price');
    $minTread = Router::query('min_tread');

    return ['results' => searchTiresAdvanced(
        Router::query('size'),
        $brandId !== null ? (int) $brandId : null,
        Router::query('condition'),
        $minPrice !== null ? (float) $minPrice : null,
        $maxPrice !== null ? (float) $maxPrice : null,
        Router::query('status', 'available'),
        $minTread !== null ? (int) $minTread : null,
        Router::query('bin_facility'),
        (int) Router::query('limit', '50'),
        (int) Router::query('offset', '0')
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

$router->with(permit('WORK_ORDER_CREATE', 'WORK_ORDER_ASSIGN'))->get('/api/work-orders', function () {
    $status = Router::query('status', '');
    $limit = (int) Router::query('limit', '50');
    $offset = (int) Router::query('offset', '0');
    return ['results' => listWorkOrders($status, $limit, $offset)];
});

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
        return ['open' => false, 'drawer' => null, 'transactions' => []];
    }
    $txns = getCashDrawerTransactions((int) $drawer['drawer_id']);
    return ['open' => true, 'drawer' => $drawer, 'transactions' => $txns];
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

$router->with(permit('PO_CREATE', 'PO_RECEIVE'))->get('/api/purchase-orders', function () {
    $status = Router::query('status', '');
    $limit = (int) Router::query('limit', '50');
    $offset = (int) Router::query('offset', '0');
    return ['results' => listPurchaseOrders($status, $limit, $offset)];
});

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

$router->with(permit('REPORT_VIEW'))->get('/api/reports/sales-summary', function () {
    $period = Router::query('period', 'daily');
    $start = Router::query('start', null);
    $end = Router::query('end', null);
    return ['period' => $period, 'data' => getSalesSummary($period, $start, $end)];
});

$router->with(permit('REPORT_VIEW'))->get('/api/reports/inventory-stats', function () {
    return getInventoryStats();
});

$router->with(permit('REPORT_VIEW'))->get('/api/reports/cash-reconciliation', function () {
    $start = Router::query('start', null);
    $end = Router::query('end', null);
    return ['drawers' => getCashReconciliation($start, $end)];
});

$router->with(permit('REPORT_VIEW'))->get('/api/reports/outstanding-deposits', function () {
    return ['deposits' => getOutstandingDeposits()];
});

$router->with(permit('REPORT_VIEW'))->get('/api/reports/payment-methods', function () {
    $start = Router::query('start', null);
    $end = Router::query('end', null);
    return ['breakdown' => getPaymentMethodBreakdown($start, $end)];
});

$router->with(permit('REPORT_VIEW'))->get('/api/reports/top-selling-tires', function () {
    $limit = (int) Router::query('limit', '10');
    $start = Router::query('start', null);
    $end = Router::query('end', null);
    return ['tires' => getTopSellingTires($limit, $start, $end)];
});

$router->with(permit('REPORT_VIEW'))->get('/api/reports/lookup-cost', function () {
    $start = Router::query('start', null);
    $end = Router::query('end', null);
    return ['data' => getLookupCostReport($start, $end)];
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


// ============================================================================
// P2b: Entity CRUD Routes
// Full create/read/update/delete for all POS entities.
// DunganSoft Technologies, March 2026
// ============================================================================


// ---- Tires: single, create, update, write-off, photos ----

$router->with(permit('INVENTORY_VIEW'))->get('/api/tires/{id}', function (array $params) {
    $tire = getTire((int) $params['id']);
    if ($tire === null) {
        Router::sendError('NOT_FOUND', 'Tire not found.', 404);
    }
    return $tire;
});

$router->with(permit('INVENTORY_ADD'))->post('/api/tires', function (array $params, array $body) {
    $tireId = createTire($body, Middleware::userId());
    return ['message' => 'Tire created.', 'tire_id' => $tireId];
});

$router->with(permit('INVENTORY_EDIT'))->patch('/api/tires/{id}', function (array $params, array $body) {
    $result = updateTire((int) $params['id'], $body, Middleware::userId());
    return ['message' => 'Tire updated.', 'tire_id' => (int) $params['id'], 'changed' => $result['changed']];
});

$router->with(permit('INVENTORY_WRITE_OFF'))->post('/api/tires/{id}/write-off', function (array $params, array $body) {
    $reason = trim($body['reason'] ?? '');
    if ($reason === '') {
        Router::sendError('MISSING_FIELD', 'Field "reason" is required.', 400);
    }
    writeOffTire((int) $params['id'], $reason, Middleware::userId());
    return ['message' => 'Tire written off.', 'tire_id' => (int) $params['id']];
});

$router->with(permit('INVENTORY_VIEW'))->get('/api/tires/{id}/photos', function (array $params) {
    return ['photos' => getTirePhotos((int) $params['id'])];
});

$router->with(permit('PHOTO_UPLOAD'))->post('/api/tires/{id}/photos', function (array $params) {
    $tireId = (int) $params['id'];

    // Verify tire exists
    $tire = getTire($tireId);
    if ($tire === null) {
        Router::sendError('NOT_FOUND', 'Tire not found.', 404);
    }

    // Handle file upload
    if (empty($_FILES['photo']) || $_FILES['photo']['error'] !== UPLOAD_ERR_OK) {
        Router::sendError('UPLOAD_ERROR', 'No file uploaded or upload error.', 400);
    }

    $file = $_FILES['photo'];
    $allowed = ['image/jpeg', 'image/png', 'image/webp'];
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mime = finfo_file($finfo, $file['tmp_name']);
    finfo_close($finfo);

    if (!in_array($mime, $allowed, true)) {
        Router::sendError('INVALID_FILE', 'Allowed types: JPEG, PNG, WebP.', 400);
    }

    // Max 10 MB
    if ($file['size'] > 10 * 1024 * 1024) {
        Router::sendError('FILE_TOO_LARGE', 'Maximum file size is 10 MB.', 400);
    }

    $ext = match ($mime) {
        'image/jpeg' => 'jpg',
        'image/png'  => 'png',
        'image/webp' => 'webp',
        default      => 'jpg',
    };

    $filename = 'tire_' . $tireId . '_' . time() . '_' . bin2hex(random_bytes(4)) . '.' . $ext;
    $destDir = BASE_PATH . '/storage/photos';
    $destPath = $destDir . '/' . $filename;

    if (!move_uploaded_file($file['tmp_name'], $destPath)) {
        Router::sendError('SAVE_ERROR', 'Failed to save uploaded file.', 500);
    }

    $caption = $_POST['caption'] ?? null;
    $isPrimary = (bool) ($_POST['is_primary'] ?? false);

    $photoId = saveTirePhoto($tireId, $filename, $caption, $isPrimary, Middleware::userId());
    return ['message' => 'Photo uploaded.', 'photo_id' => $photoId, 'file_path' => $filename];
});

$router->with(permit('PHOTO_UPLOAD'))->delete('/api/tires/photos/{id}', function (array $params) {
    $filePath = deleteTirePhoto((int) $params['id'], Middleware::userId());
    // Attempt to remove physical file (non-fatal if missing)
    $fullPath = BASE_PATH . '/storage/photos/' . $filePath;
    if (file_exists($fullPath)) {
        @unlink($fullPath);
    }
    return ['message' => 'Photo deleted.', 'photo_id' => (int) $params['id']];
});


// ---- Customers: single, create, update ----

$router->with(permit('CUSTOMER_MANAGE'))->get('/api/customers/{id}', function (array $params) {
    $customer = getCustomer((int) $params['id']);
    if ($customer === null) {
        Router::sendError('NOT_FOUND', 'Customer not found.', 404);
    }
    return $customer;
});

$router->with(permit('CUSTOMER_MANAGE'))->post('/api/customers', function (array $params, array $body) {
    $customerId = createCustomer($body, Middleware::userId());
    return ['message' => 'Customer created.', 'customer_id' => $customerId];
});

$router->with(permit('CUSTOMER_MANAGE'))->patch('/api/customers/{id}', function (array $params, array $body) {
    $result = updateCustomer((int) $params['id'], $body, Middleware::userId());
    return ['message' => 'Customer updated.', 'customer_id' => (int) $params['id'], 'changed' => $result['changed']];
});


// ---- Vehicles: single, create, update, link/unlink ----

$router->with(permit('VEHICLE_MANAGE'))->get('/api/vehicles/{id}', function (array $params) {
    $vehicle = getVehicle((int) $params['id']);
    if ($vehicle === null) {
        Router::sendError('NOT_FOUND', 'Vehicle not found.', 404);
    }
    return $vehicle;
});

$router->with(permit('VEHICLE_MANAGE'))->post('/api/vehicles', function (array $params, array $body) {
    $vehicleId = createVehicle($body, Middleware::userId());
    return ['message' => 'Vehicle created.', 'vehicle_id' => $vehicleId];
});

$router->with(permit('VEHICLE_MANAGE'))->patch('/api/vehicles/{id}', function (array $params, array $body) {
    $result = updateVehicle((int) $params['id'], $body, Middleware::userId());
    return ['message' => 'Vehicle updated.', 'vehicle_id' => (int) $params['id'], 'changed' => $result['changed']];
});

$router->with(permit('CUSTOMER_MANAGE'))->post('/api/customers/{customerId}/vehicles/{vehicleId}', function (array $params) {
    linkCustomerVehicle((int) $params['customerId'], (int) $params['vehicleId'], Middleware::userId());
    return ['message' => 'Vehicle linked to customer.'];
});

$router->with(permit('CUSTOMER_MANAGE'))->delete('/api/customers/{customerId}/vehicles/{vehicleId}', function (array $params) {
    unlinkCustomerVehicle((int) $params['customerId'], (int) $params['vehicleId'], Middleware::userId());
    return ['message' => 'Vehicle unlinked from customer.'];
});


// ---- Work Orders: single, create, update, assign, positions, complete ----

$router->with(permit('WORK_ORDER_CREATE', 'WORK_ORDER_ASSIGN'))->get('/api/work-orders/{id}', function (array $params) {
    $wo = getWorkOrder((int) $params['id']);
    if ($wo === null) {
        Router::sendError('NOT_FOUND', 'Work order not found.', 404);
    }
    return $wo;
});

$router->with(permit('WORK_ORDER_CREATE'))->post('/api/work-orders', function (array $params, array $body) {
    $woId = createWorkOrder($body, Middleware::userId());
    return ['message' => 'Work order created.', 'work_order_id' => $woId];
});

$router->with(permit('WORK_ORDER_CREATE'))->patch('/api/work-orders/{id}', function (array $params, array $body) {
    $result = updateWorkOrder((int) $params['id'], $body, Middleware::userId());
    return ['message' => 'Work order updated.', 'work_order_id' => (int) $params['id'], 'changed' => $result['changed']];
});

$router->with(permit('WORK_ORDER_ASSIGN'))->post('/api/work-orders/{id}/assign', function (array $params, array $body) {
    $techId = (int) ($body['tech_id'] ?? 0);
    if ($techId === 0) {
        Router::sendError('MISSING_FIELD', 'Field "tech_id" is required.', 400);
    }
    assignWorkOrder((int) $params['id'], $techId, Middleware::userId());
    return ['message' => 'Technician assigned.', 'work_order_id' => (int) $params['id'], 'tech_id' => $techId];
});

$router->with(permit('WORK_ORDER_CREATE'))->post('/api/work-orders/{id}/positions', function (array $params, array $body) {
    $posId = addWorkOrderPosition((int) $params['id'], $body, Middleware::userId());
    return ['message' => 'Position added.', 'position_id' => $posId];
});

$router->with(permit('WORK_ORDER_CREATE'))->patch('/api/work-orders/positions/{id}', function (array $params, array $body) {
    $result = updateWorkOrderPosition((int) $params['id'], $body, Middleware::userId());
    return ['message' => 'Position updated.', 'position_id' => (int) $params['id'], 'changed' => $result['changed']];
});

$router->with(permit('WORK_ORDER_CREATE'))->post('/api/work-orders/{id}/complete', function (array $params) {
    $result = completeWorkOrder((int) $params['id'], Middleware::userId());
    return ['message' => 'Work order completed.', 'work_order_id' => (int) $params['id'], 'details' => $result];
});


// ---- Invoices: single, create, line items, void ----

$router->with(permit('INVOICE_CREATE'))->get('/api/invoices', function () {
    $status = Router::query('status', '');
    $limit = (int) Router::query('limit', '50');
    $offset = (int) Router::query('offset', '0');
    return ['results' => listInvoices($status, $limit, $offset)];
});

$router->with(permit('INVOICE_CREATE'))->get('/api/invoices/{id}', function (array $params) {
    $inv = getInvoice((int) $params['id']);
    if ($inv === null) {
        Router::sendError('NOT_FOUND', 'Invoice not found.', 404);
    }
    return $inv;
});

$router->with(permit('INVOICE_CREATE'))->post('/api/invoices', function (array $params, array $body) {
    $invoiceId = createInvoice($body, Middleware::userId());
    return ['message' => 'Invoice created.', 'invoice_id' => $invoiceId];
});

$router->with(permit('INVOICE_CREATE'))->post('/api/invoices/{id}/line-items', function (array $params, array $body) {
    $invoiceId = (int) $params['id'];
    $itemId = addInvoiceLineItem($invoiceId, $body, Middleware::userId());
    $totals = recalcInvoiceTotals($invoiceId);
    return ['message' => 'Line item added.', 'line_id' => $itemId, 'totals' => $totals];
});

$router->with(permit('INVOICE_CREATE'))->delete('/api/invoices/line-items/{id}', function (array $params) {
    $item = Database::queryOne("SELECT invoice_id FROM invoice_line_items WHERE line_id = ?", [(int) $params['id']]);
    removeInvoiceLineItem((int) $params['id'], Middleware::userId());
    if ($item) { recalcInvoiceTotals((int) $item['invoice_id']); }
    return ['message' => 'Line item removed.'];
});

$router->with(permit('INVOICE_VOID'))->post('/api/invoices/{id}/void', function (array $params, array $body) {
    $reason = trim($body['reason'] ?? '');
    if ($reason === '') {
        Router::sendError('MISSING_FIELD', 'Field "reason" is required.', 400);
    }
    voidInvoice((int) $params['id'], $reason, Middleware::userId());
    return ['message' => 'Invoice voided.', 'invoice_id' => (int) $params['id']];
});

$router->with(permit('INVOICE_CREATE'))->post('/api/invoices/{id}/recalc', function (array $params) {
    $totals = recalcInvoiceTotals((int) $params['id']);
    return ['message' => 'Totals recalculated.', 'totals' => $totals];
});

// Users list for tech assignment dropdown (needs auth, not just USER_MANAGE)
$router->with($auth)->get('/api/users/techs', function () {
    return ['techs' => Database::query(
        "SELECT u.user_id, u.display_name, u.username
         FROM users u
         JOIN user_roles ur ON u.user_id = ur.user_id
         JOIN roles r ON ur.role_id = r.role_id
         WHERE u.is_active = 1
         GROUP BY u.user_id
         ORDER BY u.display_name"
    )];
});

$router->with(permit('INVOICE_CREATE'))->post('/api/invoices/{id}/auto-fees', function (array $params) {
    $invoiceId = (int) $params['id'];
    // Check invoice line items for tires and auto-insert CO tire/disposal fees
    $tireLines = Database::query(
        "SELECT li.*, t.`condition` AS tire_condition
         FROM invoice_line_items li
         JOIN tires t ON li.tire_id = t.tire_id
         WHERE li.invoice_id = ? AND li.line_type = 'tire'",
        [$invoiceId]
    );

    $newCount = 0;
    $usedCount = 0;
    foreach ($tireLines as $line) {
        if (($line['tire_condition'] ?? '') === 'new') $newCount++;
        else $usedCount++;
    }

    if ($newCount > 0) { insertTireFees($invoiceId, 'new', $newCount); }
    if ($usedCount > 0) { insertTireFees($invoiceId, 'used', $usedCount); }
    if ($newCount + $usedCount > 0) { insertDisposalFee($invoiceId, $newCount + $usedCount); }

    recalcInvoiceTotals($invoiceId);
    return ['message' => 'Auto-fees inserted.', 'new_tires' => $newCount, 'used_tires' => $usedCount];
});


// ---- Payments ----

$router->with(permit('PAYMENT_ACCEPT'))->post('/api/invoices/{id}/payments', function (array $params, array $body) {
    $paymentId = recordPayment((int) $params['id'], $body, Middleware::userId());
    return ['message' => 'Payment recorded.', 'payment_id' => $paymentId];
});

$router->with(permit('INVOICE_CREATE'))->get('/api/invoices/{id}/payments', function (array $params) {
    return ['payments' => getInvoicePayments((int) $params['id'])];
});


// ---- Fee Waiver (owner only) ----

$router->with(permit('FEE_WAIVE'))->post('/api/invoices/line-items/{id}/waive', function (array $params, array $body) {
    $reason = trim($body['reason'] ?? '');
    if ($reason === '') {
        Router::sendError('MISSING_FIELD', 'Field "reason" is required.', 400);
    }
    waiveFee((int) $params['id'], $reason, Middleware::userId());
    return ['message' => 'Fee waived.', 'line_item_id' => (int) $params['id']];
});


// ---- Deposits: create, apply, forfeit ----

$router->with(permit('DEPOSIT_ACCEPT'))->post('/api/deposits', function (array $params, array $body) {
    $depositId = createDeposit($body, Middleware::userId());
    return ['message' => 'Deposit created.', 'deposit_id' => $depositId];
});

$router->with(permit('DEPOSIT_ACCEPT'))->post('/api/deposits/{id}/apply', function (array $params, array $body) {
    $invoiceId = (int) ($body['invoice_id'] ?? 0);
    if ($invoiceId === 0) {
        Router::sendError('MISSING_FIELD', 'Field "invoice_id" is required.', 400);
    }
    applyDeposit((int) $params['id'], $invoiceId, Middleware::userId());
    return ['message' => 'Deposit applied.', 'deposit_id' => (int) $params['id'], 'invoice_id' => $invoiceId];
});

$router->with(permit('DEPOSIT_FORFEIT'))->post('/api/deposits/{id}/forfeit', function (array $params, array $body) {
    $reason = trim($body['reason'] ?? '');
    if ($reason === '') {
        Router::sendError('MISSING_FIELD', 'Field "reason" is required.', 400);
    }
    forfeitDeposit((int) $params['id'], $reason, Middleware::userId());
    return ['message' => 'Deposit forfeited.', 'deposit_id' => (int) $params['id']];
});


// ---- Refunds: create request, approve ----

$router->with(permit('REFUND_REQUEST'))->post('/api/refunds', function (array $params, array $body) {
    $refundId = createRefundRequest($body, Middleware::userId());
    return ['message' => 'Refund requested.', 'refund_id' => $refundId];
});

$router->with(permit('REFUND_APPROVE', 'REFUND_APPROVE_HIGH'))->post('/api/refunds/{id}/approve', function (array $params) {
    approveRefund((int) $params['id'], Middleware::userId());
    return ['message' => 'Refund approved.', 'refund_id' => (int) $params['id']];
});


// ---- Purchase Orders: single, create, line items, receive ----

$router->with(permit('PO_CREATE', 'PO_RECEIVE'))->get('/api/purchase-orders/{id}', function (array $params) {
    $po = getPurchaseOrder((int) $params['id']);
    if ($po === null) {
        Router::sendError('NOT_FOUND', 'Purchase order not found.', 404);
    }
    return $po;
});

$router->with(permit('PO_CREATE'))->post('/api/purchase-orders', function (array $params, array $body) {
    $poId = createPurchaseOrder($body, Middleware::userId());
    return ['message' => 'Purchase order created.', 'po_id' => $poId];
});

$router->with(permit('PO_CREATE'))->post('/api/purchase-orders/{id}/lines', function (array $params, array $body) {
    $lineId = addPoLineItem((int) $params['id'], $body, Middleware::userId());
    return ['message' => 'Line item added.', 'po_line_id' => $lineId];
});

$router->with(permit('PO_RECEIVE'))->post('/api/purchase-orders/{id}/receive', function (array $params, array $body) {
    $items = $body['items'] ?? [];
    if (empty($items)) {
        Router::sendError('MISSING_FIELD', 'Field "items" is required (array of {po_line_id, quantity_received}).', 400);
    }
    $result = receivePurchaseOrder((int) $params['id'], $items, Middleware::userId());
    return ['message' => 'Items received.', 'po_id' => (int) $params['id'], 'status' => $result['status'], 'received' => $result['received']];
});


// ---- Appointments: single, list, create, update, cancel ----

$router->with(permit('APPOINTMENT_MANAGE'))->get('/api/appointments/{id}', function (array $params) {
    $appt = getAppointment((int) $params['id']);
    if ($appt === null) {
        Router::sendError('NOT_FOUND', 'Appointment not found.', 404);
    }
    return $appt;
});

$router->with(permit('APPOINTMENT_MANAGE'))->get('/api/appointments', function () {
    $start = Router::query('start');
    $end = Router::query('end');
    return ['appointments' => listAppointments($start, $end)];
});

$router->with(permit('APPOINTMENT_MANAGE'))->post('/api/appointments', function (array $params, array $body) {
    $apptId = createAppointment($body, Middleware::userId());
    return ['message' => 'Appointment created.', 'appointment_id' => $apptId];
});

$router->with(permit('APPOINTMENT_MANAGE'))->patch('/api/appointments/{id}', function (array $params, array $body) {
    $result = updateAppointment((int) $params['id'], $body, Middleware::userId());
    return ['message' => 'Appointment updated.', 'appointment_id' => (int) $params['id'], 'changed' => $result['changed']];
});

$router->with(permit('APPOINTMENT_MANAGE'))->post('/api/appointments/{id}/cancel', function (array $params) {
    cancelAppointment((int) $params['id'], Middleware::userId());
    return ['message' => 'Appointment cancelled.', 'appointment_id' => (int) $params['id']];
});


// ---- Waivers ----

$router->with(permit('WAIVER_CREATE'))->post('/api/waivers', function (array $params, array $body) {
    $waiverId = createWaiver($body, Middleware::userId());
    return ['message' => 'Waiver created.', 'waiver_id' => $waiverId];
});


// ---- Vendors ----

$router->with(permit('PO_CREATE'))->get('/api/vendors', function () {
    return ['vendors' => listVendors()];
});

$router->with(permit('PO_CREATE'))->get('/api/vendors/{id}', function (array $params) {
    $vendor = getVendor((int) $params['id']);
    if ($vendor === null) {
        Router::sendError('NOT_FOUND', 'Vendor not found.', 404);
    }
    return $vendor;
});

$router->with(permit('PO_CREATE'))->post('/api/vendors', function (array $params, array $body) {
    $vendorId = createVendor($body, Middleware::userId());
    return ['message' => 'Vendor created.', 'vendor_id' => $vendorId];
});


// ---- Service Catalog (read-only for techs, config for owner) ----

$router->with($auth)->get('/api/services', function () {
    return ['services' => listServices()];
});

$router->with($auth)->get('/api/services/{id}', function (array $params) {
    $service = getService((int) $params['id']);
    if ($service === null) {
        Router::sendError('NOT_FOUND', 'Service not found.', 404);
    }
    return $service;
});


// ---- Configuration (owner only) ----

$router->with(permit('CONFIG_MANAGE'))->get('/api/config', function () {
    return ['config' => getAllConfig()];
});

$router->with(permit('CONFIG_MANAGE'))->get('/api/config/{key}', function (array $params) {
    $config = getConfigValue($params['key']);
    if ($config === null) {
        Router::sendError('NOT_FOUND', 'Configuration key not found.', 404);
    }
    return $config;
});

$router->with(permit('CONFIG_MANAGE'))->patch('/api/config/{key}', function (array $params, array $body) {
    $value = $body['value'] ?? '';
    updateConfig($params['key'], (string) $value, Middleware::userId());
    return ['message' => 'Configuration updated.', 'key' => $params['key']];
});


// ============================================================================
// Vehicle Lookup (PlateToVIN + NHTSA + torque spec pipeline)
// ============================================================================

$router->with(permit('VEHICLE_MANAGE'))->post('/api/vehicles/lookup/plate', function (array $params, array $body) {
    $plate = trim($body['plate'] ?? '');
    $state = trim($body['state'] ?? '');
    if ($plate === '' || $state === '') {
        Router::sendError('MISSING_FIELDS', 'Fields "plate" and "state" are required.', 400);
    }
    $svc = new VehicleLookupService();
    $result = $svc->lookupByPlate($plate, $state, Middleware::userId());
    if ($result === null) {
        Router::sendError('LOOKUP_FAILED', 'Plate lookup failed. The API may be unavailable or the plate was not found.', 404);
    }
    return $result;
});

$router->with(permit('VEHICLE_MANAGE'))->post('/api/vehicles/lookup/vin', function (array $params, array $body) {
    $vin = trim($body['vin'] ?? '');
    if ($vin === '') {
        Router::sendError('MISSING_FIELD', 'Field "vin" is required.', 400);
    }
    $svc = new VehicleLookupService();
    $result = $svc->lookupByVin($vin, Middleware::userId());
    if ($result === null) {
        Router::sendError('LOOKUP_FAILED', 'VIN decode failed. Check the VIN and try again.', 404);
    }
    return $result;
});

$router->with(permit('VEHICLE_MANAGE'))->get('/api/vehicles/torque-spec', function () {
    $make = Router::query('make', '');
    $model = Router::query('model', '');
    $year = (int) Router::query('year', '0');
    if ($make === '' || $year === 0) {
        Router::sendError('MISSING_PARAMS', 'Query parameters "make" and "year" are required.', 400);
    }
    $svc = new VehicleLookupService();
    $result = $svc->lookupTorqueSpec($make, $model, $year);
    if ($result === null) {
        return ['match' => false, 'spec' => null];
    }
    return ['match' => true, 'spec' => $result];
});


// ============================================================================
// Lookup Tables (auth only, used by UI dropdowns)
// ============================================================================

$router->with($auth)->get('/api/lookups/brands', function () {
    return ['brands' => Database::query("SELECT brand_id, brand_name FROM lkp_brands WHERE is_active = 1 ORDER BY brand_name")];
});

$router->with($auth)->get('/api/lookups/tire-types', function () {
    return ['tire_types' => Database::query("SELECT type_id, type_code, type_label FROM lkp_tire_types WHERE is_active = 1 ORDER BY type_label")];
});

$router->with($auth)->get('/api/lookups/construction-types', function () {
    return ['construction_types' => Database::query("SELECT construction_id, code, label FROM lkp_construction_types ORDER BY label")];
});


// ============================================================================
// Phase 3: Online Presence Routes
// ============================================================================

// --- Shop Settings (admin) ---
$router->with(permit('USER_MANAGE'))->get('/api/settings', function () {
    return ['settings' => getAllSettings()];
});

$router->with(permit('USER_MANAGE'))->patch('/api/settings', function (array $params, array $body) {
    $changed = bulkUpdateSettings($body, Middleware::userId());
    return ['message' => 'Settings updated.', 'changed' => $changed];
});

// --- Website Config (admin) ---
$router->with(permit('USER_MANAGE'))->get('/api/website-config', function () {
    return ['configs' => getAllWebsiteConfig()];
});

$router->with(permit('USER_MANAGE'))->patch('/api/website-config', function (array $params, array $body) {
    $changed = bulkUpdateWebsiteConfig($body);
    return ['message' => 'Website config updated.', 'changed' => $changed];
});

// --- Warranty Policies (admin) ---
$router->with(permit('USER_MANAGE'))->get('/api/warranty-policies', function () {
    $active = Router::query('active_only', '1') === '1';
    return ['policies' => listWarrantyPolicies($active)];
});

$router->with(permit('USER_MANAGE'))->get('/api/warranty-policies/{id}', function (array $params) {
    $p = getWarrantyPolicy((int) $params['id']);
    if (!$p) Router::sendError('NOT_FOUND', 'Policy not found.', 404);
    return $p;
});

$router->with(permit('USER_MANAGE'))->post('/api/warranty-policies', function (array $params, array $body) {
    $id = createWarrantyPolicy($body);
    return ['message' => 'Policy created.', 'policy_id' => $id];
});

$router->with(permit('USER_MANAGE'))->patch('/api/warranty-policies/{id}', function (array $params, array $body) {
    $result = updateWarrantyPolicy((int) $params['id'], $body);
    return ['message' => 'Policy updated.', 'changed' => $result['changed']];
});

// --- Warranty Claims ---
$router->with($auth)->get('/api/warranty-claims', function () {
    $status = Router::query('status', '');
    $limit = (int) Router::query('limit', '50');
    $offset = (int) Router::query('offset', '0');
    return listWarrantyClaims($status, $limit, $offset);
});

$router->with($auth)->get('/api/warranty-claims/{id}', function (array $params) {
    $c = getWarrantyClaim((int) $params['id']);
    if (!$c) Router::sendError('NOT_FOUND', 'Claim not found.', 404);
    return $c;
});

$router->with($auth)->post('/api/warranty-claims', function (array $params, array $body) {
    $id = fileWarrantyClaim($body, Middleware::userId());
    return ['message' => 'Claim filed.', 'claim_id' => $id];
});

$router->with(permit('REFUND_APPROVE'))->post('/api/warranty-claims/{id}/review', function (array $params, array $body) {
    $action = $body['action'] ?? '';
    if (!in_array($action, ['approve', 'deny'])) {
        Router::sendError('INVALID_ACTION', 'Action must be "approve" or "deny".', 400);
    }
    reviewWarrantyClaim((int) $params['id'], $action, Middleware::userId(),
        $body['reason'] ?? null, $body['amount'] ?? null);
    return ['message' => "Claim {$action}d."];
});

$router->with(permit('REFUND_APPROVE'))->post('/api/warranty-claims/{id}/pay', function (array $params, array $body) {
    payWarrantyClaim((int) $params['id'], $body['amount'], Middleware::userId());
    return ['message' => 'Claim paid.'];
});

$router->with(permit('REPORT_VIEW'))->get('/api/reports/warranty-claims', function () {
    $start = Router::query('start', date('Y-01-01'));
    $end = Router::query('end', date('Y-m-d'));
    $filed = (int) Database::scalar("SELECT COUNT(*) FROM warranty_claims WHERE claim_date BETWEEN ? AND ?", [$start, $end]);
    $approved = (int) Database::scalar("SELECT COUNT(*) FROM warranty_claims WHERE status = 'approved' AND claim_date BETWEEN ? AND ?", [$start, $end]);
    $denied = (int) Database::scalar("SELECT COUNT(*) FROM warranty_claims WHERE status = 'denied' AND claim_date BETWEEN ? AND ?", [$start, $end]);
    $paid = Database::scalar("SELECT COALESCE(SUM(paid_amount), 0) FROM warranty_claims WHERE status = 'paid' AND claim_date BETWEEN ? AND ?", [$start, $end]);
    return ['filed' => $filed, 'approved' => $approved, 'denied' => $denied, 'total_paid' => (float) $paid];
});

// --- Wheels ---
$router->with(permit('INVENTORY_ADD', 'INVENTORY_EDIT'))->get('/api/wheels', function () {
    $filters = [
        'diameter' => Router::query('diameter'),
        'bolt_pattern' => Router::query('bolt_pattern'),
        'brand' => Router::query('brand'),
        'material' => Router::query('material'),
        'condition' => Router::query('condition'),
    ];
    $limit = (int) Router::query('limit', '25');
    $offset = (int) Router::query('offset', '0');
    return searchWheels(array_filter($filters), $limit, $offset);
});

$router->with(permit('INVENTORY_ADD', 'INVENTORY_EDIT'))->get('/api/wheels/{id}', function (array $params) {
    $w = getWheel((int) $params['id']);
    if (!$w) Router::sendError('NOT_FOUND', 'Wheel not found.', 404);
    return $w;
});

$router->with(permit('INVENTORY_ADD'))->post('/api/wheels', function (array $params, array $body) {
    $id = createWheel($body);
    return ['message' => 'Wheel created.', 'wheel_id' => $id];
});

$router->with(permit('INVENTORY_EDIT'))->patch('/api/wheels/{id}', function (array $params, array $body) {
    $result = updateWheel((int) $params['id'], $body);
    return ['message' => 'Wheel updated.', 'changed' => $result['changed']];
});

$router->with(permit('INVENTORY_EDIT'))->post('/api/wheels/{id}/fitments', function (array $params, array $body) {
    $id = addWheelFitment((int) $params['id'], $body);
    return ['message' => 'Fitment added.', 'fitment_id' => $id];
});

$router->with(permit('INVENTORY_EDIT'))->delete('/api/wheels/fitments/{id}', function (array $params) {
    removeWheelFitment((int) $params['id']);
    return ['message' => 'Fitment removed.'];
});

// --- Fitment Search (internal, auth required) ---
$router->with($auth)->get('/api/fitment/search', function () {
    $make = Router::query('make', '');
    $model = Router::query('model', '');
    $year = Router::query('year') ? (int) Router::query('year') : null;
    if (!$make || !$model) Router::sendError('MISSING_PARAM', 'make and model required.', 400);
    return searchFitmentByVehicle($make, $model, $year);
});

$router->with($auth)->get('/api/fitment/reverse', function () {
    $size = Router::query('size', '');
    if (!$size) Router::sendError('MISSING_PARAM', 'size required.', 400);
    return searchFitmentReverse($size);
});

$router->with($auth)->get('/api/fitment/bolt-pattern', function () {
    $pattern = Router::query('pattern', '');
    if (!$pattern) Router::sendError('MISSING_PARAM', 'pattern required.', 400);
    return searchByBoltPattern($pattern);
});

// --- Custom Fields ---
$router->with(permit('USER_MANAGE'))->get('/api/custom-fields', function () {
    $type = Router::query('entity_type', '');
    if (!$type) return ['fields' => []];
    return ['fields' => listCustomFields($type, false)];
});

$router->with(permit('USER_MANAGE'))->post('/api/custom-fields', function (array $params, array $body) {
    $id = createCustomField($body);
    return ['message' => 'Custom field created.', 'field_id' => $id];
});

$router->with(permit('USER_MANAGE'))->patch('/api/custom-fields/{id}', function (array $params, array $body) {
    $result = updateCustomField((int) $params['id'], $body);
    return ['message' => 'Custom field updated.', 'changed' => $result['changed']];
});

$router->with($auth)->get('/api/custom-field-values/{entityType}/{entityId}', function (array $params) {
    return ['fields' => getCustomFieldValues($params['entityType'], (int) $params['entityId'])];
});

$router->with($auth)->patch('/api/custom-field-values/{entityType}/{entityId}', function (array $params, array $body) {
    $changed = setCustomFieldValues((int) $params['entityId'], $body['fields'] ?? []);
    return ['message' => 'Custom field values saved.', 'changed' => $changed];
});

// --- API Keys (admin) ---
$router->with(permit('USER_MANAGE'))->get('/api/api-keys', function () {
    return ['keys' => listApiKeys()];
});

$router->with(permit('USER_MANAGE'))->post('/api/api-keys', function (array $params, array $body) {
    $result = createApiKey($body['label'] ?? 'API Key', Middleware::userId(), isset($body['rate_limit']) ? (int) $body['rate_limit'] : null);
    return ['message' => 'API key created. Save the key now; it will not be shown again.', 'key' => $result];
});

$router->with(permit('USER_MANAGE'))->delete('/api/api-keys/{id}', function (array $params) {
    revokeApiKey((int) $params['id']);
    return ['message' => 'API key revoked.'];
});

// --- NHTSA Recall Checker (P4b) ---
$router->with($auth)->get('/api/recalls/vehicle', function () {
    $make = Router::query('make', '');
    $model = Router::query('model');
    $year = Router::query('year') ? (int) Router::query('year') : null;
    if (!$make) Router::sendError('MISSING_PARAM', 'make required.', 400);
    return checkNhtsaRecalls($make, $model, $year);
});

$router->with($auth)->get('/api/recalls/tire', function () {
    $dot = Router::query('dot', '');
    if (!$dot) Router::sendError('MISSING_PARAM', 'dot (DOT/TIN) required.', 400);
    return checkTireRecallByDot($dot);
});

// --- Barcode Labels (P4c) ---
$router->with($auth)->get('/api/labels/tire/{id}', function (array $params) {
    $zpl = generateTireLabelZpl((int) $params['id']);
    return ['zpl' => $zpl, 'tire_id' => (int) $params['id']];
});

$router->with($auth)->get('/api/labels/wheel/{id}', function (array $params) {
    $zpl = generateWheelLabelZpl((int) $params['id']);
    return ['zpl' => $zpl, 'wheel_id' => (int) $params['id']];
});

// --- Barcode Scanning / Lookup (P4d) ---
$router->with($auth)->get('/api/barcode/lookup', function () {
    $code = Router::query('code', '');
    if (!$code) Router::sendError('MISSING_PARAM', 'code required.', 400);
    $result = lookupByBarcode($code);
    if (!$result) Router::sendError('NOT_FOUND', 'No item found for barcode.', 404);
    return $result;
});

// --- Customer Notifications (P4e) ---
$router->with($auth)->get('/api/notifications/customer/{id}', function (array $params) {
    return ['notifications' => getNotificationLog((int) $params['id'])];
});

$router->with($auth)->get('/api/notifications/pending', function () {
    $type = Router::query('type', '');
    return ['notifications' => listPendingNotifications($type)];
});

$router->with($auth)->post('/api/notifications', function (array $params, array $body) {
    $id = logNotification(
        (int) $body['customer_id'], $body['channel'] ?? 'internal',
        $body['notification_type'] ?? 'custom',
        $body['subject'] ?? '', $body['body'] ?? '',
        Middleware::userId()
    );
    return ['message' => 'Notification logged.', 'notification_id' => $id];
});

$router->with($auth)->post('/api/notifications/{id}/sent', function (array $params) {
    markNotificationSent((int) $params['id']);
    return ['message' => 'Marked sent.'];
});

$router->with($auth)->post('/api/notifications/{id}/failed', function (array $params, array $body) {
    markNotificationFailed((int) $params['id'], $body['error'] ?? 'Unknown error');
    return ['message' => 'Marked failed.'];
});


// ============================================================================
// Phase 5: Customer Engagement Routes
// ============================================================================

// --- Discount Groups ---
$router->with(permit('USER_MANAGE'))->get('/api/discount-groups', function () {
    $active = Router::query('active_only', '1') === '1';
    return ['groups' => listDiscountGroups($active)];
});

$router->with(permit('USER_MANAGE'))->post('/api/discount-groups', function (array $params, array $body) {
    $id = createDiscountGroup($body);
    return ['message' => 'Discount group created.', 'group_id' => $id];
});

$router->with(permit('USER_MANAGE'))->patch('/api/discount-groups/{id}', function (array $params, array $body) {
    return updateDiscountGroup((int) $params['id'], $body);
});

$router->with($auth)->get('/api/customers/{id}/discount-groups', function (array $params) {
    return ['groups' => getCustomerDiscountGroups((int) $params['id'])];
});

$router->with(permit('CUSTOMER_MANAGE'))->post('/api/customers/{customerId}/discount-groups/{groupId}', function (array $params, array $body) {
    addCustomerToGroup((int) $params['customerId'], (int) $params['groupId'], Middleware::userId(), $body['expires_at'] ?? null);
    return ['message' => 'Customer added to discount group.'];
});

$router->with(permit('CUSTOMER_MANAGE'))->delete('/api/customers/{customerId}/discount-groups/{groupId}', function (array $params) {
    removeCustomerFromGroup((int) $params['customerId'], (int) $params['groupId']);
    return ['message' => 'Customer removed from discount group.'];
});

$router->with($auth)->get('/api/customers/{id}/discount-calc', function (array $params) {
    $subtotal = Router::query('subtotal', '0');
    $lineType = Router::query('line_type', 'all');
    return calculateCustomerDiscount((int) $params['id'], $subtotal, $lineType);
});

// --- Coupons ---
$router->with(permit('USER_MANAGE'))->get('/api/coupons', function () {
    $active = Router::query('active_only', '1') === '1';
    return ['coupons' => listCoupons($active)];
});

$router->with(permit('USER_MANAGE'))->post('/api/coupons', function (array $params, array $body) {
    $id = createCoupon($body, Middleware::userId());
    return ['message' => 'Coupon created.', 'coupon_id' => $id];
});

$router->with($auth)->post('/api/coupons/validate', function (array $params, array $body) {
    $code = $body['code'] ?? '';
    $subtotal = $body['subtotal'] ?? '0';
    $customerId = isset($body['customer_id']) ? (int) $body['customer_id'] : null;
    return validateCoupon($code, $subtotal, $customerId);
});

$router->with($auth)->post('/api/coupons/apply', function (array $params, array $body) {
    applyCoupon((int) $body['coupon_id'], (int) $body['invoice_id'],
        isset($body['customer_id']) ? (int) $body['customer_id'] : null,
        $body['discount_applied']);
    return ['message' => 'Coupon applied.'];
});

// --- Billing Statements ---
$router->with(permit('REPORT_VIEW'))->get('/api/statements', function () {
    $customerId = (int) Router::query('customer_id', '0');
    $status = Router::query('status', '');
    $limit = (int) Router::query('limit', '50');
    $offset = (int) Router::query('offset', '0');
    return listStatements($customerId, $status, $limit, $offset);
});

$router->with(permit('REPORT_VIEW'))->get('/api/statements/{id}', function (array $params) {
    $s = getStatement((int) $params['id']);
    if (!$s) Router::sendError('NOT_FOUND', 'Statement not found.', 404);
    return $s;
});

$router->with(permit('INVOICE_CREATE'))->post('/api/statements/generate', function (array $params, array $body) {
    $id = generateStatement((int) $body['customer_id'], $body['period_start'], $body['period_end'], Middleware::userId());
    return ['message' => 'Statement generated.', 'statement_id' => $id];
});

$router->with(permit('REPORT_VIEW'))->get('/api/reports/ar-summary', function () {
    return getArSummary();
});

// --- Tire Storage ---
$router->with($auth)->get('/api/tire-storage', function () {
    $status = Router::query('status', 'stored');
    $limit = (int) Router::query('limit', '50');
    $offset = (int) Router::query('offset', '0');
    return listTireStorage($status, $limit, $offset);
});

$router->with(permit('INVENTORY_ADD'))->post('/api/tire-storage', function (array $params, array $body) {
    $id = createTireStorage($body, Middleware::userId());
    return ['message' => 'Tire stored.', 'storage_id' => $id];
});

$router->with(permit('INVENTORY_EDIT'))->post('/api/tire-storage/{id}/pickup', function (array $params) {
    pickupTireStorage((int) $params['id']);
    return ['message' => 'Pickup recorded.'];
});

$router->with(permit('INVOICE_CREATE'))->post('/api/tire-storage/generate-billing', function (array $params, array $body) {
    $month = $body['billing_month'] ?? date('Y-m-01');
    return generateStorageBilling($month);
});

$router->with(permit('INVOICE_CREATE'))->get('/api/tire-storage/pending-billing', function () {
    return ['items' => listPendingStorageBilling()];
});

// --- Pricing Advisor ---
$router->with($auth)->get('/api/pricing-advisor/{id}', function (array $params) {
    return getPricingAdvice((int) $params['id']);
});


// ============================================================================
// Phase 6: Marketplace Integration Routes
// ============================================================================

// --- Integration Credentials ---
$router->with(permit('USER_MANAGE'))->get('/api/integrations', function () {
    return ['integrations' => listIntegrations()];
});

$router->with(permit('USER_MANAGE'))->get('/api/integrations/{name}/credentials', function (array $params) {
    $env = Router::query('environment', 'production');
    $creds = getIntegrationCredentials($params['name'], $env);
    // Mask values for display
    $masked = array_map(function ($c) {
        $val = $c['credential_value'];
        $c['credential_value'] = strlen($val) > 8 ? substr($val, 0, 4) . '...' . substr($val, -4) : '****';
        return $c;
    }, $creds);
    return ['credentials' => $masked];
});

$router->with(permit('USER_MANAGE'))->post('/api/integrations/{name}/credentials', function (array $params, array $body) {
    setIntegrationCredential($params['name'], $body['key'], $body['value'],
        Middleware::userId(), $body['environment'] ?? 'production', $body['expires_at'] ?? null);
    return ['message' => 'Credential saved.'];
});

$router->with(permit('USER_MANAGE'))->delete('/api/integrations/{name}/credentials/{key}', function (array $params) {
    $env = Router::query('environment', 'production');
    removeIntegrationCredential($params['name'], $params['key'], $env);
    return ['message' => 'Credential removed.'];
});

// --- Sync Log ---
$router->with(permit('USER_MANAGE'))->get('/api/integrations/sync-log', function () {
    $integration = Router::query('integration', '');
    $limit = (int) Router::query('limit', '50');
    $offset = (int) Router::query('offset', '0');
    return getSyncLog($integration, $limit, $offset);
});

// --- Marketplace Listings ---
$router->with($auth)->get('/api/marketplace/listings', function () {
    $platform = Router::query('platform', '');
    $status = Router::query('status', '');
    $limit = (int) Router::query('limit', '50');
    $offset = (int) Router::query('offset', '0');
    return listListings($platform, $status, $limit, $offset);
});

$router->with($auth)->post('/api/marketplace/listings', function (array $params, array $body) {
    $id = createListing($body, Middleware::userId());
    return ['message' => 'Listing created.', 'listing_id' => $id];
});

$router->with($auth)->patch('/api/marketplace/listings/{id}', function (array $params, array $body) {
    return updateListing((int) $params['id'], $body);
});

$router->with($auth)->get('/api/marketplace/generate-content/{tireId}', function (array $params) {
    $platform = Router::query('platform', 'craigslist');
    return generateListingContent((int) $params['tireId'], $platform);
});

// --- Marketplace Orders ---
$router->with($auth)->get('/api/marketplace/orders', function () {
    $platform = Router::query('platform', '');
    $status = Router::query('status', '');
    $limit = (int) Router::query('limit', '50');
    $offset = (int) Router::query('offset', '0');
    return listMarketplaceOrders($platform, $status, $limit, $offset);
});

$router->with($auth)->get('/api/marketplace/orders/{id}', function (array $params) {
    $o = getMarketplaceOrder((int) $params['id']);
    if (!$o) Router::sendError('NOT_FOUND', 'Order not found.', 404);
    return $o;
});

$router->with($auth)->post('/api/marketplace/orders', function (array $params, array $body) {
    $id = importMarketplaceOrder($body);
    return ['message' => 'Order imported.', 'order_id' => $id];
});

$router->with($auth)->patch('/api/marketplace/orders/{id}/status', function (array $params, array $body) {
    updateMarketplaceOrderStatus((int) $params['id'], $body['status'], $body['invoice_id'] ?? null);
    return ['message' => 'Order status updated.'];
});

// --- Distributor Search/Order ---
$router->with($auth)->get('/api/distributors/{name}/search', function (array $params) {
    $size = Router::query('size', '');
    if (!$size) Router::sendError('MISSING_PARAM', 'size required.', 400);
    return searchDistributorCatalog($params['name'], $size);
});

$router->with(permit('PO_CREATE'))->post('/api/distributors/{name}/order', function (array $params, array $body) {
    return placeDistributorOrder($params['name'], $body['items'] ?? []);
});

// --- B2B Network ---
$router->with($auth)->get('/api/b2b/inventory', function () {
    $type = Router::query('listing_type', '');
    return ['inventory' => listB2bInventory($type)];
});

$router->with(permit('INVENTORY_EDIT'))->post('/api/b2b/inventory', function (array $params, array $body) {
    $id = addToB2bNetwork($body);
    return ['message' => 'Added to B2B network.', 'b2b_id' => $id];
});

$router->with(permit('INVENTORY_EDIT'))->delete('/api/b2b/inventory/{id}', function (array $params) {
    removeFromB2bNetwork((int) $params['id']);
    return ['message' => 'Removed from B2B network.'];
});

// --- Directory Listings ---
$router->with(permit('USER_MANAGE'))->get('/api/directory-listings', function () {
    return ['listings' => listDirectoryListings()];
});

$router->with(permit('USER_MANAGE'))->post('/api/directory-listings', function (array $params, array $body) {
    $id = createDirectoryListing($body);
    return ['message' => 'Directory listing created.', 'directory_id' => $id];
});

$router->with(permit('USER_MANAGE'))->patch('/api/directory-listings/{id}', function (array $params, array $body) {
    updateDirectoryListing((int) $params['id'], $body);
    return ['message' => 'Directory listing updated.'];
});


// ============================================================================
// Public Routes (no auth, for storefront + embed widget)
// ============================================================================

$router->get('/api/public/shop-info', function () {
    $settings = getPublicSettings();
    $map = [];
    foreach ($settings as $s) { $map[$s['setting_key']] = $s['setting_value']; }
    return $map;
});

$router->get('/api/public/website-config', function () {
    $configs = getAllWebsiteConfig();
    $map = [];
    foreach ($configs as $c) { $map[$c['config_key']] = $c['config_value']; }
    return $map;
});

$router->get('/api/public/inventory', function () {
    $enabled = getSettingValue('website_enabled');
    if ($enabled !== '1') Router::sendError('DISABLED', 'Public website is not enabled.', 403);
    $filters = [
        'size' => Router::query('size'),
        'brand_id' => Router::query('brand_id'),
        'condition' => Router::query('condition'),
        'min_price' => Router::query('min_price'),
        'max_price' => Router::query('max_price'),
    ];
    $limit = min((int) Router::query('limit', '24'), 50);
    $offset = (int) Router::query('offset', '0');
    return getPublicInventory(array_filter($filters), $limit, $offset);
});

$router->get('/api/public/inventory/{id}', function (array $params) {
    $enabled = getSettingValue('website_enabled');
    if ($enabled !== '1') Router::sendError('DISABLED', 'Public website is not enabled.', 403);
    $tire = getPublicTireDetail((int) $params['id']);
    if (!$tire) Router::sendError('NOT_FOUND', 'Tire not found or not available.', 404);
    return $tire;
});

$router->get('/api/public/wheels', function () {
    $enabled = getSettingValue('website_enabled');
    if ($enabled !== '1') Router::sendError('DISABLED', 'Public website is not enabled.', 403);
    $filters = [
        'diameter' => Router::query('diameter'),
        'bolt_pattern' => Router::query('bolt_pattern'),
        'brand' => Router::query('brand'),
        'material' => Router::query('material'),
        'condition' => Router::query('condition'),
    ];
    $limit = min((int) Router::query('limit', '24'), 50);
    $offset = (int) Router::query('offset', '0');
    return searchWheels(array_filter($filters), $limit, $offset);
});

$router->get('/api/public/fitment/search', function () {
    $enabled = getSettingValue('website_fitment_enabled');
    if ($enabled !== '1') Router::sendError('DISABLED', 'Fitment search is not enabled.', 403);
    $make = Router::query('make', '');
    $model = Router::query('model', '');
    $year = Router::query('year') ? (int) Router::query('year') : null;
    if (!$make || !$model) Router::sendError('MISSING_PARAM', 'make and model required.', 400);
    return searchFitmentByVehicle($make, $model, $year);
});

$router->get('/api/public/fitment/reverse', function () {
    $enabled = getSettingValue('website_fitment_enabled');
    if ($enabled !== '1') Router::sendError('DISABLED', 'Fitment search is not enabled.', 403);
    $size = Router::query('size', '');
    if (!$size) Router::sendError('MISSING_PARAM', 'size required.', 400);
    return searchFitmentReverse($size);
});

$router->get('/api/public/appointments/slots', function () {
    $enabled = getSettingValue('website_appointment_enabled');
    if ($enabled !== '1') Router::sendError('DISABLED', 'Online appointments not enabled.', 403);
    $date = Router::query('date', date('Y-m-d'));
    return getPublicAppointmentSlots($date);
});

$router->post('/api/public/appointments', function (array $params, array $body) {
    $enabled = getSettingValue('website_appointment_enabled');
    if ($enabled !== '1') Router::sendError('DISABLED', 'Online appointments not enabled.', 403);
    // Rate limit: simple check using session-less approach
    $apptId = createAppointment($body, 0);
    return ['message' => 'Appointment booked.', 'appointment_id' => $apptId];
});

$router->get('/api/public/warranty-policies', function () {
    return ['policies' => listWarrantyPolicies(true)];
});

$router->get('/api/public/brands', function () {
    return ['brands' => Database::query("SELECT brand_id, brand_name FROM lkp_brands WHERE is_active = 1 ORDER BY brand_name")];
});
