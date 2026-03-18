<?php
// ============================================================================
// TireShopPOS: Phase 3 CRUD (Online Presence, Warranties, Wheels, Hardware)
// ============================================================================
//
// LAZY-LOADED: only parsed when URI matches /api/(settings|config|warranty*|
// wheels|fitment|custom-field*|api-key*|recalls|barcode|labels|notifications|
// public|website-config). See public/index.php.
//
// Function groups:
//   Shop Settings      getAllSettings(), bulkUpdateSettings(), getSettingValue()
//   Website Config     getAllWebsiteConfig(), bulkUpdateWebsiteConfig()
//   Warranty Policies  listWarrantyPolicies(), getWarrantyPolicy(),
//                      createWarrantyPolicy(), updateWarrantyPolicy()
//   Warranty Claims    listWarrantyClaims(), getWarrantyClaim(),
//                      fileWarrantyClaim(), reviewWarrantyClaim(),
//                      payWarrantyClaim()
//   Wheels             searchWheels(), getWheel(), createWheel(), updateWheel()
//   Wheel Fitments     addWheelFitment(), removeWheelFitment()
//   Fitment Search     searchFitmentByVehicle(), searchFitmentReverse(),
//                      searchByBoltPattern()
//   Custom Fields      listCustomFields(), createCustomField(),
//                      updateCustomField(), getCustomFieldValues(),
//                      setCustomFieldValues()
//   API Keys           listApiKeys(), createApiKey(), revokeApiKey()
//   NHTSA Recalls      checkNhtsaRecalls(), checkTireRecallByDot()
//   Barcode Labels     generateTireLabelZpl(), generateWheelLabelZpl()
//   Barcode Scanner    lookupByBarcode()
//   Notifications      logNotification(), markNotificationSent(),
//                      markNotificationFailed(), listPendingNotifications(),
//                      getNotificationLog()
//   Public Storefront  getPublicSettings(), getPublicInventory(),
//                      getPublicTireDetail(), getPublicAppointmentSlots()
//
// Dependencies: App\Core\Database
// Called by:    routes/api.php (when URI matches)
//
// DunganSoft Technologies, March 2026
// ============================================================================
// ============================================================================

use App\Core\Database;

// ============================================================================
// Shop Settings
// ============================================================================

function getAllSettings(): array {
    return Database::query("SELECT * FROM shop_settings ORDER BY category, setting_key");
}

function getPublicSettings(): array {
    return Database::query("SELECT setting_key, setting_value, setting_type FROM shop_settings WHERE is_public = 1");
}

function getSettingValue(string $key): ?string {
    $row = Database::queryOne("SELECT setting_value FROM shop_settings WHERE setting_key = ?", [$key]);
    return $row ? $row['setting_value'] : null;
}

function updateSetting(string $key, string $value, int $userId): bool {
    $stmt = getDB()->prepare(
        "UPDATE shop_settings SET setting_value = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE setting_key = ?"
    );
    $stmt->execute([$value, $userId, $key]);
    if ($stmt->rowCount() > 0) auditLog('shop_settings', null, 'UPDATE', $key, '', $value, $userId);
    return $stmt->rowCount() > 0;
}

function bulkUpdateSettings(array $settings, int $userId): int {
    return Database::transaction(function () use ($settings, $userId) {
        $changed = 0;
        foreach ($settings as $key => $value) {
            if (updateSetting($key, (string) $value, $userId)) {
                $changed++;
            }
        }
        return $changed;
    });
}


// ============================================================================
// Website Config
// ============================================================================

function getAllWebsiteConfig(): array {
    return Database::query("SELECT * FROM website_config ORDER BY config_key");
}

function getWebsiteConfigValue(string $key): ?string {
    $row = Database::queryOne("SELECT config_value FROM website_config WHERE config_key = ?", [$key]);
    return $row ? $row['config_value'] : null;
}

function updateWebsiteConfig(string $key, string $value): bool {
    // Sanitize HTML values server-side (defense in depth; frontend also sanitizes on render)
    if (str_ends_with($key, '_html') && $value !== '') {
        $value = sanitizeHtml($value);
    }
    $stmt = getDB()->prepare(
        "UPDATE website_config SET config_value = ?, updated_at = CURRENT_TIMESTAMP WHERE config_key = ?"
    );
    $stmt->execute([$value, $key]);
    return $stmt->rowCount() > 0;
}

/**
 * Strip dangerous HTML: script, iframe, object, embed, event handlers.
 * Preserves safe formatting tags. For defense in depth alongside
 * client-side DOMPurify sanitization.
 */
function sanitizeHtml(string $html): string {
    // Remove script, iframe, object, embed, applet, form, base tags entirely
    $html = preg_replace('/<\s*(script|iframe|object|embed|applet|form|base|link|meta)\b[^>]*>.*?<\/\s*\1\s*>/is', '', $html);
    $html = preg_replace('/<\s*(script|iframe|object|embed|applet|form|base|link|meta)\b[^>]*\/?>/is', '', $html);
    // Remove event handlers (on*)
    $html = preg_replace('/\s+on\w+\s*=\s*("[^"]*"|\'[^\']*\'|[^\s>]+)/i', '', $html);
    // Remove javascript: and data: URIs in href/src
    $html = preg_replace('/(href|src)\s*=\s*["\']?\s*(javascript|data)\s*:/i', '$1="removed:', $html);
    return $html;
}

function bulkUpdateWebsiteConfig(array $configs): int {
    return Database::transaction(function () use ($configs) {
        $changed = 0;
        foreach ($configs as $key => $value) {
            if (updateWebsiteConfig($key, (string) $value)) {
                $changed++;
            }
        }
        return $changed;
    });
}


// ============================================================================
// Warranty Policies
// ============================================================================

function listWarrantyPolicies(bool $activeOnly = true): array {
    $where = $activeOnly ? 'WHERE is_active = 1' : '';
    return Database::query("SELECT * FROM warranty_policies {$where} ORDER BY policy_name");
}

function getWarrantyPolicy(int $policyId): ?array {
    return Database::queryOne("SELECT * FROM warranty_policies WHERE policy_id = ?", [$policyId]);
}

function createWarrantyPolicy(array $data): int {
    InputValidator::check('warranty_policies', $data, ['policy_name', 'policy_code']);
    $sql = "INSERT INTO warranty_policies
            (policy_name, policy_code, coverage_months, coverage_miles,
             coverage_tread_depth_32nds, pro_rata, terms_text)
            VALUES (?, ?, ?, ?, ?, ?, ?)";
    $stmt = getDB()->prepare($sql);
    $stmt->execute([
        $data['policy_name'], $data['policy_code'],
        (int) ($data['coverage_months'] ?? 12),
        isset($data['coverage_miles']) ? (int) $data['coverage_miles'] : null,
        isset($data['coverage_tread_depth_32nds']) ? (int) $data['coverage_tread_depth_32nds'] : null,
        (int) ($data['pro_rata'] ?? 0),
        $data['terms_text'] ?? '',
    ]);
    return (int) getDB()->lastInsertId();
}

function updateWarrantyPolicy(int $policyId, array $data): array {
    $editable = ['policy_name', 'coverage_months', 'coverage_miles',
                 'coverage_tread_depth_32nds', 'pro_rata', 'terms_text', 'is_active'];
    $sets = [];
    $params = [];
    foreach ($editable as $col) {
        if (array_key_exists($col, $data)) {
            $sets[] = "{$col} = ?";
            $params[] = $data[$col];
        }
    }
    if (empty($sets)) return ['changed' => 0];
    $params[] = $policyId;
    getDB()->prepare("UPDATE warranty_policies SET " . implode(', ', $sets) . " WHERE policy_id = ?")->execute($params);
    return ['changed' => count($sets)];
}


// ============================================================================
// Warranty Claims
// ============================================================================

function fileWarrantyClaim(array $data, int $createdBy): int {
    // Validate: claim within coverage (now tracked via work_order_line_items)
    $line = Database::queryOne(
        "SELECT woli.warranty_expires_at, wo.work_order_id, wo.customer_id
         FROM work_order_line_items woli
         JOIN work_orders wo ON woli.work_order_id = wo.work_order_id
         WHERE woli.line_id = ? AND woli.line_type = 'warranty'",
        [$data['line_id']]
    );
    if (!$line) throw new RuntimeException('Warranty line item not found');

    if ($line['warranty_expires_at'] && $line['warranty_expires_at'] < date('Y-m-d')) {
        throw new RuntimeException('Warranty has expired (' . $line['warranty_expires_at'] . ')');
    }

    $sql = "INSERT INTO warranty_claims
            (work_order_id, position_id, customer_id, policy_id, tire_id, claim_date,
             failure_description, mileage_at_failure, claim_amount, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
    $stmt = getDB()->prepare($sql);
    $stmt->execute([
        $line['work_order_id'], $data['position_id'] ?? null, $line['customer_id'],
        (int) $data['policy_id'], isset($data['tire_id']) ? (int) $data['tire_id'] : null,
        $data['claim_date'] ?? date('Y-m-d'),
        $data['failure_description'],
        isset($data['mileage_at_failure']) ? (int) $data['mileage_at_failure'] : null,
        $data['claim_amount'],
        $data['notes'] ?? null,
    ]);
    $newId = (int) getDB()->lastInsertId();
    auditLog('warranty_claims', $newId, 'INSERT', null, null, null, $createdBy);
    return $newId;
}

function listWarrantyClaims(string $status = '', int $limit = 50, int $offset = 0): array {
    $where = '';
    $params = [];
    if ($status !== '') {
        $where = 'WHERE wc.status = ?';
        $params[] = $status;
    }

    $total = (int) Database::scalar(
        "SELECT COUNT(*) FROM warranty_claims wc {$where}", $params
    );

    $params[] = $limit;
    $params[] = $offset;
    $rows = Database::query(
        "SELECT wc.*, c.first_name, c.last_name, wp.policy_name, wp.policy_code
         FROM warranty_claims wc
         LEFT JOIN customers c ON wc.customer_id = c.customer_id
         LEFT JOIN warranty_policies wp ON wc.policy_id = wp.policy_id
         {$where}
         ORDER BY wc.created_at DESC
         LIMIT ? OFFSET ?",
        $params
    );
    return ['rows' => $rows, 'total' => $total];
}

function getWarrantyClaim(int $claimId): ?array {
    return Database::queryOne(
        "SELECT wc.*, c.first_name, c.last_name, c.phone_primary,
                wp.policy_name, wp.policy_code, wp.max_claim_amount, wp.deductible,
                wo.wo_number
         FROM warranty_claims wc
         LEFT JOIN customers c ON wc.customer_id = c.customer_id
         LEFT JOIN warranty_policies wp ON wc.policy_id = wp.policy_id
         LEFT JOIN work_orders wo ON wc.work_order_id = wo.work_order_id
         WHERE wc.claim_id = ?",
        [$claimId]
    );
}

function reviewWarrantyClaim(int $claimId, string $action, int $reviewedBy, ?string $reason = null, ?string $amount = null): void {
    if ($action === 'approve') {
        getDB()->prepare(
            "UPDATE warranty_claims SET status = 'approved', reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP,
             claim_amount = COALESCE(?, claim_amount) WHERE claim_id = ? AND status IN ('filed','reviewing')"
        )->execute([$reviewedBy, $amount, $claimId]);
        auditLog('warranty_claims', $claimId, 'UPDATE', 'status', 'filed', 'approved', $reviewedBy);
    } elseif ($action === 'deny') {
        getDB()->prepare(
            "UPDATE warranty_claims SET status = 'denied', reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP,
             denial_reason = ? WHERE claim_id = ? AND status IN ('filed','reviewing')"
        )->execute([$reviewedBy, $reason, $claimId]);
        auditLog('warranty_claims', $claimId, 'UPDATE', 'status', 'filed', 'denied', $reviewedBy);
    }
}

function payWarrantyClaim(int $claimId, string $amount, int $paidBy): void {
    getDB()->prepare(
        "UPDATE warranty_claims SET status = 'paid', paid_amount = ?, paid_at = CURRENT_TIMESTAMP,
         paid_by = ? WHERE claim_id = ? AND status = 'approved'"
    )->execute([$amount, $paidBy, $claimId]);
    auditLog('warranty_claims', $claimId, 'UPDATE', 'status', 'approved', 'paid', $paidBy);
}


// ============================================================================
// Wheels
// ============================================================================

function createWheel(array $data): int {
    InputValidator::check('wheels', $data);
    $sql = "INSERT INTO wheels
            (brand, model, diameter, width, bolt_pattern, offset_mm, center_bore_mm,
             material, finish, `condition`, retail_price, cost, quantity,
             bin_location, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
    $stmt = getDB()->prepare($sql);
    $stmt->execute([
        $data['brand'] ?? null, $data['model'] ?? null,
        $data['diameter'], $data['width'] ?? null,
        $data['bolt_pattern'] ?? null, isset($data['offset_mm']) ? (int) $data['offset_mm'] : null,
        $data['center_bore_mm'] ?? null,
        $data['material'] ?? 'unknown', $data['finish'] ?? null,
        $data['condition'] ?? 'used',
        $data['retail_price'] ?? null, $data['cost'] ?? null,
        (int) ($data['quantity'] ?? 0),
        $data['bin_location'] ?? null, $data['notes'] ?? null,
    ]);
    return (int) getDB()->lastInsertId();
}

function getWheel(int $wheelId): ?array {
    $wheel = Database::queryOne("SELECT * FROM wheels WHERE wheel_id = ?", [$wheelId]);
    if (!$wheel) return null;
    $wheel['fitments'] = Database::query(
        "SELECT * FROM wheel_fitments WHERE wheel_id = ? ORDER BY make, model, year_start", [$wheelId]
    );
    return $wheel;
}

function updateWheel(int $wheelId, array $data): array {
    InputValidator::check('wheels', $data);
    $editable = ['brand', 'model', 'diameter', 'width', 'bolt_pattern', 'offset_mm',
                 'center_bore_mm', 'material', 'finish', 'condition', 'retail_price',
                 'cost', 'quantity', 'bin_location', 'notes', 'is_active'];
    $sets = [];
    $params = [];
    foreach ($editable as $col) {
        if (array_key_exists($col, $data)) {
            $sets[] = ($col === 'condition' ? "`condition`" : $col) . " = ?";
            $params[] = $data[$col];
        }
    }
    if (empty($sets)) return ['changed' => 0];
    $params[] = $wheelId;
    getDB()->prepare("UPDATE wheels SET " . implode(', ', $sets) . " WHERE wheel_id = ?")->execute($params);
    return ['changed' => count($sets)];
}

function searchWheels(array $filters, int $limit = 25, int $offset = 0): array {
    $where = ['w.is_active = 1'];
    $params = [];

    if (!empty($filters['diameter'])) {
        $where[] = 'w.diameter = ?';
        $params[] = $filters['diameter'];
    }
    if (!empty($filters['bolt_pattern'])) {
        $where[] = 'w.bolt_pattern = ?';
        $params[] = $filters['bolt_pattern'];
    }
    if (!empty($filters['brand'])) {
        $where[] = 'w.brand LIKE ?';
        $params[] = '%' . $filters['brand'] . '%';
    }
    if (!empty($filters['material'])) {
        $where[] = 'w.material = ?';
        $params[] = $filters['material'];
    }
    if (!empty($filters['condition'])) {
        $where[] = 'w.`condition` = ?';
        $params[] = $filters['condition'];
    }

    $whereStr = implode(' AND ', $where);
    $total = (int) Database::scalar("SELECT COUNT(*) FROM wheels w WHERE {$whereStr}", $params);

    $params[] = $limit;
    $params[] = $offset;
    $rows = Database::query(
        "SELECT * FROM wheels w WHERE {$whereStr} ORDER BY w.brand, w.diameter LIMIT ? OFFSET ?",
        $params
    );
    return ['rows' => $rows, 'total' => $total];
}

function addWheelFitment(int $wheelId, array $data): int {
    InputValidator::check('wheel_fitments', $data, ['make', 'model']);
    $sql = "INSERT INTO wheel_fitments (wheel_id, make, model, year_start, year_end, trim_level, is_oem, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)";
    $stmt = getDB()->prepare($sql);
    $stmt->execute([
        $wheelId, $data['make'], $data['model'],
        (int) $data['year_start'], (int) $data['year_end'],
        $data['trim_level'] ?? null, (int) ($data['is_oem'] ?? 0),
        $data['notes'] ?? null,
    ]);
    return (int) getDB()->lastInsertId();
}

function removeWheelFitment(int $fitmentId): void {
    getDB()->prepare("DELETE FROM wheel_fitments WHERE fitment_id = ?")->execute([$fitmentId]);
}


// ============================================================================
// Fitment Search
// ============================================================================

function searchFitmentByVehicle(string $make, string $model, ?int $year = null): array {
    // Find tires by OEM size via torque specs table (has make/model/year ranges)
    $specWhere = 'lts.make = ? AND lts.model LIKE ?';
    $specParams = [$make, '%' . $model . '%'];
    $yearFallback = false;
    if ($year) {
        $specWhere .= ' AND lts.year_start <= ? AND lts.year_end >= ?';
        $specParams[] = $year;
        $specParams[] = $year;
    }

    $specs = Database::query(
        "SELECT DISTINCT lts.* FROM lkp_torque_specs lts WHERE {$specWhere} LIMIT 10",
        $specParams
    );

    // If year-specific search found nothing, retry without year filter.
    // Torque spec data covers 1995-2021; newer vehicles won't match by year
    // but the make/model specs are usually still correct.
    if (empty($specs) && $year) {
        $specs = Database::query(
            "SELECT DISTINCT lts.* FROM lkp_torque_specs lts WHERE lts.make = ? AND lts.model LIKE ? LIMIT 10",
            [$make, '%' . $model . '%']
        );
        $yearFallback = !empty($specs);
    }

    // Find available tires matching OEM sizes from vehicles table
    $tires = [];
    if ($year) {
        $vehicle = Database::queryOne(
            "SELECT oem_tire_size FROM vehicles WHERE LOWER(make) = LOWER(?) AND LOWER(model) LIKE LOWER(?) AND year = ? LIMIT 1",
            [$make, '%' . $model . '%', $year]
        );
        if ($vehicle && $vehicle['oem_tire_size']) {
            $tires = Database::query(
                "SELECT * FROM v_tire_inventory WHERE size_display = ? AND status = 'available' LIMIT 20",
                [$vehicle['oem_tire_size']]
            );
        }
    }

    // Find wheels matching bolt pattern
    $wheels = [];
    $wheelWhere = 'wf.make = ? AND wf.model LIKE ?';
    $wheelParams = [$make, '%' . $model . '%'];
    if ($year) {
        $wheelWhere .= ' AND wf.year_start <= ? AND wf.year_end >= ?';
        $wheelParams[] = $year;
        $wheelParams[] = $year;
    }

    $wheels = Database::query(
        "SELECT DISTINCT w.* FROM wheels w
         JOIN wheel_fitments wf ON w.wheel_id = wf.wheel_id
         WHERE {$wheelWhere} AND w.is_active = 1 AND w.quantity > 0
         ORDER BY w.diameter, w.brand
         LIMIT 20",
        $wheelParams
    );

    $result = ['specs' => $specs, 'tires' => $tires, 'wheels' => $wheels];
    if ($yearFallback) {
        $result['note'] = "Torque spec data covers 1995-2021. Showing specs for {$make} {$model} (all years). Verify torque values for your specific model year.";
    }
    return $result;
}

function searchFitmentReverse(string $size): array {
    // Find vehicles that use this tire size
    $vehicles = Database::query(
        "SELECT DISTINCT make, model, year_start, year_end
         FROM lkp_torque_specs
         WHERE REPLACE(CONCAT_WS('/', make, model), ' ', '') LIKE '%'
         LIMIT 50"
    );

    // Better approach: search vehicles table for OEM size match
    $byOem = Database::query(
        "SELECT DISTINCT make, model, year FROM vehicles WHERE oem_tire_size = ? ORDER BY make, model, year",
        [$size]
    );

    // Also find tires in stock with this size
    $inStock = Database::query(
        "SELECT * FROM v_tire_inventory WHERE size_display = ? AND status = 'available' LIMIT 20",
        [$size]
    );

    return ['vehicles' => $byOem, 'in_stock' => $inStock];
}

function searchByBoltPattern(string $pattern): array {
    $wheels = Database::query(
        "SELECT * FROM wheels WHERE bolt_pattern = ? AND is_active = 1 AND quantity > 0
         ORDER BY diameter, brand",
        [$pattern]
    );

    $fitments = Database::query(
        "SELECT DISTINCT wf.make, wf.model, wf.year_start, wf.year_end
         FROM wheel_fitments wf
         JOIN wheels w ON wf.wheel_id = w.wheel_id
         WHERE w.bolt_pattern = ?
         ORDER BY wf.make, wf.model",
        [$pattern]
    );

    return ['wheels' => $wheels, 'vehicles' => $fitments];
}


// ============================================================================
// Custom Fields
// ============================================================================

function listCustomFields(string $entityType, bool $activeOnly = true): array {
    $where = 'entity_type = ?';
    $params = [$entityType];
    if ($activeOnly) { $where .= ' AND is_active = 1'; }
    return Database::query("SELECT * FROM custom_fields WHERE {$where} ORDER BY display_order, field_id", $params);
}

function createCustomField(array $data): int {
    InputValidator::check('custom_fields', $data, ['field_name', 'field_label']);
    $sql = "INSERT INTO custom_fields (entity_type, field_name, field_label, field_type, select_options, is_required, display_order)
            VALUES (?, ?, ?, ?, ?, ?, ?)";
    $stmt = getDB()->prepare($sql);
    $stmt->execute([
        $data['entity_type'], $data['field_name'], $data['field_label'],
        $data['field_type'] ?? 'text',
        isset($data['select_options']) ? json_encode($data['select_options']) : null,
        (int) ($data['is_required'] ?? 0),
        (int) ($data['display_order'] ?? 0),
    ]);
    return (int) getDB()->lastInsertId();
}

function updateCustomField(int $fieldId, array $data): array {
    $editable = ['field_label', 'field_type', 'select_options', 'is_required', 'display_order', 'is_active'];
    $sets = [];
    $params = [];
    foreach ($editable as $col) {
        if (array_key_exists($col, $data)) {
            $sets[] = "{$col} = ?";
            $params[] = $col === 'select_options' ? json_encode($data[$col]) : $data[$col];
        }
    }
    if (empty($sets)) return ['changed' => 0];
    $params[] = $fieldId;
    getDB()->prepare("UPDATE custom_fields SET " . implode(', ', $sets) . " WHERE field_id = ?")->execute($params);
    return ['changed' => count($sets)];
}

function getCustomFieldValues(string $entityType, int $entityId): array {
    return Database::query(
        "SELECT cf.field_id, cf.field_name, cf.field_label, cf.field_type, cf.select_options,
                cfv.field_value
         FROM custom_fields cf
         LEFT JOIN custom_field_values cfv ON cf.field_id = cfv.field_id AND cfv.entity_id = ?
         WHERE cf.entity_type = ? AND cf.is_active = 1
         ORDER BY cf.display_order, cf.field_id",
        [$entityId, $entityType]
    );
}

function setCustomFieldValues(int $entityId, array $fieldValues): int {
    return Database::transaction(function () use ($entityId, $fieldValues) {
        $changed = 0;
        foreach ($fieldValues as $fieldId => $value) {
            $stmt = getDB()->prepare(
                "INSERT INTO custom_field_values (field_id, entity_id, field_value)
                 VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE field_value = VALUES(field_value)"
            );
            $stmt->execute([(int) $fieldId, $entityId, $value]);
            $changed++;
        }
        return $changed;
    });
}


// ============================================================================
// API Keys
// ============================================================================

function createApiKey(string $label, int $createdBy, ?int $rateLimit = null): array {
    $raw = bin2hex(random_bytes(32));
    $hash = hash('sha256', $raw);
    $prefix = substr($raw, 0, 8);

    $sql = "INSERT INTO api_keys (key_hash, key_prefix, label, rate_limit, created_by)
            VALUES (?, ?, ?, ?, ?)";
    $stmt = getDB()->prepare($sql);
    $stmt->execute([$hash, $prefix, $label, $rateLimit ?? 1000, $createdBy]);
    $newId = (int) getDB()->lastInsertId();
    auditLog('api_keys', $newId, 'INSERT', null, null, null, $createdBy);

    return [
        'key_id' => $newId,
        'api_key' => $raw,  // Only returned once at creation
        'prefix' => $prefix,
        'label' => $label,
    ];
}

function listApiKeys(): array {
    return Database::query(
        "SELECT key_id, key_prefix, label, rate_limit, is_active, last_used_at,
                request_count, created_at
         FROM api_keys ORDER BY created_at DESC"
    );
}

function revokeApiKey(int $keyId): void {
    getDB()->prepare("UPDATE api_keys SET is_active = 0 WHERE key_id = ?")->execute([$keyId]);
}

function validateApiKey(string $rawKey): ?array {
    $hash = hash('sha256', $rawKey);
    $key = Database::queryOne(
        "SELECT * FROM api_keys WHERE key_hash = ? AND is_active = 1", [$hash]
    );
    if ($key) {
        getDB()->prepare(
            "UPDATE api_keys SET last_used_at = CURRENT_TIMESTAMP, request_count = request_count + 1 WHERE key_id = ?"
        )->execute([$key['key_id']]);
    }
    return $key;
}


// ============================================================================
// Public Inventory Queries (no auth, used by storefront)
// ============================================================================

function getPublicInventory(array $filters, int $limit = 24, int $offset = 0): array {
    $where = ["t.status = 'available'"];
    $params = [];

    if (!empty($filters['size'])) {
        $where[] = 't.size_display LIKE ?';
        $params[] = '%' . $filters['size'] . '%';
    }
    if (!empty($filters['brand_id'])) {
        $where[] = 't.brand_id = ?';
        $params[] = (int) $filters['brand_id'];
    }
    if (!empty($filters['condition'])) {
        $where[] = 't.`condition` = ?';
        $params[] = $filters['condition'];
    }
    if (!empty($filters['min_price'])) {
        $where[] = 't.retail_price >= ?';
        $params[] = $filters['min_price'];
    }
    if (!empty($filters['max_price'])) {
        $where[] = 't.retail_price <= ?';
        $params[] = $filters['max_price'];
    }

    $whereStr = implode(' AND ', $where);
    $total = (int) Database::scalar("SELECT COUNT(*) FROM v_tire_inventory t WHERE {$whereStr}", $params);

    $params[] = $limit;
    $params[] = $offset;
    // Exclude cost and internal fields from public query
    $rows = Database::query(
        "SELECT t.tire_id, t.size_display, t.brand_name, t.model_name,
                t.`condition`, t.tread_depth_32nds, t.retail_price, t.dot_tin_raw,
                t.width_mm, t.aspect_ratio, t.wheel_diameter, t.construction
         FROM v_tire_inventory t
         WHERE {$whereStr}
         ORDER BY t.retail_price ASC
         LIMIT ? OFFSET ?",
        $params
    );
    return ['rows' => $rows, 'total' => $total, 'limit' => $limit, 'offset' => $offset];
}

function getPublicTireDetail(int $tireId): ?array {
    return Database::queryOne(
        "SELECT t.tire_id, t.size_display, t.brand_name, t.model_name,
                t.`condition`, t.tread_depth_32nds, t.retail_price, t.dot_tin_raw,
                t.width_mm, t.aspect_ratio, t.wheel_diameter, t.construction,
                t.notes
         FROM v_tire_inventory t
         WHERE t.tire_id = ? AND t.status = 'available'",
        [$tireId]
    );
}

function getPublicAppointmentSlots(string $date): array {
    $slotMin = (int) (getSettingValue('appointment_slot_min') ?? 60);
    $maxPerSlot = (int) (getSettingValue('appointment_max_slot') ?? 3);
    $hoursJson = getSettingValue('shop_hours_json');
    $hours = $hoursJson ? json_decode($hoursJson, true) : [];

    $dayOfWeek = strtolower(date('D', strtotime($date)));
    $dayMap = ['mon' => 'mon', 'tue' => 'tue', 'wed' => 'wed', 'thu' => 'thu', 'fri' => 'fri', 'sat' => 'sat', 'sun' => 'sun'];
    $dayKey = $dayMap[$dayOfWeek] ?? '';
    $dayHours = $hours[$dayKey] ?? null;

    if (!$dayHours || strtolower($dayHours) === 'closed') {
        return ['date' => $date, 'slots' => [], 'closed' => true];
    }

    $parts = explode('-', $dayHours);
    if (count($parts) !== 2) return ['date' => $date, 'slots' => [], 'closed' => true];

    $openTime = strtotime($date . ' ' . trim($parts[0]));
    $closeTime = strtotime($date . ' ' . trim($parts[1]));

    // Get existing appointment counts per slot
    $existing = Database::query(
        "SELECT appointment_time, COUNT(*) AS cnt
         FROM appointments
         WHERE appointment_date = ? AND status NOT IN ('cancelled','no_show')
         GROUP BY appointment_time",
        [$date]
    );
    $booked = [];
    foreach ($existing as $row) {
        $booked[$row['appointment_time']] = (int) $row['cnt'];
    }

    $slots = [];
    $current = $openTime;
    $lastSlot = $closeTime - ($slotMin * 60);
    while ($current <= $lastSlot) {
        $time = date('H:i:00', $current);
        $count = $booked[$time] ?? 0;
        $slots[] = [
            'time' => date('H:i', $current),
            'available' => $count < $maxPerSlot,
            'booked' => $count,
            'max' => $maxPerSlot,
        ];
        $current += $slotMin * 60;
    }

    return ['date' => $date, 'slots' => $slots, 'closed' => false];
}


// ============================================================================
// NHTSA Tire Recall Checker (P4b)
// Queries NHTSA Recalls API for tire-related recalls.
// ============================================================================

function checkNhtsaRecalls(string $make, ?string $model = null, ?int $year = null): array {
    $url = 'https://api.nhtsa.gov/recalls/recallsByVehicle';
    $params = ['make' => $make];
    if ($model) $params['model'] = $model;
    if ($year) $params['modelYear'] = $year;
    $url .= '?' . http_build_query($params);

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 15,
        CURLOPT_HTTPHEADER => ['Accept: application/json'],
    ]);
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode !== 200 || !$response) {
        return ['error' => 'NHTSA API unavailable', 'recalls' => []];
    }

    $data = json_decode($response, true);
    $results = $data['results'] ?? [];

    // Filter to tire-related recalls
    $tireRecalls = array_filter($results, function ($r) {
        $component = strtolower($r['Component'] ?? '');
        return str_contains($component, 'tire') || str_contains($component, 'wheel');
    });

    return [
        'total_results' => count($results),
        'tire_related' => count($tireRecalls),
        'recalls' => array_values(array_map(function ($r) {
            return [
                'nhtsa_campaign' => $r['NHTSACampaignNumber'] ?? '',
                'component' => $r['Component'] ?? '',
                'summary' => $r['Summary'] ?? '',
                'consequence' => $r['Consequence'] ?? '',
                'remedy' => $r['Remedy'] ?? '',
                'manufacturer' => $r['Manufacturer'] ?? '',
                'model_year' => $r['ModelYear'] ?? '',
                'make' => $r['Make'] ?? '',
                'model' => $r['Model'] ?? '',
            ];
        }, $tireRecalls)),
    ];
}

function checkTireRecallByDot(string $dotTin): array {
    // DOT/TIN format: DOT XXXX XXXX WWYY
    // Extract manufacturer code (first 2 chars after DOT) and plant code
    $cleaned = preg_replace('/[^A-Za-z0-9]/', '', $dotTin);
    if (strlen($cleaned) < 4) {
        return ['error' => 'Invalid DOT/TIN format', 'recalls' => []];
    }

    // NHTSA doesn't have a direct DOT lookup API for tire recalls.
    // We search by tire manufacturer instead using the equipment recalls endpoint.
    $url = 'https://api.nhtsa.gov/recalls/recallsByEquipment?equipmentType=Tire';

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 15,
        CURLOPT_HTTPHEADER => ['Accept: application/json'],
    ]);
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode !== 200 || !$response) {
        return ['error' => 'NHTSA API unavailable', 'recalls' => []];
    }

    $data = json_decode($response, true);
    $results = $data['results'] ?? [];

    // Return recent tire recalls (limit to 50 most recent)
    $recalls = array_slice($results, 0, 50);

    return [
        'total_results' => count($results),
        'dot_tin' => $dotTin,
        'recalls' => array_values(array_map(function ($r) {
            return [
                'nhtsa_campaign' => $r['NHTSACampaignNumber'] ?? '',
                'component' => $r['Component'] ?? '',
                'summary' => $r['Summary'] ?? '',
                'consequence' => $r['Consequence'] ?? '',
                'remedy' => $r['Remedy'] ?? '',
                'manufacturer' => $r['Manufacturer'] ?? '',
            ];
        }, $recalls)),
    ];
}


// ============================================================================
// Barcode Label Generation (P4c)
// Generates ZPL (Zebra Programming Language) for thermal label printers.
// Target: Zebra ZD220 with 2.25" x 1.25" labels.
// ============================================================================

function generateTireLabelZpl(int $tireId): string {
    $tire = Database::queryOne(
        "SELECT t.tire_id, t.size_display, t.dot_tin, t.retail_price,
                t.tread_depth_32nds, t.`condition`, t.bin_facility, t.bin_shelf,
                t.bin_level, b.brand_name
         FROM v_tire_inventory t
         LEFT JOIN lkp_brands b ON t.brand_id = b.brand_id
         WHERE t.tire_id = ?",
        [$tireId]
    );

    if (!$tire) throw new RuntimeException('Tire not found');

    $size = $tire['size_display'] ?? $tire['full_size_string'] ?? '' ?? '';
    $brand = $tire['brand_name'] ?? '';
    $price = '$' . number_format((float) ($tire['retail_price'] ?? 0), 2);
    $cond = strtoupper($tire['condition'] ?? '');
    $tread = ($tire['tread_depth_32nds'] ?? '') . '/32';
    $bin = trim(($tire['bin_facility'] ?? '') . '-' . ($tire['bin_shelf'] ?? '') . '-' . ($tire['bin_level'] ?? ''), '-');
    $barcode = 'T' . str_pad($tireId, 7, '0', STR_PAD_LEFT);

    // ZPL for 2.25" x 1.25" label (203 DPI = ~456 dots x ~254 dots)
    $zpl = "^XA\n";
    $zpl .= "^CF0,28\n";
    $zpl .= "^FO20,15^FD{$size}^FS\n";
    $zpl .= "^CF0,20\n";
    $zpl .= "^FO20,50^FD{$brand}^FS\n";
    $zpl .= "^FO20,75^FD{$cond} {$tread} {$price}^FS\n";
    $zpl .= "^FO20,100^FDBIN: {$bin}^FS\n";
    // Code 128 barcode
    $zpl .= "^FO20,130^BY2,2,60\n";
    $zpl .= "^BCN,60,Y,N,N\n";
    $zpl .= "^FD{$barcode}^FS\n";
    $zpl .= "^XZ\n";

    return $zpl;
}

function generateWheelLabelZpl(int $wheelId): string {
    $wheel = Database::queryOne("SELECT * FROM wheels WHERE wheel_id = ?", [$wheelId]);
    if (!$wheel) throw new RuntimeException('Wheel not found');

    $desc = trim(($wheel['brand'] ?? '') . ' ' . ($wheel['model'] ?? ''));
    $size = $wheel['diameter'] . '"' . ($wheel['width'] ? ' x ' . $wheel['width'] . '"' : '');
    $bolt = $wheel['bolt_pattern'] ?? '';
    $price = '$' . number_format((float) ($wheel['retail_price'] ?? 0), 2);
    $barcode = 'W' . str_pad($wheelId, 7, '0', STR_PAD_LEFT);

    $zpl = "^XA\n";
    $zpl .= "^CF0,24\n";
    $zpl .= "^FO20,15^FD{$desc}^FS\n";
    $zpl .= "^CF0,20\n";
    $zpl .= "^FO20,45^FD{$size} {$bolt}^FS\n";
    $zpl .= "^FO20,70^FD{$price}^FS\n";
    $zpl .= "^FO20,100^BY2,2,60\n";
    $zpl .= "^BCN,60,Y,N,N\n";
    $zpl .= "^FD{$barcode}^FS\n";
    $zpl .= "^XZ\n";

    return $zpl;
}

function lookupByBarcode(string $barcode): ?array {
    $barcode = trim($barcode);
    if (strlen($barcode) < 2) return null;

    $prefix = $barcode[0];
    $id = (int) ltrim(substr($barcode, 1), '0');

    if ($prefix === 'T') {
        $tire = Database::queryOne("SELECT * FROM v_tire_inventory WHERE tire_id = ?", [$id]);
        return $tire ? ['type' => 'tire', 'entity' => $tire] : null;
    }

    if ($prefix === 'W') {
        $wheel = Database::queryOne("SELECT * FROM wheels WHERE wheel_id = ?", [$id]);
        return $wheel ? ['type' => 'wheel', 'entity' => $wheel] : null;
    }

    return null;
}


// ============================================================================
// Customer Communicator (P4e)
// Notification log + message templates
// ============================================================================

function logNotification(int $customerId, string $channel, string $type, string $subject, string $body, int $sentBy): int {
    $sql = "INSERT INTO notification_log (customer_id, channel, notification_type, subject, body, sent_by)
            VALUES (?, ?, ?, ?, ?, ?)";
    getDB()->prepare($sql)->execute([$customerId, $channel, $type, $subject, $body, $sentBy]);
    $newId = (int) getDB()->lastInsertId();
    auditLog('notification_log', $newId, 'INSERT', null, null, null, $sentBy);
    return $newId;
}

function getNotificationLog(int $customerId, int $limit = 20): array {
    return Database::query(
        "SELECT nl.*, u.display_name AS sent_by_name
         FROM notification_log nl
         LEFT JOIN users u ON nl.sent_by = u.user_id
         WHERE nl.customer_id = ?
         ORDER BY nl.created_at DESC
         LIMIT ?",
        [$customerId, $limit]
    );
}

function listPendingNotifications(string $type = ''): array {
    $where = "status = 'pending'";
    $params = [];
    if ($type) { $where .= ' AND notification_type = ?'; $params[] = $type; }
    return Database::query(
        "SELECT nl.*, c.first_name, c.last_name, c.phone_primary, c.email
         FROM notification_log nl
         LEFT JOIN customers c ON nl.customer_id = c.customer_id
         WHERE {$where}
         ORDER BY nl.created_at ASC LIMIT 100",
        $params
    );
}

function markNotificationSent(int $notifId): void {
    getDB()->prepare("UPDATE notification_log SET status = 'sent', sent_at = CURRENT_TIMESTAMP WHERE notification_id = ?")->execute([$notifId]);
}

function markNotificationFailed(int $notifId, string $error): void {
    getDB()->prepare("UPDATE notification_log SET status = 'failed', error_message = ? WHERE notification_id = ?")->execute([$error, $notifId]);
}


// ============================================================================
// Customer Engagement: Discount Groups, Coupons, Tire Storage
// ============================================================================

// ---- Discount Groups ----

function listDiscountGroups(bool $activeOnly = true): array {
    $where = $activeOnly ? "WHERE is_active = 1" : "";
    return Database::query("SELECT * FROM discount_groups {$where} ORDER BY group_name");
}

function getDiscountGroup(int $groupId): ?array {
    return Database::queryOne("SELECT * FROM discount_groups WHERE group_id = ?", [$groupId]);
}

function createDiscountGroup(array $data, int $createdBy): int {
    InputValidator::check('discount_groups', $data, ['group_name', 'group_code']);
    Database::execute(
        "INSERT INTO discount_groups (group_name, group_code, discount_type, discount_value, applies_to, auto_apply, min_purchase, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [
            trim($data['group_name']), strtoupper(trim($data['group_code'])),
            $data['discount_type'] ?? 'percentage', (float) ($data['discount_value'] ?? 0),
            $data['applies_to'] ?? 'all', (int) ($data['auto_apply'] ?? 1),
            $data['min_purchase'] ?? null, (int) ($data['is_active'] ?? 1),
        ]
    );
    $id = Database::lastInsertId();
    auditLog('discount_groups', $id, 'INSERT', null, null, null, $createdBy);
    return $id;
}

function updateDiscountGroup(int $groupId, array $data, int $updatedBy): array {
    $grp = getDiscountGroup($groupId);
    if (!$grp) throw new \RuntimeException('Discount group not found.');
    InputValidator::check('discount_groups', $data);

    $editable = ['group_name','group_code','discount_type','discount_value','applies_to','auto_apply','min_purchase','is_active'];
    $sets = []; $binds = []; $changes = [];
    foreach ($editable as $f) {
        if (array_key_exists($f, $data) && (string) ($data[$f] ?? '') !== (string) ($grp[$f] ?? '')) {
            $sets[] = "{$f} = ?"; $binds[] = $data[$f];
            $changes[$f] = ['old' => $grp[$f], 'new' => $data[$f]];
        }
    }
    if (empty($sets)) return ['changed' => []];
    $binds[] = $groupId;
    Database::execute("UPDATE discount_groups SET " . implode(', ', $sets) . " WHERE group_id = ?", $binds);
    foreach ($changes as $field => $vals) {
        auditLog('discount_groups', $groupId, 'UPDATE', $field, (string) ($vals['old'] ?? ''), (string) ($vals['new'] ?? ''), $updatedBy);
    }
    return ['changed' => array_keys($changes)];
}

function addCustomerToDiscountGroup(int $customerId, int $groupId, int $addedBy, ?string $expiresAt = null): int {
    $existing = Database::queryOne(
        "SELECT id FROM customer_discount_groups WHERE customer_id = ? AND group_id = ?",
        [$customerId, $groupId]
    );
    if ($existing) throw new \RuntimeException('Customer already in this discount group.');

    Database::execute(
        "INSERT INTO customer_discount_groups (customer_id, group_id, added_by, expires_at) VALUES (?, ?, ?, ?)",
        [$customerId, $groupId, $addedBy, $expiresAt]
    );
    $id = Database::lastInsertId();
    auditLog('customer_discount_groups', $id, 'INSERT', null, null, null, $addedBy);
    return $id;
}

function removeCustomerFromDiscountGroup(int $customerId, int $groupId, int $removedBy): void {
    $row = Database::queryOne(
        "SELECT id FROM customer_discount_groups WHERE customer_id = ? AND group_id = ?",
        [$customerId, $groupId]
    );
    if ($row) {
        auditLog('customer_discount_groups', $row['id'], 'DELETE', null, null, null, $removedBy);
        Database::execute("DELETE FROM customer_discount_groups WHERE id = ?", [$row['id']]);
    }
}

function getCustomerDiscountGroups(int $customerId): array {
    return Database::query(
        "SELECT dg.*, cdg.added_at, cdg.expires_at
         FROM customer_discount_groups cdg
         JOIN discount_groups dg ON cdg.group_id = dg.group_id
         WHERE cdg.customer_id = ? AND dg.is_active = 1
           AND (cdg.expires_at IS NULL OR cdg.expires_at >= CURDATE())
         ORDER BY dg.group_name",
        [$customerId]
    );
}

// ---- Coupons ----

function listCoupons(bool $activeOnly = true): array {
    $where = $activeOnly ? "WHERE is_active = 1 AND (valid_until IS NULL OR valid_until >= CURDATE())" : "";
    return Database::query("SELECT * FROM coupons {$where} ORDER BY coupon_code");
}

function getCoupon(int $couponId): ?array {
    return Database::queryOne("SELECT * FROM coupons WHERE coupon_id = ?", [$couponId]);
}

function getCouponByCode(string $code): ?array {
    return Database::queryOne("SELECT * FROM coupons WHERE coupon_code = ? AND is_active = 1", [strtoupper(trim($code))]);
}

function createCoupon(array $data, int $createdBy): int {
    InputValidator::check('coupons', $data, ['coupon_code', 'coupon_name']);
    Database::execute(
        "INSERT INTO coupons (coupon_code, coupon_name, coupon_type, discount_type, discount_value,
         buy_qty, get_qty, applies_to, min_purchase, max_discount,
         max_uses, max_uses_per_customer, valid_from, valid_until, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
            strtoupper(trim($data['coupon_code'])), trim($data['coupon_name']),
            $data['coupon_type'] ?? 'store', $data['discount_type'] ?? 'percentage',
            (float) ($data['discount_value'] ?? 0),
            $data['buy_qty'] ?? null, $data['get_qty'] ?? null,
            $data['applies_to'] ?? 'all', $data['min_purchase'] ?? null, $data['max_discount'] ?? null,
            $data['max_uses'] ?? null, $data['max_uses_per_customer'] ?? null,
            $data['valid_from'] ?? date('Y-m-d'), $data['valid_until'] ?? null,
            (int) ($data['is_active'] ?? 1),
        ]
    );
    $id = Database::lastInsertId();
    auditLog('coupons', $id, 'INSERT', null, null, null, $createdBy);
    return $id;
}

function updateCoupon(int $couponId, array $data, int $updatedBy): array {
    $c = getCoupon($couponId);
    if (!$c) throw new \RuntimeException('Coupon not found.');
    InputValidator::check('coupons', $data);

    $editable = ['coupon_code','coupon_name','coupon_type','discount_type','discount_value',
                 'buy_qty','get_qty','applies_to','min_purchase','max_discount',
                 'max_uses','max_uses_per_customer','valid_from','valid_until','is_active'];
    $sets = []; $binds = []; $changes = [];
    foreach ($editable as $f) {
        if (array_key_exists($f, $data) && (string) ($data[$f] ?? '') !== (string) ($c[$f] ?? '')) {
            $sets[] = "{$f} = ?"; $binds[] = $data[$f];
            $changes[$f] = ['old' => $c[$f], 'new' => $data[$f]];
        }
    }
    if (empty($sets)) return ['changed' => []];
    $binds[] = $couponId;
    Database::execute("UPDATE coupons SET " . implode(', ', $sets) . " WHERE coupon_id = ?", $binds);
    foreach ($changes as $field => $vals) {
        auditLog('coupons', $couponId, 'UPDATE', $field, (string) ($vals['old'] ?? ''), (string) ($vals['new'] ?? ''), $updatedBy);
    }
    return ['changed' => array_keys($changes)];
}

function recordCouponUsage(int $couponId, int $workOrderId, ?int $customerId, float $discountApplied): int {
    Database::execute(
        "INSERT INTO coupon_usage (coupon_id, work_order_id, customer_id, discount_applied) VALUES (?, ?, ?, ?)",
        [$couponId, $workOrderId, $customerId, $discountApplied]
    );
    return Database::lastInsertId();
}

function validateCoupon(string $code, ?int $customerId = null): array {
    $c = getCouponByCode($code);
    if (!$c) return ['valid' => false, 'reason' => 'Coupon code not found.'];
    if (!$c['is_active']) return ['valid' => false, 'reason' => 'Coupon is inactive.'];
    if ($c['valid_from'] && $c['valid_from'] > date('Y-m-d')) return ['valid' => false, 'reason' => 'Coupon not yet valid.'];
    if ($c['valid_until'] && $c['valid_until'] < date('Y-m-d')) return ['valid' => false, 'reason' => 'Coupon has expired.'];

    if ($c['max_uses']) {
        $used = (int) Database::scalar("SELECT COUNT(*) FROM coupon_usage WHERE coupon_id = ?", [$c['coupon_id']]);
        if ($used >= (int) $c['max_uses']) return ['valid' => false, 'reason' => 'Coupon usage limit reached.'];
    }
    if ($c['max_uses_per_customer'] && $customerId) {
        $custUsed = (int) Database::scalar(
            "SELECT COUNT(*) FROM coupon_usage WHERE coupon_id = ? AND customer_id = ?",
            [$c['coupon_id'], $customerId]
        );
        if ($custUsed >= (int) $c['max_uses_per_customer']) return ['valid' => false, 'reason' => 'You have already used this coupon.'];
    }
    return ['valid' => true, 'coupon' => $c];
}

// ---- Tire Storage ----

function listTireStorage(int $customerId = 0): array {
    $where = $customerId > 0 ? "WHERE ts.customer_id = ?" : "WHERE ts.picked_up_at IS NULL";
    $params = $customerId > 0 ? [$customerId] : [];
    return Database::query(
        "SELECT ts.*, c.first_name, c.last_name
         FROM tire_storage ts
         JOIN customers c ON ts.customer_id = c.customer_id
         {$where} ORDER BY ts.stored_at DESC",
        $params
    );
}

function getTireStorage(int $storageId): ?array {
    return Database::queryOne("SELECT * FROM tire_storage WHERE storage_id = ?", [$storageId]);
}

function createTireStorage(array $data, int $createdBy): int {
    $custId = (int) ($data['customer_id'] ?? 0);
    if ($custId <= 0) throw new \InvalidArgumentException('Customer ID is required.');

    Database::execute(
        "INSERT INTO tire_storage (customer_id, tire_id, description, quantity, location_code,
         stored_at, expected_pickup, monthly_rate)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [
            $custId, $data['tire_id'] ?? null,
            trim($data['description'] ?? 'Seasonal tire storage'),
            (int) ($data['quantity'] ?? 4),
            $data['location_code'] ?? null,
            $data['stored_at'] ?? date('Y-m-d'),
            $data['expected_pickup'] ?? null,
            (float) ($data['monthly_rate'] ?? 0),
        ]
    );
    $id = Database::lastInsertId();
    auditLog('tire_storage', $id, 'INSERT', null, null, null, $createdBy);
    return $id;
}

function updateTireStorage(int $storageId, array $data, int $updatedBy): array {
    $ts = getTireStorage($storageId);
    if (!$ts) throw new \RuntimeException('Storage record not found.');

    $editable = ['description','quantity','location_code','expected_pickup','picked_up_at','monthly_rate'];
    $sets = []; $binds = []; $changes = [];
    foreach ($editable as $f) {
        if (array_key_exists($f, $data) && (string) ($data[$f] ?? '') !== (string) ($ts[$f] ?? '')) {
            $sets[] = "{$f} = ?"; $binds[] = $data[$f];
            $changes[$f] = ['old' => $ts[$f], 'new' => $data[$f]];
        }
    }
    if (empty($sets)) return ['changed' => []];
    $binds[] = $storageId;
    Database::execute("UPDATE tire_storage SET " . implode(', ', $sets) . " WHERE storage_id = ?", $binds);
    foreach ($changes as $field => $vals) {
        auditLog('tire_storage', $storageId, 'UPDATE', $field, (string) ($vals['old'] ?? ''), (string) ($vals['new'] ?? ''), $updatedBy);
    }
    return ['changed' => array_keys($changes)];
}

function createStorageBilling(int $storageId, string $billingMonth): int {
    $ts = getTireStorage($storageId);
    if (!$ts) throw new \RuntimeException('Storage record not found.');

    Database::execute(
        "INSERT INTO storage_billing (storage_id, billing_month, amount, status) VALUES (?, ?, ?, 'pending')",
        [$storageId, $billingMonth, $ts['monthly_rate']]
    );
    return Database::lastInsertId();
}

function getStorageBilling(int $storageId): array {
    return Database::query(
        "SELECT * FROM storage_billing WHERE storage_id = ? ORDER BY billing_month DESC",
        [$storageId]
    );
}


// ============================================================================
// Tire Disposal Log (Colorado environmental compliance)
// ============================================================================

function listDisposals(?string $startDate = null, ?string $endDate = null): array {
    $where = [];
    $params = [];
    if ($startDate) { $where[] = "d.disposal_date >= ?"; $params[] = $startDate; }
    if ($endDate) { $where[] = "d.disposal_date <= ?"; $params[] = $endDate; }
    $whereStr = $where ? 'WHERE ' . implode(' AND ', $where) : '';

    return Database::query(
        "SELECT d.*, u.display_name AS logged_by_name
         FROM tire_disposal_log d
         LEFT JOIN users u ON d.logged_by = u.user_id
         {$whereStr} ORDER BY d.disposal_date DESC",
        $params
    );
}

function createDisposal(array $data, int $loggedBy): int {
    InputValidator::check('tire_disposal_log', $data);

    Database::execute(
        "INSERT INTO tire_disposal_log (tire_id, work_order_id, disposal_date, quantity,
         hauler_name, manifest_number, notes, logged_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [
            $data['tire_id'] ?? null,
            $data['work_order_id'] ?? null,
            $data['disposal_date'] ?? date('Y-m-d'),
            (int) ($data['quantity'] ?? 1),
            $data['hauler_name'] ?? null,
            $data['manifest_number'] ?? null,
            $data['notes'] ?? null,
            $loggedBy,
        ]
    );
    $id = Database::lastInsertId();
    auditLog('tire_disposal_log', $id, 'INSERT', null, null, null, $loggedBy);
    logActivity($loggedBy, 'DISPOSAL_LOG', 'tire_disposal_log', $id,
        "Disposed {$data['quantity']} tire(s)" . ($data['hauler_name'] ? " via {$data['hauler_name']}" : ''));
    return $id;
}

function getDisposal(int $disposalId): ?array {
    return Database::queryOne("SELECT * FROM tire_disposal_log WHERE disposal_id = ?", [$disposalId]);
}
