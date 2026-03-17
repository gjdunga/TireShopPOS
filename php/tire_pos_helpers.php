<?php
/**
 * ============================================================================
 * TireShopPOS: Core Helpers and Business Logic
 * ============================================================================
 *
 * Loaded on EVERY request. Contains foundational functions used across
 * the entire application including auth helpers, audit/activity logging,
 * validation, tire parsing, waiver detection, and report queries.
 *
 * Function groups:
 *   1. Database bridge     getDB()
 *   2. Audit and activity  auditLog(), logActivity()
 *   3. Auth helpers        isPasswordReused(), isPasswordExpired(),
 *                          recordFailedLogin(), recordSuccessfulLogin(),
 *                          getUserPermissions(), hasPermission()
 *   4. Tire parsing        parseTireSize(), parseDotTin(), calculateTireAge(),
 *                          isTireAged(), detectWaiversNeeded()
 *   5. Waiver templates    getWaiverTemplate(), createWaiver()
 *   6. Sequence numbers    nextSequence(), nextWorkOrderNumber(), nextPONumber()
 *   7. Work order logic    canCompleteWorkOrder(), getRetorqueDueList(),
 *                          scheduleRetorque(), completeRetorque()
 *   8. Vehicle helpers     getWheelPositions()
 *   9. Report queries      getQuarterlyFeeReport(), getServiceUsageReport(),
 *                          getEmployeeActivity(), getSalesSummary(),
 *                          getInventoryStats(), getTopSellingTires(), etc.
 *
 * Dependencies: App\Core\Database (singleton PDO wrapper)
 * Called by:    routes/api.php, tire_pos_crud.php, app/Http/Auth.php
 *
 * DunganSoft Technologies, March 2026
 * ============================================================================
 */

// ============================================================================
// 1. DATABASE CONNECTION
// ============================================================================

/**
 * Returns a singleton PDO connection.
 *
 * When running inside the framework (App\Core\Database is loaded), delegates
 * to Database::pdo() so all code shares one connection with consistent
 * config (strict mode, timezone, FOUND_ROWS). Falls back to standalone
 * connection for any use outside the framework.
 *
 * DunganSoft Technologies, March 2026
 */
function getDB(): PDO {
    // Framework bridge: use the shared PDO singleton
    if (class_exists('App\Core\Database', false)) {
        return \App\Core\Database::pdo();
    }

    // Standalone fallback (original implementation)
    static $pdo = null;
    if ($pdo === null) {
        $host = getenv('DB_HOST') ?: '127.0.0.1';
        $name = getenv('DB_NAME') ?: 'tire_pos';
        $user = getenv('DB_USER') ?: 'tire_app';
        $pass = getenv('DB_PASS') ?: '';
        $port = getenv('DB_PORT') ?: '3306';

        $dsn = "mysql:host={$host};port={$port};dbname={$name};charset=utf8mb4";
        $pdo = new PDO($dsn, $user, $pass, [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
            PDO::MYSQL_ATTR_FOUND_ROWS   => true,
        ]);
    }
    return $pdo;
}


// ============================================================================
// 2. TIRE SIZE VALIDATION
// ============================================================================

/**
 * Validates and parses a tire size string into component fields.
 * Supports both metric (e.g. "LT265/70R17") and flotation (e.g. "33x12.5R15").
 *
 * Returns array on success:
 *   [size_format, width_mm, aspect_ratio, construction, wheel_diameter, tire_type_prefix]
 * Returns null on invalid input.
 *
 * FAILURE MODES:
 *   - Metric: aspect_ratio outside 25-90 is suspicious but not rejected (run-flats can be 25)
 *   - Flotation: overall diameter >45 is suspicious (agricultural territory)
 *   - Half-inch wheel diameters (16.5) are valid for LT tires
 *   - Prefix is optional: "265/70R17" is valid (defaults to PP/Passenger)
 */
function parseTireSize(string $raw): ?array {
    $s = strtoupper(trim($raw));

    // Metric pattern: [PREFIX]WIDTH/ASPECT_RATIO[CONSTRUCTION]DIAMETER
    // Examples: LT265/70R17, 225/45R18, ST215/75R14, P265/70R17
    $metricPattern = '/^(LT|ST|P)?(\d{3})\/(\d{2,3})(R|B|D)(\d{2}(?:\.\d)?)$/';

    // Flotation pattern: DIAMETERxWIDTH[CONSTRUCTION]RIM
    // Examples: 33x12.5R15, 35x12.50R17, 31x10.5R15
    $flotationPattern = '/^(\d{2,3})x(\d{1,2}(?:\.\d{1,2})?)(R|B|D)(\d{2}(?:\.\d)?)$/';

    if (preg_match($metricPattern, $s, $m)) {
        $prefix     = $m[1] ?: 'PP'; // Default to Passenger
        $width_mm   = (int) $m[2];
        $aspect     = (int) $m[3];
        $constr     = $m[4];
        $rim        = (float) $m[5];

        // Basic range checks
        if ($width_mm < 100 || $width_mm > 400) return null;
        if ($aspect < 20 || $aspect > 100) return null;
        if ($rim < 10 || $rim > 30) return null;

        return [
            'size_format'      => 'metric',
            'width_mm'         => $width_mm,
            'aspect_ratio'     => $aspect,
            'construction'     => $constr,
            'wheel_diameter'   => $rim,
            'tire_type_prefix' => $prefix,
        ];
    }

    if (preg_match($flotationPattern, $s, $m)) {
        // Flotation stores diameter and width as x10 integers in the database
        $overall_diam = (float) $m[1];
        $section_width = (float) $m[2];
        $constr = $m[3];
        $rim = (float) $m[4];

        if ($overall_diam < 20 || $overall_diam > 50) return null;
        if ($section_width < 5 || $section_width > 20) return null;
        if ($rim < 10 || $rim > 24) return null;

        return [
            'size_format'      => 'flotation',
            'width_mm'         => (int) ($overall_diam * 10), // Store as x10 integer
            'aspect_ratio'     => (int) ($section_width * 10), // Store as x10 integer
            'construction'     => $constr,
            'wheel_diameter'   => $rim,
            'tire_type_prefix' => 'LT', // Flotation sizes are always LT
        ];
    }

    return null; // Invalid format
}


// ============================================================================
// 3. COMMON SEARCH QUERIES
// ============================================================================

/**
 * Search tires by size (the most common query).
 * Uses the v_tire_inventory view which resolves all FKs.
 *
 * $size: raw size string from user input (e.g. "265/70R17")
 * $statusFilter: array of statuses to include (default: available only)
 */
function searchTiresBySize(string $size, array $statusFilter = ['available']): array {
    $parsed = parseTireSize($size);
    if (!$parsed) return [];

    $placeholders = implode(',', array_fill(0, count($statusFilter), '?'));
    $sql = "SELECT * FROM v_tire_inventory
            WHERE width_mm = ? AND aspect_ratio = ? AND wheel_diameter = ?
              AND status IN ({$placeholders})
            ORDER BY retail_price ASC";

    $params = [
        $parsed['width_mm'],
        $parsed['aspect_ratio'],
        $parsed['wheel_diameter'],
        ...$statusFilter,
    ];

    $stmt = getDB()->prepare($sql);
    $stmt->execute($params);
    return $stmt->fetchAll();
}

/**
 * Search tires with multiple optional filters.
 * All parameters are optional; pass null to skip a filter.
 *
 * This is the primary inventory search used by the UI.
 */
function searchTiresAdvanced(
    ?string $size = null,
    ?int $brandId = null,
    ?string $condition = null, // 'N' or 'U'
    ?float $priceMin = null,
    ?float $priceMax = null,
    ?string $status = null,
    ?int $minTreadDepth = null, // 32nds
    ?string $binFacility = null, // 'R' or 'S'
    int $limit = 50,
    int $offset = 0
): array {
    $where = [];
    $params = [];

    if ($size !== null) {
        $parsed = parseTireSize($size);
        if ($parsed) {
            $where[] = 'width_mm = ? AND aspect_ratio = ? AND wheel_diameter = ?';
            $params[] = $parsed['width_mm'];
            $params[] = $parsed['aspect_ratio'];
            $params[] = $parsed['wheel_diameter'];
        }
    }
    if ($brandId !== null) {
        $where[] = 'brand_id = ?';
        $params[] = $brandId;
    }
    if ($condition !== null) {
        $where[] = '`condition` = ?';
        $params[] = $condition;
    }
    if ($priceMin !== null) {
        $where[] = 'retail_price >= ?';
        $params[] = $priceMin;
    }
    if ($priceMax !== null) {
        $where[] = 'retail_price <= ?';
        $params[] = $priceMax;
    }
    if ($status !== null) {
        $where[] = 'status = ?';
        $params[] = $status;
    } else {
        $where[] = "status = 'available'";
    }
    if ($minTreadDepth !== null) {
        $where[] = 'tread_depth_32nds >= ?';
        $params[] = $minTreadDepth;
    }
    if ($binFacility !== null) {
        $where[] = 'bin_facility = ?';
        $params[] = $binFacility;
    }

    $whereClause = $where ? 'WHERE ' . implode(' AND ', $where) : '';

    // Count total matches (parallel query replaces deprecated SQL_CALC_FOUND_ROWS)
    $db = getDB();
    $countSql = "SELECT COUNT(*) FROM v_tire_inventory {$whereClause}";
    $countStmt = $db->prepare($countSql);
    $countStmt->execute($params);
    $total = (int) $countStmt->fetchColumn();

    $sql = "SELECT * FROM v_tire_inventory
            {$whereClause}
            ORDER BY retail_price ASC
            LIMIT ? OFFSET ?";
    $params[] = $limit;
    $params[] = $offset;

    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll();

    return ['rows' => $rows, 'total' => $total, 'limit' => $limit, 'offset' => $offset];
}

/**
 * Search customers by name or phone.
 * Searches first_name, last_name, phone_primary, and phone_secondary.
 * Uses LIKE with leading and trailing wildcards (full substring match).
 * NOTE: Leading wildcard prevents index usage on these columns. At high
 * customer volume (10k+), consider a FULLTEXT index or prefix-only search.
 */
function searchCustomers(string $query, int $limit = 20): array {
    $like = '%' . $query . '%';
    $sql = "SELECT customer_id, first_name, last_name, phone_primary, phone_secondary, email
            FROM customers
            WHERE is_active = 1
              AND (first_name LIKE ? OR last_name LIKE ? OR phone_primary LIKE ? OR phone_secondary LIKE ?)
            ORDER BY last_name, first_name
            LIMIT ?";
    $stmt = getDB()->prepare($sql);
    $stmt->execute([$like, $like, $like, $like, $limit]);
    return $stmt->fetchAll();
}

/**
 * Search vehicles by VIN, plate, or year/make/model.
 */
function searchVehicles(string $query, int $limit = 20): array {
    $like = '%' . $query . '%';
    $sql = "SELECT v.*, GROUP_CONCAT(CONCAT(c.first_name, ' ', c.last_name) SEPARATOR ', ') AS owners
            FROM vehicles v
            LEFT JOIN customer_vehicles cv ON v.vehicle_id = cv.vehicle_id
            LEFT JOIN customers c ON cv.customer_id = c.customer_id
            WHERE v.is_active = 1
              AND (v.vin LIKE ? OR v.license_plate LIKE ?
                   OR CONCAT(v.year, ' ', v.make, ' ', v.model) LIKE ?)
            GROUP BY v.vehicle_id
            ORDER BY v.year DESC, v.make, v.model
            LIMIT ?";
    $stmt = getDB()->prepare($sql);
    $stmt->execute([$like, $like, $like, $limit]);
    return $stmt->fetchAll();
}

/**
 * Get full vehicle service history for display when customer arrives.
 */
function getVehicleHistory(int $vehicleId): array {
    $sql = "SELECT * FROM v_vehicle_history WHERE vehicle_id = ? ORDER BY wo_date DESC";
    $stmt = getDB()->prepare($sql);
    $stmt->execute([$vehicleId]);
    return $stmt->fetchAll();
}

/**
 * Get all vehicles for a customer (for the vehicle selector dropdown).
 */
function getCustomerVehicles(int $customerId): array {
    $sql = "SELECT v.*, cv.relationship, cv.is_primary
            FROM vehicles v
            JOIN customer_vehicles cv ON v.vehicle_id = cv.vehicle_id
            WHERE cv.customer_id = ? AND v.is_active = 1
            ORDER BY cv.is_primary DESC, v.year DESC";
    $stmt = getDB()->prepare($sql);
    $stmt->execute([$customerId]);
    return $stmt->fetchAll();
}


// ============================================================================
// 4. SEQUENCE GENERATORS
// ============================================================================

/**
 * Generates the next sequential number in a given format.
 * Thread-safe via SELECT FOR UPDATE.
 *
 * Format examples: INV-000001, WO-000001, PO-000001
 */
function nextSequence(string $prefix, string $table, string $column): string {
    $db = getDB();
    $sql = "SELECT {$column} FROM {$table} ORDER BY CAST(SUBSTRING({$column}, LENGTH(?) + 1) AS UNSIGNED) DESC LIMIT 1 FOR UPDATE";
    $stmt = $db->prepare($sql);
    $stmt->execute([$prefix . '-']);
    $last = $stmt->fetchColumn();

    if ($last) {
        $num = (int) substr($last, strlen($prefix) + 1);
        $next = $num + 1;
    } else {
        $next = 1;
    }

    return $prefix . '-' . str_pad((string) $next, 6, '0', STR_PAD_LEFT);
}

function nextWorkOrderNumber(): string {
    return nextSequence('WO', 'work_orders', 'wo_number');
}

function nextPONumber(): string {
    return nextSequence('PO', 'purchase_orders', 'po_number');
}


// ============================================================================
// 6. TORQUE VERIFICATION GATE
// ============================================================================

/**
 * Checks whether a work order can transition to 'complete' status.
 * Returns true if torque is verified, false otherwise.
 *
 * CRITICAL: This is the most important liability gate in the system.
 * A work order with wheel work (install, repair, rotate) CANNOT be completed
 * without torque verification. This function is the enforcement point.
 */
function canCompleteWorkOrder(int $workOrderId): array {
    $db = getDB();

    // Check if any positions had wheel-affecting work
    $sql = "SELECT COUNT(*) FROM work_order_positions
            WHERE work_order_id = ?
              AND action_requested IN ('install', 'repair', 'rotate_to')
              AND is_completed = 1";
    $stmt = $db->prepare($sql);
    $stmt->execute([$workOrderId]);
    $wheelWork = (int) $stmt->fetchColumn();

    if ($wheelWork === 0) {
        // No wheel work (inspect-only, dismount-only): torque not required
        return ['can_complete' => true, 'reason' => 'No wheel-affecting work performed'];
    }

    // Wheel work was done: torque MUST be verified
    $sql = "SELECT torque_spec_used, torque_verified_by, torque_verified_at
            FROM work_orders WHERE work_order_id = ?";
    $stmt = $db->prepare($sql);
    $stmt->execute([$workOrderId]);
    $wo = $stmt->fetch();

    if (empty($wo['torque_verified_by']) || empty($wo['torque_verified_at'])) {
        return [
            'can_complete' => false,
            'reason'       => 'Torque verification required. Record torque spec, verified-by, and timestamp before completing.'
        ];
    }

    return ['can_complete' => true, 'reason' => 'Torque verified'];
}


// ============================================================================
// 7. RE-TORQUE SCHEDULING
// ============================================================================

/**
 * Calculate and set re-torque due date and mileage for a completed work order.
 * Industry standard: re-check after 50-100 miles / 3-7 days.
 * Default: 7 days or +75 miles from mileage_out.
 */
function scheduleRetorque(int $workOrderId, int $dueDays = 7, int $dueMiles = 75): void {
    $db = getDB();
    $sql = "UPDATE work_orders SET
                retorque_due_date = DATE_ADD(CURDATE(), INTERVAL ? DAY),
                retorque_due_miles = CASE WHEN mileage_out IS NOT NULL THEN mileage_out + ? ELSE NULL END
            WHERE work_order_id = ?";
    $stmt = $db->prepare($sql);
    $stmt->execute([$dueDays, $dueMiles, $workOrderId]);
}

/**
 * Get today's re-torque call list.
 * Uses v_retorque_due view (work orders with retorque_due_date <= today
 * and retorque_completed = 0).
 */
function getRetorqueDueList(): array {
    return getDB()->query("SELECT * FROM v_retorque_due ORDER BY days_overdue DESC")->fetchAll();
}

/**
 * Mark re-torque as completed.
 */
function completeRetorque(int $workOrderId, int $completedBy): void {
    $sql = "UPDATE work_orders SET
                retorque_completed = 1,
                retorque_completed_at = NOW(),
                retorque_completed_by = ?
            WHERE work_order_id = ?";
    $stmt = getDB()->prepare($sql);
    $stmt->execute([$completedBy, $workOrderId]);
    auditLog('work_orders', $workOrderId, 'UPDATE', 'retorque_completed', '0', '1', $completedBy);
}


// ============================================================================
// 8. WAIVER AUTO-DETECTION
// ============================================================================

/**
 * Check if a tire requires a waiver and return the type(s) needed.
 * Checks three conditions:
 *   1. Aged tire (DOT manufacture date > 6 years ago)
 *   2. Used tire sale (condition = 'U')
 *   3. Repair in shoulder/sidewall area (caller must flag this)
 *
 * Returns array of waiver type strings (may be multiple).
 */
function detectWaiversNeeded(int $tireId, bool $isRepairOutsideTread = false): array {
    $waivers = [];

    $db = getDB();
    $sql = "SELECT `condition`, dot_mfg_year, dot_mfg_week FROM tires WHERE tire_id = ?";
    $stmt = $db->prepare($sql);
    $stmt->execute([$tireId]);
    $tire = $stmt->fetch();
    if (!$tire) return [];

    // Check tire age (>6 years from manufacture date)
    if ($tire['dot_mfg_year'] && $tire['dot_mfg_week']) {
        $mfgDate = new DateTime();
        $mfgDate->setISODate((int) $tire['dot_mfg_year'], (int) $tire['dot_mfg_week']);
        $ageYears = $mfgDate->diff(new DateTime())->days / 365.25;
        if ($ageYears > 6.0) {
            $waivers[] = 'aged_tire';
        }
    }

    // Check used tire
    if ($tire['condition'] === 'U') {
        $waivers[] = 'used_tire';
    }

    // Check repair zone
    if ($isRepairOutsideTread) {
        $waivers[] = 'repair_limit';
    }

    return $waivers;
}

/**
 * Get the frozen waiver template text for a given type.
 * Text is copied to the waiver record at creation time (never referenced by FK).
 */
function getWaiverTemplate(string $waiverType): ?string {
    $keyMap = [
        'aged_tire'    => 'WAIVER_AGED_TIRE',
        'used_tire'    => 'WAIVER_USED_TIRE',
        'repair_limit' => 'WAIVER_REPAIR_LIMIT',
    ];
    $key = $keyMap[$waiverType] ?? null;
    if (!$key) return null;

    $sql = "SELECT statutory_text FROM fee_configuration WHERE fee_key = ? AND is_active = 1";
    $stmt = getDB()->prepare($sql);
    $stmt->execute([$key]);
    return $stmt->fetchColumn() ?: null;
}


// ============================================================================
// 11. PASSWORD AND LOGIN SECURITY
// ============================================================================

/**
 * Check if a new password was used in the last N entries for this user.
 * Returns true if the password is reused (should be REJECTED).
 */
function isPasswordReused(int $userId, string $newPasswordPlain, int $historyDepth = 5): bool {
    $db = getDB();
    $sql = "SELECT password_hash FROM password_history
            WHERE user_id = ? ORDER BY created_at DESC LIMIT ?";
    $stmt = $db->prepare($sql);
    $stmt->execute([$userId, $historyDepth]);
    $hashes = $stmt->fetchAll(PDO::FETCH_COLUMN);

    // Also check current password
    $currentSql = "SELECT password_hash FROM users WHERE user_id = ?";
    $currentStmt = $db->prepare($currentSql);
    $currentStmt->execute([$userId]);
    $current = $currentStmt->fetchColumn();
    if ($current) $hashes[] = $current;

    foreach ($hashes as $hash) {
        if (password_verify($newPasswordPlain, $hash)) return true;
    }
    return false;
}

/**
 * Handle failed login attempt. Increments counter, locks after 5 failures.
 * Lock duration: 15 minutes.
 */
function recordFailedLogin(int $userId): void {
    $db = getDB();
    $sql = "UPDATE users SET
                failed_login_count = failed_login_count + 1,
                locked_until = CASE
                    WHEN failed_login_count >= 5 THEN DATE_ADD(NOW(), INTERVAL 15 MINUTE)
                    ELSE locked_until
                END
            WHERE user_id = ?";
    $stmt = $db->prepare($sql);
    $stmt->execute([$userId]);

    // Log the failed attempt
    auditLog('users', $userId, 'FAILED_LOGIN', null, null, null, $userId);
}

/**
 * Reset login failures on successful login.
 */
function recordSuccessfulLogin(int $userId): void {
    $db = getDB();
    $sql = "UPDATE users SET
                failed_login_count = 0,
                locked_until = NULL,
                last_login_at = NOW()
            WHERE user_id = ?";
    $stmt = $db->prepare($sql);
    $stmt->execute([$userId]);

    auditLog('users', $userId, 'LOGIN', null, null, null, $userId);
}

/**
 * Check if password has expired (>30 days since last change).
 */
function isPasswordExpired(int $userId, int $maxAgeDays = 30): bool {
    $sql = "SELECT password_changed_at FROM users WHERE user_id = ?";
    $stmt = getDB()->prepare($sql);
    $stmt->execute([$userId]);
    $changedAt = $stmt->fetchColumn();

    if (!$changedAt) return true; // Never changed, force change

    $changed = new DateTime($changedAt);
    $now = new DateTime();
    return $changed->diff($now)->days > $maxAgeDays;
}


// ============================================================================
// 12. PERMISSION CHECKING (RBAC)
// ============================================================================

/**
 * Check if a user has a specific permission.
 * Uses the role_permissions junction table.
 *
 * Active permission keys (17):
 *   INVENTORY_VIEW, INVENTORY_ADD, INVENTORY_EDIT, INVENTORY_WRITE_OFF,
 *   CUSTOMER_MANAGE, REPORT_VIEW, USER_MANAGE, CONFIG_MANAGE, AUDIT_VIEW,
 *   WORK_ORDER_CREATE, WORK_ORDER_ASSIGN, VEHICLE_MANAGE, PO_CREATE,
 *   PO_RECEIVE, WAIVER_CREATE, APPOINTMENT_MANAGE, PHOTO_UPLOAD
 */
function hasPermission(int $userId, string $permissionKey): bool {
    $sql = "SELECT COUNT(*) FROM role_permissions rp
            JOIN users u ON rp.role_id = u.role_id
            JOIN permissions p ON rp.permission_id = p.permission_id
            WHERE u.user_id = ? AND p.permission_key = ? AND u.is_active = 1";
    $stmt = getDB()->prepare($sql);
    $stmt->execute([$userId, $permissionKey]);
    return (int) $stmt->fetchColumn() > 0;
}

/**
 * Get all permissions for a user (for session caching).
 * Returns flat array of permission key strings.
 */
function getUserPermissions(int $userId): array {
    $sql = "SELECT p.permission_key FROM role_permissions rp
            JOIN users u ON rp.role_id = u.role_id
            JOIN permissions p ON rp.permission_id = p.permission_id
            WHERE u.user_id = ? AND u.is_active = 1";
    $stmt = getDB()->prepare($sql);
    $stmt->execute([$userId]);
    return $stmt->fetchAll(PDO::FETCH_COLUMN);
}


// ============================================================================
// 13. AUDIT LOGGING
// ============================================================================

/**
 * Write an audit log entry.
 * Called by all data-modifying operations.
 *
 * IMPORTANT: This function should NEVER be disabled or skipped.
 * The audit trail is a core liability protection mechanism.
 */
function auditLog(
    string $tableName,
    ?int $recordId,
    string $action,
    ?string $fieldChanged = null,
    ?string $oldValue = null,
    ?string $newValue = null,
    ?int $changedBy = null
): void {
    $sql = "INSERT INTO audit_log (table_name, record_id, action, field_changed, old_value, new_value, changed_by, ip_address)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)";
    $stmt = getDB()->prepare($sql);
    $stmt->execute([
        $tableName,
        $recordId,
        $action,
        $fieldChanged,
        $oldValue,
        $newValue,
        $changedBy,
        $_SERVER['REMOTE_ADDR'] ?? null,
    ]);
}

/**
 * Log user activity (searches, views, etc.).
 */
function logActivity(int $userId, string $activityType, ?string $entityType = null, ?int $entityId = null, ?string $details = null): void {
    $sql = "INSERT INTO user_activity_log (user_id, activity_type, entity_type, entity_id, details, ip_address)
            VALUES (?, ?, ?, ?, ?, ?)";
    $stmt = getDB()->prepare($sql);
    $stmt->execute([$userId, $activityType, $entityType, $entityId, $details, $_SERVER['REMOTE_ADDR'] ?? null]);

    // Fire outbound webhooks for subscribed endpoints
    try {
        require_once BASE_PATH . '/php/WebhookDispatcher.php';
        WebhookDispatcher::fire($activityType, [
            'entity_type' => $entityType,
            'entity_id'   => $entityId,
            'details'     => $details,
            'user_id'     => $userId,
        ]);
    } catch (\Throwable $e) {
        // Webhook failures must never break the main request
        \App\Core\Logger::warning('webhook_fire_error', [
            'event' => $activityType, 'error' => $e->getMessage(),
        ]);
    }
}


// ============================================================================
// 14. DOT/TIN PARSING AND AGE CALCULATION
// ============================================================================

/**
 * Parse a DOT TIN (Tire Identification Number) into component fields.
 * Format: DOT XXXX XXXX WWYY (spaces optional)
 *   - Plant code: 2-4 chars
 *   - Size code: 2-4 chars
 *   - Option code: 0-4 chars (optional)
 *   - Week/Year: 4 digits (WWYY) for post-2000, 3 digits (WWY) for pre-2000
 *
 * FAILURE MODE: Pre-2000 tires have 3-digit date codes (e.g. 259 = week 25, 199?).
 * The decade is ambiguous. We flag these with dot_is_pre2000 = 1 and store the
 * single-digit year. The UI should warn the user.
 */
function parseDotTin(string $raw): ?array {
    // Strip "DOT" prefix, spaces, dashes
    $s = preg_replace('/[^A-Z0-9]/i', '', strtoupper($raw));
    if (str_starts_with($s, 'DOT')) $s = substr($s, 3);

    $len = strlen($s);
    if ($len < 7 || $len > 13) return null;

    // Last 4 digits = WWYY (post-2000) or last 3 digits = WWY (pre-2000)
    $isPre2000 = false;
    if ($len >= 11 && preg_match('/^(\d{2})(\d{2})$/', substr($s, -4), $dm)) {
        $week = (int) $dm[1];
        $year = 2000 + (int) $dm[2];
        $body = substr($s, 0, -4);
    } elseif (preg_match('/^(\d{2})(\d)$/', substr($s, -3), $dm)) {
        $week = (int) $dm[1];
        $year = 1990 + (int) $dm[2]; // Assume 1990s (ambiguous)
        $body = substr($s, 0, -3);
        $isPre2000 = true;
    } else {
        return null; // Cannot parse date
    }

    if ($week < 1 || $week > 53) return null;
    if ($year < 1970 || $year > (int) date('Y') + 1) return null;

    // Parse body into plant, size, option codes (2-4 chars each)
    $plantCode = substr($body, 0, 2);
    $remaining = substr($body, 2);
    $sizeCode = substr($remaining, 0, 2);
    $optionCode = strlen($remaining) > 2 ? substr($remaining, 2) : null;

    return [
        'dot_tin_raw'      => $raw,
        'dot_plant_code'   => $plantCode,
        'dot_size_code'    => $sizeCode,
        'dot_option_code'  => $optionCode,
        'dot_mfg_week'     => $week,
        'dot_mfg_year'     => $year,
        'dot_is_pre2000'   => $isPre2000 ? 1 : 0,
    ];
}

/**
 * Calculate tire age in years from DOT fields.
 * Returns float years, or null if DOT data incomplete.
 */
function calculateTireAge(?int $mfgYear, ?int $mfgWeek): ?float {
    if (!$mfgYear || !$mfgWeek) return null;

    $mfgDate = new DateTime();
    $mfgDate->setISODate($mfgYear, $mfgWeek);
    $now = new DateTime();
    return $mfgDate->diff($now)->days / 365.25;
}

/**
 * Check if a tire triggers the 6-year age warning.
 */
function isTireAged(?int $mfgYear, ?int $mfgWeek): bool {
    $age = calculateTireAge($mfgYear, $mfgWeek);
    return $age !== null && $age > 6.0;
}


// ============================================================================
// 15. REPORT QUERY HELPERS
// ============================================================================

/**
 * Open work orders dashboard (uses v_work_orders_open view).
 */
function getOpenWorkOrders(): array {
    return getDB()->query("SELECT * FROM v_work_orders_open")->fetchAll();
}

/**
 * Today's appointments (uses v_appointments_today view).
 */
function getTodaysAppointments(): array {
    return getDB()->query("SELECT * FROM v_appointments_today")->fetchAll();
}

/**
 * Open purchase orders (uses v_purchase_orders_open view).
 */
function getOpenPurchaseOrders(): array {
    return getDB()->query("SELECT * FROM v_purchase_orders_open")->fetchAll();
}

/**
 * Quarterly fee report for CDPHE submission (uses v_quarterly_fee_report view).
 * Pass year and quarter (1-4).
 */
function getQuarterlyFeeReport(int $year, int $quarter): array {
    $sql = "SELECT * FROM v_quarterly_fee_report WHERE sale_year = ? AND sale_quarter = ?";
    $stmt = getDB()->prepare($sql);
    $stmt->execute([$year, $quarter]);
    return $stmt->fetchAll();
}

/**
 * Service usage report (uses v_service_usage view).
 */
function getServiceUsageReport(): array {
    return getDB()->query("SELECT * FROM v_service_usage")->fetchAll();
}

/**
 * Employee activity summary for a date range.
 */
function getEmployeeActivity(int $userId, string $startDate, string $endDate): array {
    $sql = "SELECT activity_type, entity_type, COUNT(*) AS action_count
            FROM user_activity_log
            WHERE user_id = ? AND created_at BETWEEN ? AND ?
            GROUP BY activity_type, entity_type
            ORDER BY action_count DESC";
    $stmt = getDB()->prepare($sql);
    $stmt->execute([$userId, $startDate, $endDate]);
    return $stmt->fetchAll();
}

/**
 * Active road hazard warranties.
 */
function getActiveWarranties(): array {
    $sql = "SELECT woli.line_id, woli.warranty_expires_at, woli.warranty_terms,
                   wo.wo_number AS reference_number, c.first_name, c.last_name, c.phone_primary,
                   woli.description AS tire_description
            FROM work_order_line_items woli
            JOIN work_orders wo ON woli.work_order_id = wo.work_order_id
            JOIN customers c ON wo.customer_id = c.customer_id
            WHERE woli.line_type = 'warranty'
              AND woli.warranty_expires_at >= CURDATE()
              AND wo.status = 'complete'
            ORDER BY woli.warranty_expires_at ASC";
    return getDB()->query($sql)->fetchAll();
}


// ============================================================================
// 16. DUALLY TRUCK DETECTION
// ============================================================================

/**
 * Determine wheel position layout based on vehicle drivetrain and type.
 * Standard: LF, RF, LR, RR, SPARE (5 positions)
 * Dually: LF, RF, LR (outer), LRI (inner), RR (outer), RRI (inner), SPARE (7 positions)
 *
 * NOTE: The system auto-generates work_order_positions based on this layout
 * when a work order is created.
 */
function getWheelPositions(?string $drivetrain, bool $isDually = false): array {
    $standard = ['LF', 'RF', 'LR', 'RR', 'SPARE'];
    $dually   = ['LF', 'RF', 'LR', 'LRI', 'RR', 'RRI', 'SPARE'];

    // Dually detection: drivetrain alone does not determine dually status.
    // The isDually flag must be set based on vehicle notes or user input.
    // Future enhancement: detect from VIN decode.
    return $isDually ? $dually : $standard;
}


// ============================================================================
// 18. VIN VALIDATION
// ============================================================================

/**
 * Basic VIN validation (17 characters, valid check digit).
 * Does NOT call NHTSA API (that is an optional enhancement).
 *
 * VIN uses all digits and uppercase letters EXCEPT I, O, and Q
 * (which are omitted to avoid confusion with 1, 0, and other characters).
 */
function validateVin(string $vin): array {
    $vin = strtoupper(trim($vin));

    if (strlen($vin) !== 17) {
        return ['valid' => false, 'reason' => 'VIN must be exactly 17 characters'];
    }

    if (preg_match('/[IOQ]/', $vin)) {
        return ['valid' => false, 'reason' => 'VIN cannot contain I, O, or Q'];
    }

    if (!preg_match('/^[A-HJ-NPR-Z0-9]{17}$/', $vin)) {
        return ['valid' => false, 'reason' => 'VIN contains invalid characters'];
    }

    // Check digit validation (position 9)
    $transliteration = [
        'A'=>1,'B'=>2,'C'=>3,'D'=>4,'E'=>5,'F'=>6,'G'=>7,'H'=>8,
        'J'=>1,'K'=>2,'L'=>3,'M'=>4,'N'=>5,'P'=>7,'R'=>9,
        'S'=>2,'T'=>3,'U'=>4,'V'=>5,'W'=>6,'X'=>7,'Y'=>8,'Z'=>9
    ];
    $weights = [8,7,6,5,4,3,2,10,0,9,8,7,6,5,4,3,2];

    $sum = 0;
    for ($i = 0; $i < 17; $i++) {
        $c = $vin[$i];
        $val = is_numeric($c) ? (int) $c : ($transliteration[$c] ?? 0);
        $sum += $val * $weights[$i];
    }
    $remainder = $sum % 11;
    $checkChar = ($remainder === 10) ? 'X' : (string) $remainder;

    if ($vin[8] !== $checkChar) {
        return ['valid' => false, 'reason' => "Check digit mismatch (expected {$checkChar}, got {$vin[8]})"];
    }

    return ['valid' => true, 'vin' => $vin];
}
