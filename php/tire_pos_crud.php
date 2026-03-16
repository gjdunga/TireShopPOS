<?php
declare(strict_types=1);

/**
 * CRUD Helper Functions (P2b).
 *
 * Entity create/update/delete operations for all POS tables.
 * Bridges to Database::pdo() via getDB() shim from tire_pos_helpers.php.
 *
 * DunganSoft Technologies, March 2026
 */

use App\Core\Database;
use App\Http\Middleware;

// ============================================================================
// Tires CRUD
// ============================================================================

function getTire(int $tireId): ?array {
    $tire = Database::queryOne(
        "SELECT t.*, b.brand_name, tt.type_label, ct.label AS construction_label
         FROM tires t
         LEFT JOIN lkp_brands b ON t.brand_id = b.brand_id
         LEFT JOIN lkp_tire_types tt ON t.tire_type_id = tt.type_id
         LEFT JOIN lkp_construction_types ct ON t.construction_id = ct.construction_id
         WHERE t.tire_id = ?",
        [$tireId]
    );
    return $tire;
}

function createTire(array $data, int $createdBy): int {
    $fields = [
        'brand_id', 'tire_type_id', 'construction_id',
        'width_mm', 'aspect_ratio', 'wheel_diameter', 'size_format',
        'speed_rating_id', 'load_index_id', 'load_construction_id',
        'model_name', 'full_size_string', 'dot_tin_raw', 'dot_mfg_week', 'dot_mfg_year',
        'tread_depth_32nds', 'condition', 'status',
        'acquisition_source_id', 'cost', 'retail_price',
        'bin_facility', 'bin_shelf', 'bin_level', 'notes'
    ];

    $setCols = [];
    $binds = [];
    foreach ($fields as $f) {
        if (array_key_exists($f, $data)) {
            $setCols[] = $f;
            $binds[] = $data[$f];
        }
    }

    if (empty($setCols)) {
        throw new \InvalidArgumentException('No tire fields provided.');
    }

    // Default status
    if (!in_array('status', $setCols, true)) {
        $setCols[] = 'status';
        $binds[] = 'available';
    }

    // Default tire_type_id (NOT NULL, default to Passenger = 3)
    if (!in_array('tire_type_id', $setCols, true)) {
        $setCols[] = 'tire_type_id';
        $binds[] = 3;
    }

    // Default construction_id (NOT NULL, default to Radial = 1)
    if (!in_array('construction_id', $setCols, true)) {
        $setCols[] = 'construction_id';
        $binds[] = 1;
    }

    // Default bin location fields (NOT NULL in schema)
    foreach (['bin_facility' => 'S', 'bin_shelf' => 'A', 'bin_level' => 1] as $binCol => $binDefault) {
        if (!in_array($binCol, $setCols, true)) {
            $setCols[] = $binCol;
            $binds[] = $binDefault;
        }
    }

    $placeholders = implode(', ', array_fill(0, count($setCols), '?'));
    $colList = implode(', ', array_map(fn($c) => "`{$c}`", $setCols));

    Database::execute(
        "INSERT INTO tires ({$colList}) VALUES ({$placeholders})",
        $binds
    );

    $newId = (int) Database::lastInsertId();
    auditLog('tires', $newId, 'INSERT', null, null, null, $createdBy);
    logActivity($createdBy, 'TIRE_ADD', 'tires', $newId, 'Added tire: ' . ($data['full_size_string'] ?? 'unknown'));
    return $newId;
}

function updateTire(int $tireId, array $data, int $updatedBy): array {
    $tire = getTire($tireId);
    if ($tire === null) {
        throw new \RuntimeException('Tire not found.');
    }

    $editable = [
        'brand_id', 'tire_type_id', 'construction_id',
        'model_name', 'full_size_string', 'dot_tin_raw', 'dot_mfg_week', 'dot_mfg_year',
        'tread_depth_32nds', 'condition', 'status',
        'cost', 'retail_price', 'bin_facility', 'bin_shelf', 'bin_level', 'notes'
    ];

    $sets = [];
    $binds = [];
    $changes = [];

    foreach ($editable as $f) {
        if (array_key_exists($f, $data) && (string) ($data[$f] ?? '') !== (string) ($tire[$f] ?? '')) {
            $sets[] = "`{$f}` = ?";
            $binds[] = $data[$f];
            $changes[$f] = ['old' => $tire[$f], 'new' => $data[$f]];
        }
    }

    if (empty($sets)) {
        return ['changed' => []];
    }

    $sets[] = "updated_at = CURRENT_TIMESTAMP";
    $binds[] = $tireId;
    Database::execute("UPDATE tires SET " . implode(', ', $sets) . " WHERE tire_id = ?", $binds);

    foreach ($changes as $field => $vals) {
        auditLog('tires', $tireId, 'UPDATE', $field, (string) ($vals['old'] ?? ''), (string) ($vals['new'] ?? ''), $updatedBy);
    }

    return ['changed' => array_keys($changes)];
}

function writeOffTire(int $tireId, string $reason, int $performedBy): void {
    $tire = getTire($tireId);
    if ($tire === null) {
        throw new \RuntimeException('Tire not found.');
    }
    if ($tire['status'] === 'written_off') {
        throw new \RuntimeException('Tire is already written off.');
    }

    $oldStatus = $tire['status'];
    Database::execute(
        "UPDATE tires SET status = 'written_off', notes = CONCAT(IFNULL(notes, ''), '\n[Write-off] ', ?), updated_at = CURRENT_TIMESTAMP WHERE tire_id = ?",
        [$reason, $tireId]
    );

    auditLog('tires', $tireId, 'UPDATE', 'status', $oldStatus, 'written_off', $performedBy);
    logActivity($performedBy, 'TIRE_WRITE_OFF', 'tires', $tireId, 'Write-off: ' . $reason);
}


// ============================================================================
// Tire Photos
// ============================================================================

function getTirePhotos(int $tireId): array {
    return Database::query(
        "SELECT photo_id, tire_id, file_path, caption, is_primary, uploaded_by, uploaded_at
         FROM tire_photos WHERE tire_id = ? ORDER BY is_primary DESC, uploaded_at DESC",
        [$tireId]
    );
}

function saveTirePhoto(int $tireId, string $filePath, ?string $caption, bool $isPrimary, int $uploadedBy): int {
    // If marking as primary, clear other primaries
    if ($isPrimary) {
        Database::execute("UPDATE tire_photos SET is_primary = 0 WHERE tire_id = ?", [$tireId]);
    }

    Database::execute(
        "INSERT INTO tire_photos (tire_id, file_path, caption, is_primary, uploaded_by) VALUES (?, ?, ?, ?, ?)",
        [$tireId, $filePath, $caption, $isPrimary ? 1 : 0, $uploadedBy]
    );

    $photoId = (int) Database::lastInsertId();
    auditLog('tire_photos', $photoId, 'INSERT', null, null, null, $uploadedBy);
    return $photoId;
}

function deleteTirePhoto(int $photoId, int $deletedBy): string {
    $photo = Database::queryOne("SELECT * FROM tire_photos WHERE photo_id = ?", [$photoId]);
    if ($photo === null) {
        throw new \RuntimeException('Photo not found.');
    }

    Database::execute("DELETE FROM tire_photos WHERE photo_id = ?", [$photoId]);
    auditLog('tire_photos', $photoId, 'DELETE', null, null, null, $deletedBy);
    return $photo['file_path'];
}


// ============================================================================
// Customers CRUD
// ============================================================================

function getCustomer(int $customerId): ?array {
    return Database::queryOne(
        "SELECT * FROM customers WHERE customer_id = ?",
        [$customerId]
    );
}

function createCustomer(array $data, int $createdBy): int {
    $required = ['first_name', 'last_name'];
    foreach ($required as $r) {
        if (empty(trim($data[$r] ?? ''))) {
            throw new \InvalidArgumentException("Field \"{$r}\" is required.");
        }
    }

    Database::execute(
        "INSERT INTO customers (first_name, last_name, phone_primary, phone_secondary, email, address_line1, address_line2, city, state, zip, is_tax_exempt, tax_exempt_id, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
            trim($data['first_name']),
            trim($data['last_name']),
            $data['phone_primary'] ?? null,
            $data['phone_secondary'] ?? null,
            $data['email'] ?? null,
            $data['address_line1'] ?? null,
            $data['address_line2'] ?? null,
            $data['city'] ?? null,
            $data['state'] ?? null,
            $data['zip'] ?? null,
            (int) ($data['is_tax_exempt'] ?? 0),
            $data['tax_exempt_id'] ?? null,
            $data['notes'] ?? null,
            $createdBy,
        ]
    );

    $newId = (int) Database::lastInsertId();
    auditLog('customers', $newId, 'INSERT', null, null, null, $createdBy);
    logActivity($createdBy, 'CUSTOMER_CREATE', 'customers', $newId, trim($data['first_name']) . ' ' . trim($data['last_name']));
    return $newId;
}

function updateCustomer(int $customerId, array $data, int $updatedBy): array {
    $customer = getCustomer($customerId);
    if ($customer === null) {
        throw new \RuntimeException('Customer not found.');
    }

    $editable = ['first_name', 'last_name', 'phone_primary', 'phone_secondary', 'email',
                 'address_line1', 'address_line2', 'city', 'state', 'zip',
                 'is_tax_exempt', 'tax_exempt_id', 'notes'];
    $sets = [];
    $binds = [];
    $changes = [];

    foreach ($editable as $f) {
        if (array_key_exists($f, $data) && (string) ($data[$f] ?? '') !== (string) ($customer[$f] ?? '')) {
            $sets[] = "{$f} = ?";
            $binds[] = $data[$f];
            $changes[$f] = ['old' => $customer[$f], 'new' => $data[$f]];
        }
    }

    if (empty($sets)) {
        return ['changed' => []];
    }

    $sets[] = "updated_at = CURRENT_TIMESTAMP";
    $binds[] = $customerId;
    Database::execute("UPDATE customers SET " . implode(', ', $sets) . " WHERE customer_id = ?", $binds);

    foreach ($changes as $field => $vals) {
        auditLog('customers', $customerId, 'UPDATE', $field, (string) ($vals['old'] ?? ''), (string) ($vals['new'] ?? ''), $updatedBy);
    }

    return ['changed' => array_keys($changes)];
}


// ============================================================================
// Vehicles CRUD
// ============================================================================

function getVehicle(int $vehicleId): ?array {
    return Database::queryOne(
        "SELECT v.*
         FROM vehicles v
         WHERE v.vehicle_id = ?",
        [$vehicleId]
    );
}

function createVehicle(array $data, int $createdBy): int {
    $required = ['year', 'make', 'model'];
    foreach ($required as $r) {
        if (empty(trim((string) ($data[$r] ?? '')))) {
            throw new \InvalidArgumentException("Field \"{$r}\" is required.");
        }
    }

    Database::execute(
        "INSERT INTO vehicles (year, make, model, trim_level, vin, license_plate, license_state,
                               color, drivetrain, lug_count, lug_pattern, torque_spec_ftlbs,
                               oem_tire_size, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
            (int) $data['year'],
            trim($data['make']),
            trim($data['model']),
            $data['trim_level'] ?? null,
            $data['vin'] ?? null,
            $data['license_plate'] ?? null,
            $data['license_state'] ?? null,
            $data['color'] ?? null,
            $data['drivetrain'] ?? null,
            isset($data['lug_count']) ? (int) $data['lug_count'] : null,
            $data['lug_pattern'] ?? null,
            isset($data['torque_spec_ftlbs']) ? (int) $data['torque_spec_ftlbs'] : null,
            $data['oem_tire_size'] ?? null,
            $data['notes'] ?? null,
            $createdBy,
        ]
    );

    $newId = (int) Database::lastInsertId();
    auditLog('vehicles', $newId, 'INSERT', null, null, null, $createdBy);
    logActivity($createdBy, 'VEHICLE_CREATE', 'vehicles', $newId, ($data['year'] ?? '') . ' ' . ($data['make'] ?? '') . ' ' . ($data['model'] ?? ''));
    return $newId;
}

function updateVehicle(int $vehicleId, array $data, int $updatedBy): array {
    $vehicle = Database::queryOne("SELECT * FROM vehicles WHERE vehicle_id = ?", [$vehicleId]);
    if ($vehicle === null) {
        throw new \RuntimeException('Vehicle not found.');
    }

    $editable = ['year', 'make', 'model', 'trim_level', 'vin', 'license_plate',
                 'license_state', 'color', 'drivetrain', 'lug_count', 'lug_pattern',
                 'torque_spec_ftlbs', 'oem_tire_size', 'notes'];
    $sets = [];
    $binds = [];
    $changes = [];

    foreach ($editable as $f) {
        if (array_key_exists($f, $data) && (string) ($data[$f] ?? '') !== (string) ($vehicle[$f] ?? '')) {
            $sets[] = "{$f} = ?";
            $binds[] = $data[$f];
            $changes[$f] = ['old' => $vehicle[$f], 'new' => $data[$f]];
        }
    }

    if (empty($sets)) {
        return ['changed' => []];
    }

    $sets[] = "updated_at = CURRENT_TIMESTAMP";
    $binds[] = $vehicleId;
    Database::execute("UPDATE vehicles SET " . implode(', ', $sets) . " WHERE vehicle_id = ?", $binds);

    foreach ($changes as $field => $vals) {
        auditLog('vehicles', $vehicleId, 'UPDATE', $field, (string) ($vals['old'] ?? ''), (string) ($vals['new'] ?? ''), $updatedBy);
    }

    return ['changed' => array_keys($changes)];
}

function linkCustomerVehicle(int $customerId, int $vehicleId, int $performedBy): void {
    $existing = Database::scalar(
        "SELECT COUNT(*) FROM customer_vehicles WHERE customer_id = ? AND vehicle_id = ?",
        [$customerId, $vehicleId]
    );
    if ((int) $existing > 0) {
        throw new \RuntimeException('Vehicle is already linked to this customer.');
    }
    Database::execute(
        "INSERT INTO customer_vehicles (customer_id, vehicle_id) VALUES (?, ?)",
        [$customerId, $vehicleId]
    );
    auditLog('customer_vehicles', $customerId, 'INSERT', 'vehicle_id', null, (string) $vehicleId, $performedBy);
}

function unlinkCustomerVehicle(int $customerId, int $vehicleId, int $performedBy): void {
    $affected = Database::execute(
        "DELETE FROM customer_vehicles WHERE customer_id = ? AND vehicle_id = ?",
        [$customerId, $vehicleId]
    );
    if ($affected === 0) {
        throw new \RuntimeException('Link not found.');
    }
    auditLog('customer_vehicles', $customerId, 'DELETE', 'vehicle_id', (string) $vehicleId, null, $performedBy);
}


// ============================================================================
// Work Orders CRUD
// ============================================================================

function getWorkOrder(int $woId): ?array {
    $wo = Database::queryOne(
        "SELECT wo.*, u.display_name AS assigned_tech_name,
                c.first_name AS customer_first, c.last_name AS customer_last,
                v.year AS vehicle_year, v.make AS vehicle_make, v.model AS vehicle_model,
                v.vin, v.torque_spec_ftlbs AS vehicle_torque_spec
         FROM work_orders wo
         LEFT JOIN users u ON wo.assigned_tech_id = u.user_id
         LEFT JOIN vehicles v ON wo.vehicle_id = v.vehicle_id
         LEFT JOIN customers c ON wo.customer_id = c.customer_id
         WHERE wo.work_order_id = ?",
        [$woId]
    );
    if ($wo !== null) {
        $wo['positions'] = Database::query(
            "SELECT wop.*,
                    t_ex.size_display AS full_size_string, t_ex.brand_name AS existing_tire_brand,
                    t_new.size_display AS new_tire_size, t_new.brand_name AS new_tire_brand
             FROM work_order_positions wop
             LEFT JOIN v_tire_inventory t_ex ON wop.tire_id_existing = t_ex.tire_id
             LEFT JOIN v_tire_inventory t_new ON wop.tire_id_new = t_new.tire_id
             WHERE wop.work_order_id = ?
             ORDER BY FIELD(wop.position_code, 'LF','RF','LR','RR','SPARE','LRI','RRI','LFI','RFI')",
            [$woId]
        );
    }
    return $wo;
}

function createWorkOrder(array $data, int $createdBy): int {
    $woNumber = nextWorkOrderNumber();

    Database::execute(
        "INSERT INTO work_orders (wo_number, customer_id, vehicle_id, assigned_tech_id,
                                   status, mileage_in, customer_complaint, special_notes,
                                   estimated_price, created_by)
         VALUES (?, ?, ?, ?, 'intake', ?, ?, ?, ?, ?)",
        [
            $woNumber,
            (int) ($data['customer_id'] ?? 0),
            isset($data['vehicle_id']) ? (int) $data['vehicle_id'] : null,
            isset($data['assigned_tech_id']) ? (int) $data['assigned_tech_id'] : null,
            $data['mileage_in'] ?? null,
            $data['customer_complaint'] ?? null,
            $data['special_notes'] ?? null,
            isset($data['estimated_price']) && $data['estimated_price'] !== '' ? $data['estimated_price'] : null,
            $createdBy,
        ]
    );

    $newId = (int) Database::lastInsertId();
    auditLog('work_orders', $newId, 'INSERT', null, null, null, $createdBy);
    logActivity($createdBy, 'WO_CREATE', 'work_orders', $newId, 'Created WO: ' . $woNumber);
    return $newId;
}

function updateWorkOrder(int $woId, array $data, int $updatedBy): array {
    $wo = Database::queryOne("SELECT * FROM work_orders WHERE work_order_id = ?", [$woId]);
    if ($wo === null) {
        throw new \RuntimeException('Work order not found.');
    }

    $editable = ['customer_id', 'vehicle_id', 'mileage_in', 'mileage_out',
                 'customer_complaint', 'tech_diagnosis', 'special_notes', 'status',
                 'estimated_price',
                 'torque_spec_used', 'torque_verified_by', 'torque_verified_at'];
    $sets = [];
    $binds = [];
    $changes = [];

    foreach ($editable as $f) {
        if (array_key_exists($f, $data) && (string) ($data[$f] ?? '') !== (string) ($wo[$f] ?? '')) {
            $sets[] = "{$f} = ?";
            $binds[] = $data[$f];
            $changes[$f] = ['old' => $wo[$f], 'new' => $data[$f]];
        }
    }

    if (empty($sets)) {
        return ['changed' => []];
    }

    $sets[] = "updated_at = CURRENT_TIMESTAMP";
    $binds[] = $woId;
    Database::execute("UPDATE work_orders SET " . implode(', ', $sets) . " WHERE work_order_id = ?", $binds);

    foreach ($changes as $field => $vals) {
        auditLog('work_orders', $woId, 'UPDATE', $field, (string) ($vals['old'] ?? ''), (string) ($vals['new'] ?? ''), $updatedBy);
    }

    return ['changed' => array_keys($changes)];
}

function assignWorkOrder(int $woId, int $techId, int $assignedBy): void {
    $wo = Database::queryOne("SELECT assigned_tech_id FROM work_orders WHERE work_order_id = ?", [$woId]);
    if ($wo === null) {
        throw new \RuntimeException('Work order not found.');
    }

    Database::execute(
        "UPDATE work_orders SET assigned_tech_id = ?, updated_at = CURRENT_TIMESTAMP WHERE work_order_id = ?",
        [$techId, $woId]
    );
    auditLog('work_orders', $woId, 'UPDATE', 'assigned_tech_id', (string) ($wo['assigned_tech_id'] ?? ''), (string) $techId, $assignedBy);
    logActivity($assignedBy, 'WO_ASSIGN', 'work_orders', $woId, 'Assigned tech ID ' . $techId);
}

function addWorkOrderPosition(int $woId, array $data, int $createdBy): int {
    $wo = Database::queryOne("SELECT work_order_id FROM work_orders WHERE work_order_id = ?", [$woId]);
    if ($wo === null) {
        throw new \RuntimeException('Work order not found.');
    }

    Database::execute(
        "INSERT INTO work_order_positions (work_order_id, position_code, action_requested,
                                            rotate_to_position, tire_id_existing, tire_id_new,
                                            tread_depth_in, tread_depth_out, psi_in, psi_out,
                                            condition_notes, condition_grade)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
            $woId,
            $data['position_code'] ?? 'LF',
            $data['action_requested'] ?? 'none',
            $data['rotate_to_position'] ?? null,
            isset($data['tire_id_existing']) ? (int) $data['tire_id_existing'] : null,
            isset($data['tire_id_new']) ? (int) $data['tire_id_new'] : null,
            $data['tread_depth_in'] ?? null,
            $data['tread_depth_out'] ?? null,
            $data['psi_in'] ?? null,
            $data['psi_out'] ?? null,
            $data['condition_notes'] ?? null,
            $data['condition_grade'] ?? 'not_inspected',
        ]
    );

    $posId = (int) Database::lastInsertId();
    auditLog('work_order_positions', $posId, 'INSERT', null, null, null, $createdBy);
    return $posId;
}

function updateWorkOrderPosition(int $posId, array $data, int $updatedBy): array {
    $pos = Database::queryOne("SELECT * FROM work_order_positions WHERE position_id = ?", [$posId]);
    if ($pos === null) {
        throw new \RuntimeException('Position not found.');
    }

    $editable = ['position_code', 'action_requested', 'rotate_to_position',
                 'tire_id_existing', 'tire_id_new',
                 'tread_depth_in', 'tread_depth_out', 'psi_in', 'psi_out',
                 'condition_notes', 'condition_grade',
                 'is_completed', 'completed_by', 'completed_at'];
    $sets = [];
    $binds = [];
    $changes = [];

    foreach ($editable as $f) {
        if (array_key_exists($f, $data) && (string) ($data[$f] ?? '') !== (string) ($pos[$f] ?? '')) {
            $sets[] = "{$f} = ?";
            $binds[] = $data[$f];
            $changes[$f] = ['old' => $pos[$f], 'new' => $data[$f]];
        }
    }

    if (empty($sets)) {
        return ['changed' => []];
    }

    $binds[] = $posId;
    Database::execute("UPDATE work_order_positions SET " . implode(', ', $sets) . " WHERE position_id = ?", $binds);

    foreach ($changes as $field => $vals) {
        auditLog('work_order_positions', $posId, 'UPDATE', $field, (string) ($vals['old'] ?? ''), (string) ($vals['new'] ?? ''), $updatedBy);
    }

    return ['changed' => array_keys($changes)];
}

function completeWorkOrder(int $woId, int $completedBy): array {
    // Torque gate: every position must have torque_verified = 1
    $check = canCompleteWorkOrder($woId);
    if (!$check['can_complete']) {
        throw new \RuntimeException('Cannot complete: ' . implode('; ', $check['blockers']));
    }

    Database::execute(
        "UPDATE work_orders SET status = 'complete', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE work_order_id = ?",
        [$woId]
    );

    auditLog('work_orders', $woId, 'UPDATE', 'status', 'in_progress', 'complete', $completedBy);
    logActivity($completedBy, 'WO_COMPLETE', 'work_orders', $woId, 'Completed work order');

    return $check;
}


// ============================================================================
// Invoices CRUD
// ============================================================================

function getInvoice(int $invoiceId): ?array {
    $inv = Database::queryOne(
        "SELECT i.*, c.first_name AS customer_first, c.last_name AS customer_last
         FROM invoices i
         LEFT JOIN customers c ON i.customer_id = c.customer_id
         WHERE i.invoice_id = ?",
        [$invoiceId]
    );
    if ($inv !== null) {
        $inv['line_items'] = Database::query(
            "SELECT li.*, t.size_display AS tire_size
             FROM invoice_line_items li
             LEFT JOIN v_tire_inventory t ON li.tire_id = t.tire_id
             WHERE li.invoice_id = ? ORDER BY li.display_order, li.line_id",
            [$invoiceId]
        );
        $inv['payments'] = Database::query(
            "SELECT p.*, u.display_name AS processed_by_name
             FROM payments p
             LEFT JOIN users u ON p.processed_by = u.user_id
             WHERE p.invoice_id = ? ORDER BY p.processed_at",
            [$invoiceId]
        );
    }
    return $inv;
}

function createInvoice(array $data, int $createdBy): int {
    $invNumber = nextInvoiceNumber();

    // Get tax rate from config
    $taxRate = getConfigValue('tax_rate') ?? '0.0790';

    Database::execute(
        "INSERT INTO invoices (invoice_number, customer_id, work_order_id,
                                tax_rate, status, created_by)
         VALUES (?, ?, ?, ?, 'open', ?)",
        [
            $invNumber,
            (int) ($data['customer_id'] ?? 0),
            isset($data['work_order_id']) ? (int) $data['work_order_id'] : null,
            $taxRate,
            $createdBy,
        ]
    );

    $newId = (int) Database::lastInsertId();
    auditLog('invoices', $newId, 'INSERT', null, null, null, $createdBy);
    logActivity($createdBy, 'INVOICE_CREATE', 'invoices', $newId, 'Created invoice: ' . $invNumber);
    return $newId;
}

function addInvoiceLineItem(int $invoiceId, array $data, int $addedBy): int {
    $inv = Database::queryOne("SELECT status FROM invoices WHERE invoice_id = ?", [$invoiceId]);
    if ($inv === null) {
        throw new \RuntimeException('Invoice not found.');
    }
    if ($inv['status'] === 'void') {
        throw new \RuntimeException('Cannot add items to a voided invoice.');
    }

    $qty = (float) ($data['quantity'] ?? 1);
    $price = (float) ($data['unit_price'] ?? 0);
    $lineTotal = round($qty * $price, 2);

    Database::execute(
        "INSERT INTO invoice_line_items (invoice_id, line_type, description, tire_id, service_id,
                                          fee_config_id, quantity, unit_price, line_total,
                                          is_taxable, display_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
            $invoiceId,
            $data['line_type'] ?? 'custom',
            $data['description'] ?? '',
            isset($data['tire_id']) ? (int) $data['tire_id'] : null,
            isset($data['service_id']) ? (int) $data['service_id'] : null,
            isset($data['fee_config_id']) ? (int) $data['fee_config_id'] : null,
            $qty,
            $price,
            $lineTotal,
            (int) ($data['is_taxable'] ?? 1),
            (int) ($data['display_order'] ?? 0),
        ]
    );

    $itemId = (int) Database::lastInsertId();
    auditLog('invoice_line_items', $itemId, 'INSERT', null, null, null, $addedBy);
    return $itemId;
}

function removeInvoiceLineItem(int $itemId, int $removedBy): void {
    $item = Database::queryOne(
        "SELECT li.*, i.status AS invoice_status FROM invoice_line_items li
         JOIN invoices i ON li.invoice_id = i.invoice_id
         WHERE li.line_id = ?",
        [$itemId]
    );
    if ($item === null) {
        throw new \RuntimeException('Line item not found.');
    }
    if ($item['invoice_status'] === 'voided') {
        throw new \RuntimeException('Cannot remove items from a voided invoice.');
    }

    Database::execute("DELETE FROM invoice_line_items WHERE line_id = ?", [$itemId]);
    auditLog('invoice_line_items', $itemId, 'DELETE', null, null, null, $removedBy);
}

function voidInvoice(int $invoiceId, string $reason, int $voidedBy): void {
    $inv = Database::queryOne("SELECT status FROM invoices WHERE invoice_id = ?", [$invoiceId]);
    if ($inv === null) {
        throw new \RuntimeException('Invoice not found.');
    }
    if ($inv['status'] === 'void') {
        throw new \RuntimeException('Invoice is already voided.');
    }

    Database::execute(
        "UPDATE invoices SET status = 'void', notes = CONCAT(IFNULL(notes, ''), '\n[Voided] ', ?), updated_at = CURRENT_TIMESTAMP WHERE invoice_id = ?",
        [$reason, $invoiceId]
    );
    auditLog('invoices', $invoiceId, 'UPDATE', 'status', $inv['status'], 'void', $voidedBy);
    logActivity($voidedBy, 'INVOICE_VOID', 'invoices', $invoiceId, 'Voided: ' . $reason);
}


// ============================================================================
// Payments
// ============================================================================

function recordPayment(int $invoiceId, array $data, int $recordedBy): int {
    $inv = Database::queryOne("SELECT status FROM invoices WHERE invoice_id = ?", [$invoiceId]);
    if ($inv === null) {
        throw new \RuntimeException('Invoice not found.');
    }
    if ($inv['status'] === 'voided') {
        throw new \RuntimeException('Cannot accept payment on a voided invoice.');
    }

    Database::execute(
        "INSERT INTO payments (invoice_id, payment_method, amount, reference_number, is_deposit, processed_by, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)",
        [
            $invoiceId,
            $data['payment_method'] ?? 'cash',
            $data['amount'] ?? '0.00',
            $data['reference_number'] ?? null,
            (int) ($data['is_deposit'] ?? 0),
            $recordedBy,
            $data['notes'] ?? null,
        ]
    );

    $paymentId = (int) Database::lastInsertId();
    auditLog('payments', $paymentId, 'INSERT', null, null, null, $recordedBy);
    logActivity($recordedBy, 'PAYMENT_ACCEPT', 'payments', $paymentId, ($data['payment_method'] ?? 'cash') . ' $' . ($data['amount'] ?? '0'));

    // Recalculate: if fully paid, mark invoice completed
    recalcInvoiceTotals($invoiceId);
    $updated = Database::queryOne("SELECT total, amount_paid FROM invoices WHERE invoice_id = ?", [$invoiceId]);
    if ($updated && (float) $updated['amount_paid'] >= (float) $updated['total'] && (float) $updated['total'] > 0) {
        Database::execute("UPDATE invoices SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE invoice_id = ? AND status = 'open'", [$invoiceId]);
        auditLog('invoices', $invoiceId, 'UPDATE', 'status', 'open', 'completed', $recordedBy);
    }

    return $paymentId;
}

function getInvoicePayments(int $invoiceId): array {
    return Database::query(
        "SELECT p.*, u.display_name AS processed_by_name
         FROM payments p
         LEFT JOIN users u ON p.processed_by = u.user_id
         WHERE p.invoice_id = ? ORDER BY p.processed_at",
        [$invoiceId]
    );
}


// ============================================================================
// Deposits
// ============================================================================

function createDeposit(array $data, int $createdBy): int {
    $customerId = (int) ($data['customer_id'] ?? 0);
    if ($customerId === 0) {
        throw new \InvalidArgumentException('Field "customer_id" is required.');
    }

    $minPct = getMinimumDepositPercent();
    $expirationDays = getDepositExpirationDays();
    $expiresAt = date('Y-m-d', strtotime("+{$expirationDays} days"));

    Database::execute(
        "INSERT INTO deposits (customer_id, amount, payment_method, reference_number,
                                estimated_total, expires_at, notes, received_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [
            $customerId,
            $data['amount'] ?? '0.00',
            $data['payment_method'] ?? 'cash',
            $data['reference_number'] ?? null,
            $data['estimated_total'] ?? null,
            $expiresAt,
            $data['notes'] ?? null,
            $createdBy,
        ]
    );

    $depositId = (int) Database::lastInsertId();
    auditLog('deposits', $depositId, 'INSERT', null, null, null, $createdBy);
    logActivity($createdBy, 'DEPOSIT_ACCEPT', 'deposits', $depositId, 'Deposit $' . ($data['amount'] ?? '0'));
    return $depositId;
}

function applyDeposit(int $depositId, int $invoiceId, int $appliedBy): void {
    $deposit = Database::queryOne("SELECT * FROM deposits WHERE deposit_id = ?", [$depositId]);
    if ($deposit === null) {
        throw new \RuntimeException('Deposit not found.');
    }
    if ($deposit['status'] !== 'held') {
        throw new \RuntimeException('Deposit is not in "held" status (current: ' . $deposit['status'] . ').');
    }

    Database::execute(
        "UPDATE deposits SET status = 'applied', applied_to_invoice_id = ?, updated_at = CURRENT_TIMESTAMP WHERE deposit_id = ?",
        [$invoiceId, $depositId]
    );
    auditLog('deposits', $depositId, 'UPDATE', 'status', 'held', 'applied', $appliedBy);
    logActivity($appliedBy, 'DEPOSIT_APPLY', 'deposits', $depositId, 'Applied to invoice ' . $invoiceId);
}

function forfeitDeposit(int $depositId, string $reason, int $forfeitedBy): void {
    $deposit = Database::queryOne("SELECT * FROM deposits WHERE deposit_id = ?", [$depositId]);
    if ($deposit === null) {
        throw new \RuntimeException('Deposit not found.');
    }
    if ($deposit['status'] !== 'held') {
        throw new \RuntimeException('Only held deposits can be forfeited.');
    }

    Database::execute(
        "UPDATE deposits SET status = 'forfeited', notes = CONCAT(IFNULL(notes, ''), '\n[Forfeited] ', ?), updated_at = CURRENT_TIMESTAMP WHERE deposit_id = ?",
        [$reason, $depositId]
    );
    auditLog('deposits', $depositId, 'UPDATE', 'status', 'held', 'forfeited', $forfeitedBy);
    logActivity($forfeitedBy, 'DEPOSIT_FORFEIT', 'deposits', $depositId, 'Forfeited: ' . $reason);
}


// ============================================================================
// Refunds
// ============================================================================

function createRefundRequest(array $data, int $requestedBy): int {
    $invoiceId = (int) ($data['invoice_id'] ?? 0);
    $amount = $data['amount'] ?? '0.00';
    $reason = $data['reason'] ?? '';

    if ($invoiceId === 0) {
        throw new \InvalidArgumentException('Field "invoice_id" is required.');
    }

    // Validate via existing function
    $validation = validateRefundRequest($invoiceId, $amount, $requestedBy);
    if (($validation['decision'] ?? '') === 'DENY') {
        throw new \RuntimeException('Refund denied: ' . ($validation['reason'] ?? 'unknown'));
    }

    Database::execute(
        "INSERT INTO refunds (invoice_id, amount, reason, status, requested_by)
         VALUES (?, ?, ?, 'pending', ?)",
        [$invoiceId, $amount, $reason, $requestedBy]
    );

    $refundId = (int) Database::lastInsertId();
    auditLog('refunds', $refundId, 'INSERT', null, null, null, $requestedBy);
    logActivity($requestedBy, 'REFUND_REQUEST', 'refunds', $refundId, 'Request $' . $amount . ' for invoice ' . $invoiceId);
    return $refundId;
}

function approveRefund(int $refundId, int $approvedBy): void {
    $refund = Database::queryOne("SELECT * FROM refunds WHERE refund_id = ?", [$refundId]);
    if ($refund === null) {
        throw new \RuntimeException('Refund not found.');
    }
    if ($refund['status'] !== 'pending') {
        throw new \RuntimeException('Refund is not pending.');
    }

    // Check if approver has sufficient permission for the amount
    $amount = (float) $refund['amount'];
    $threshold = 60.00; // From schema: manager < $60, owner > $60
    if ($amount > $threshold && !hasPermission($approvedBy, 'REFUND_APPROVE_HIGH')) {
        throw new \RuntimeException('Amount exceeds your refund approval threshold ($' . number_format($threshold, 2) . ').');
    }

    Database::execute(
        "UPDATE refunds SET status = 'approved', approved_by = ?, approved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE refund_id = ?",
        [$approvedBy, $refundId]
    );
    auditLog('refunds', $refundId, 'UPDATE', 'status', 'pending', 'approved', $approvedBy);
    logActivity($approvedBy, 'REFUND_APPROVE', 'refunds', $refundId, 'Approved $' . $refund['amount']);
}


// ============================================================================
// Purchase Orders CRUD
// ============================================================================

function getPurchaseOrder(int $poId): ?array {
    $po = Database::queryOne(
        "SELECT po.*, v.vendor_name, v.contact_name, v.phone AS vendor_phone
         FROM purchase_orders po
         LEFT JOIN vendors v ON po.vendor_id = v.vendor_id
         WHERE po.po_id = ?",
        [$poId]
    );
    if ($po !== null) {
        $po['line_items'] = Database::query(
            "SELECT * FROM po_line_items WHERE po_id = ? ORDER BY po_line_id",
            [$poId]
        );
    }
    return $po;
}

function createPurchaseOrder(array $data, int $createdBy): int {
    $vendorId = (int) ($data['vendor_id'] ?? 0);
    if ($vendorId === 0) {
        throw new \InvalidArgumentException('Field "vendor_id" is required.');
    }

    $poNumber = nextPONumber();

    Database::execute(
        "INSERT INTO purchase_orders (po_number, vendor_id, order_date, status, notes, created_by)
         VALUES (?, ?, ?, 'draft', ?, ?)",
        [$poNumber, $vendorId, $data['order_date'] ?? date('Y-m-d'), $data['notes'] ?? null, $createdBy]
    );

    $newId = (int) Database::lastInsertId();
    auditLog('purchase_orders', $newId, 'INSERT', null, null, null, $createdBy);
    logActivity($createdBy, 'PO_CREATE', 'purchase_orders', $newId, 'Created PO: ' . $poNumber);
    return $newId;
}

function addPoLineItem(int $poId, array $data, int $addedBy): int {
    $po = Database::queryOne("SELECT status FROM purchase_orders WHERE po_id = ?", [$poId]);
    if ($po === null) {
        throw new \RuntimeException('Purchase order not found.');
    }

    Database::execute(
        "INSERT INTO po_line_items (po_id, description, size_string, brand, quantity_ordered, unit_cost)
         VALUES (?, ?, ?, ?, ?, ?)",
        [
            $poId,
            $data['description'] ?? '',
            $data['size_string'] ?? null,
            $data['brand'] ?? null,
            (int) ($data['quantity_ordered'] ?? 1),
            $data['unit_cost'] ?? '0.00',
        ]
    );

    $lineId = (int) Database::lastInsertId();
    auditLog('po_line_items', $lineId, 'INSERT', null, null, null, $addedBy);
    return $lineId;
}

function receivePurchaseOrder(int $poId, array $receivedItems, int $receivedBy): array {
    $po = Database::queryOne("SELECT * FROM purchase_orders WHERE po_id = ?", [$poId]);
    if ($po === null) {
        throw new \RuntimeException('Purchase order not found.');
    }

    $results = [];
    foreach ($receivedItems as $item) {
        $lineId = (int) ($item['po_line_id'] ?? 0);
        $qtyReceived = (int) ($item['quantity_received'] ?? 0);

        if ($lineId === 0 || $qtyReceived === 0) continue;

        Database::execute(
            "UPDATE po_line_items SET quantity_received = quantity_received + ? WHERE po_line_id = ? AND po_id = ?",
            [$qtyReceived, $lineId, $poId]
        );
        auditLog('po_line_items', $lineId, 'UPDATE', 'quantity_received', null, (string) $qtyReceived, $receivedBy);
        $results[] = ['po_line_id' => $lineId, 'quantity_received' => $qtyReceived];
    }

    // Check if all lines are fully received
    $remaining = Database::scalar(
        "SELECT COUNT(*) FROM po_line_items WHERE po_id = ? AND quantity_received < quantity_ordered",
        [$poId]
    );
    $newStatus = ((int) $remaining === 0) ? 'received' : 'partial';
    Database::execute(
        "UPDATE purchase_orders SET status = ?, received_at = CURRENT_TIMESTAMP, received_by = ?, updated_at = CURRENT_TIMESTAMP WHERE po_id = ?",
        [$newStatus, $receivedBy, $poId]
    );
    auditLog('purchase_orders', $poId, 'UPDATE', 'status', $po['status'], $newStatus, $receivedBy);
    logActivity($receivedBy, 'PO_RECEIVE', 'purchase_orders', $poId, 'Received ' . count($results) . ' line(s)');

    return ['status' => $newStatus, 'received' => $results];
}


// ============================================================================
function listPurchaseOrders(string $status = '', int $limit = 50, int $offset = 0): array {
    $where = '';
    $params = [];
    if ($status !== '') {
        $where = 'WHERE po.status = ?';
        $params[] = $status;
    }

    $total = (int) Database::scalar(
        "SELECT COUNT(*) FROM purchase_orders po {$where}", $params
    );

    $params[] = $limit;
    $params[] = $offset;
    $rows = Database::query(
        "SELECT po.po_id, po.po_number, po.status, po.order_date, po.expected_delivery,
                po.subtotal, po.shipping_cost, po.vendor_confirmation,
                v.vendor_name
         FROM purchase_orders po
         LEFT JOIN vendors v ON po.vendor_id = v.vendor_id
         {$where}
         ORDER BY po.order_date DESC
         LIMIT ? OFFSET ?",
        $params
    );

    return ['rows' => $rows, 'total' => $total, 'limit' => $limit, 'offset' => $offset];
}

function getCashDrawerTransactions(int $drawerId): array {
    return Database::query(
        "SELECT cdt.*, u.display_name AS created_by_name
         FROM cash_drawer_transactions cdt
         LEFT JOIN users u ON cdt.created_by = u.user_id
         WHERE cdt.drawer_id = ?
         ORDER BY cdt.created_at DESC",
        [$drawerId]
    );
}


// ============================================================================
// Appointments CRUD
// ============================================================================

function getAppointment(int $apptId): ?array {
    return Database::queryOne(
        "SELECT a.*, c.first_name AS customer_first, c.last_name AS customer_last,
                v.year AS vehicle_year, v.make AS vehicle_make, v.model AS vehicle_model
         FROM appointments a
         LEFT JOIN customers c ON a.customer_id = c.customer_id
         LEFT JOIN vehicles v ON a.vehicle_id = v.vehicle_id
         WHERE a.appointment_id = ?",
        [$apptId]
    );
}

function listAppointments(?string $startDate, ?string $endDate): array {
    $start = $startDate ?? date('Y-m-d');
    $end = $endDate ?? date('Y-m-d', strtotime('+7 days'));

    return Database::query(
        "SELECT a.*, c.first_name AS customer_first, c.last_name AS customer_last,
                v.year AS vehicle_year, v.make AS vehicle_make, v.model AS vehicle_model
         FROM appointments a
         LEFT JOIN customers c ON a.customer_id = c.customer_id
         LEFT JOIN vehicles v ON a.vehicle_id = v.vehicle_id
         WHERE a.appointment_date BETWEEN ? AND ?
         ORDER BY a.appointment_date, a.appointment_time",
        [$start, $end]
    );
}

function createAppointment(array $data, int $createdBy): int {
    $date = $data['appointment_date'] ?? '';
    if ($date === '') {
        throw new \InvalidArgumentException('Field "appointment_date" is required.');
    }

    Database::execute(
        "INSERT INTO appointments (customer_id, vehicle_id, appointment_date, appointment_time,
                                    est_duration_min, service_requested, notes, status, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'scheduled', ?)",
        [
            isset($data['customer_id']) ? (int) $data['customer_id'] : null,
            isset($data['vehicle_id']) ? (int) $data['vehicle_id'] : null,
            $date,
            $data['appointment_time'] ?? null,
            (int) ($data['est_duration_min'] ?? $data['duration_minutes'] ?? 60),
            $data['service_requested'] ?? $data['service_type'] ?? null,
            $data['notes'] ?? null,
            $createdBy,
        ]
    );

    $newId = (int) Database::lastInsertId();
    auditLog('appointments', $newId, 'INSERT', null, null, null, $createdBy);
    logActivity($createdBy, 'APPT_CREATE', 'appointments', $newId, 'Appointment on ' . $date);
    return $newId;
}

function updateAppointment(int $apptId, array $data, int $updatedBy): array {
    $appt = Database::queryOne("SELECT * FROM appointments WHERE appointment_id = ?", [$apptId]);
    if ($appt === null) {
        throw new \RuntimeException('Appointment not found.');
    }

    $editable = ['customer_id', 'vehicle_id', 'appointment_date', 'appointment_time',
                 'duration_minutes', 'service_type', 'notes', 'status'];
    $sets = [];
    $binds = [];
    $changes = [];

    foreach ($editable as $f) {
        if (array_key_exists($f, $data) && (string) ($data[$f] ?? '') !== (string) ($appt[$f] ?? '')) {
            $sets[] = "{$f} = ?";
            $binds[] = $data[$f];
            $changes[$f] = ['old' => $appt[$f], 'new' => $data[$f]];
        }
    }

    if (empty($sets)) {
        return ['changed' => []];
    }

    $sets[] = "updated_at = CURRENT_TIMESTAMP";
    $binds[] = $apptId;
    Database::execute("UPDATE appointments SET " . implode(', ', $sets) . " WHERE appointment_id = ?", $binds);

    foreach ($changes as $field => $vals) {
        auditLog('appointments', $apptId, 'UPDATE', $field, (string) ($vals['old'] ?? ''), (string) ($vals['new'] ?? ''), $updatedBy);
    }

    return ['changed' => array_keys($changes)];
}

function cancelAppointment(int $apptId, int $cancelledBy): void {
    $appt = Database::queryOne("SELECT status FROM appointments WHERE appointment_id = ?", [$apptId]);
    if ($appt === null) {
        throw new \RuntimeException('Appointment not found.');
    }
    if ($appt['status'] === 'cancelled') {
        throw new \RuntimeException('Appointment is already cancelled.');
    }

    Database::execute(
        "UPDATE appointments SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE appointment_id = ?",
        [$apptId]
    );
    auditLog('appointments', $apptId, 'UPDATE', 'status', $appt['status'], 'cancelled', $cancelledBy);
}


// ============================================================================
// Waivers
// ============================================================================

function createWaiver(array $data, int $createdBy): int {
    $type = $data['waiver_type'] ?? '';
    if ($type === '') {
        throw new \InvalidArgumentException('Field "waiver_type" is required.');
    }

    Database::execute(
        "INSERT INTO waivers (waiver_type, customer_id, vehicle_id, work_order_id, tire_id,
                               template_text, customer_acknowledged, customer_signature_data,
                               acknowledged_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
            $type,
            isset($data['customer_id']) ? (int) $data['customer_id'] : null,
            isset($data['vehicle_id']) ? (int) $data['vehicle_id'] : null,
            isset($data['work_order_id']) ? (int) $data['work_order_id'] : null,
            isset($data['tire_id']) ? (int) $data['tire_id'] : null,
            $data['template_text'] ?? getWaiverTemplate($type),
            (int) ($data['customer_acknowledged'] ?? 0),
            $data['customer_signature_data'] ?? null,
            ($data['customer_acknowledged'] ?? false) ? date('Y-m-d H:i:s') : null,
            $createdBy,
        ]
    );

    $waiverId = (int) Database::lastInsertId();
    auditLog('waivers', $waiverId, 'INSERT', null, null, null, $createdBy);
    logActivity($createdBy, 'WAIVER_CREATE', 'waivers', $waiverId, 'Waiver type: ' . $type);
    return $waiverId;
}


// ============================================================================
// Vendors
// ============================================================================

function listVendors(): array {
    return Database::query(
        "SELECT * FROM vendors WHERE is_active = 1 ORDER BY vendor_name"
    );
}

function getVendor(int $vendorId): ?array {
    return Database::queryOne("SELECT * FROM vendors WHERE vendor_id = ?", [$vendorId]);
}

function createVendor(array $data, int $createdBy): int {
    $name = trim($data['vendor_name'] ?? '');
    if ($name === '') {
        throw new \InvalidArgumentException('Field "vendor_name" is required.');
    }

    Database::execute(
        "INSERT INTO vendors (vendor_name, contact_name, phone, email, address, account_number, notes, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1)",
        [
            $name,
            $data['contact_name'] ?? null,
            $data['phone'] ?? null,
            $data['email'] ?? null,
            $data['address'] ?? null,
            $data['account_number'] ?? null,
            $data['notes'] ?? null,
        ]
    );

    $newId = (int) Database::lastInsertId();
    auditLog('vendors', $newId, 'INSERT', null, null, null, $createdBy);
    return $newId;
}


// ============================================================================
// Service Catalog
// ============================================================================

function listServices(): array {
    return Database::query(
        "SELECT * FROM service_catalog WHERE is_active = 1 ORDER BY category, service_name"
    );
}

function getService(int $serviceId): ?array {
    return Database::queryOne("SELECT * FROM service_catalog WHERE service_id = ?", [$serviceId]);
}


// ============================================================================
// Configuration
// ============================================================================

function getAllConfig(): array {
    return Database::query("SELECT * FROM fee_configuration ORDER BY config_key");
}

function getConfigValue(string $key): ?array {
    return Database::queryOne("SELECT * FROM fee_configuration WHERE config_key = ?", [$key]);
}

function updateConfig(string $key, string $value, int $updatedBy): void {
    $current = getConfigValue($key);
    if ($current === null) {
        throw new \RuntimeException('Configuration key not found: ' . $key);
    }

    $oldValue = $current['config_value'];
    Database::execute(
        "UPDATE fee_configuration SET config_value = ?, updated_at = CURRENT_TIMESTAMP WHERE config_key = ?",
        [$value, $key]
    );
    auditLog('fee_configuration', null, 'UPDATE', $key, $oldValue, $value, $updatedBy);
    logActivity($updatedBy, 'CONFIG_UPDATE', 'fee_configuration', null, $key . ': ' . $oldValue . ' -> ' . $value);
}

function waiveFee(int $lineItemId, string $reason, int $waivedBy): void {
    $item = Database::queryOne("SELECT * FROM invoice_line_items WHERE line_id = ?", [$lineItemId]);
    if ($item === null) {
        throw new \RuntimeException('Line item not found.');
    }

    Database::execute(
        "UPDATE invoice_line_items SET unit_price = '0.00', line_total = '0.00', description = CONCAT(description, ' [FEE WAIVED: ', ?, ']') WHERE line_id = ?",
        [$reason, $lineItemId]
    );
    auditLog('invoice_line_items', $lineItemId, 'UPDATE', 'unit_price', $item['unit_price'], '0.00', $waivedBy);
    logActivity($waivedBy, 'FEE_WAIVE', 'invoice_line_items', $lineItemId, 'Waived: ' . $reason);
}


// ============================================================================
// Invoice recalculation (persist totals to invoices table)
// ============================================================================

function recalcInvoiceTotals(int $invoiceId): array {
    $totals = calculateInvoiceTotals($invoiceId);

    Database::execute(
        "UPDATE invoices SET
            subtotal_taxable    = ?,
            subtotal_nontaxable = ?,
            subtotal_fees       = ?,
            tax_amount          = ?,
            discount_amount     = ?,
            total               = ?,
            amount_paid         = ?,
            balance_due         = ?,
            updated_at          = CURRENT_TIMESTAMP
         WHERE invoice_id = ?",
        [
            $totals['subtotal_taxable'],
            $totals['subtotal_nontaxable'],
            $totals['subtotal_fees'],
            $totals['tax_amount'],
            $totals['discount_amount'],
            $totals['total'],
            $totals['amount_paid'],
            $totals['balance_due'],
            $invoiceId,
        ]
    );

    return $totals;
}


// ============================================================================
// Work Order / Invoice list helpers
// ============================================================================

function listWorkOrders(string $status = '', int $limit = 50, int $offset = 0): array {
    $where = '';
    $params = [];
    if ($status !== '') {
        $where = 'WHERE wo.status = ?';
        $params[] = $status;
    }

    $total = (int) Database::scalar(
        "SELECT COUNT(*) FROM work_orders wo {$where}", $params
    );

    $params[] = $limit;
    $params[] = $offset;
    $rows = Database::query(
        "SELECT wo.wo_number, wo.work_order_id, wo.status, wo.created_at,
                wo.assigned_tech_id, u.display_name AS assigned_tech_name,
                c.first_name AS customer_first, c.last_name AS customer_last,
                v.year AS vehicle_year, v.make AS vehicle_make, v.model AS vehicle_model
         FROM work_orders wo
         LEFT JOIN users u ON wo.assigned_tech_id = u.user_id
         LEFT JOIN customers c ON wo.customer_id = c.customer_id
         LEFT JOIN vehicles v ON wo.vehicle_id = v.vehicle_id
         {$where}
         ORDER BY wo.created_at DESC
         LIMIT ? OFFSET ?",
        $params
    );

    return ['rows' => $rows, 'total' => $total, 'limit' => $limit, 'offset' => $offset];
}

function listInvoices(string $status = '', int $limit = 50, int $offset = 0): array {
    $where = '';
    $params = [];
    if ($status !== '') {
        $where = 'WHERE i.status = ?';
        $params[] = $status;
    }

    $total = (int) Database::scalar(
        "SELECT COUNT(*) FROM invoices i {$where}", $params
    );

    $params[] = $limit;
    $params[] = $offset;
    $rows = Database::query(
        "SELECT i.invoice_id, i.invoice_number, i.status, i.total, i.balance_due, i.created_at,
                c.first_name AS customer_first, c.last_name AS customer_last,
                i.work_order_id
         FROM invoices i
         LEFT JOIN customers c ON i.customer_id = c.customer_id
         {$where}
         ORDER BY i.created_at DESC
         LIMIT ? OFFSET ?",
        $params
    );

    return ['rows' => $rows, 'total' => $total, 'limit' => $limit, 'offset' => $offset];
}


// ============================================================================
// P2g Report Functions
// ============================================================================

function getSalesSummary(string $period = 'daily', ?string $start = null, ?string $end = null): array {
    $end = $end ?: date('Y-m-d');

    if ($period === 'daily') {
        $start = $start ?: date('Y-m-d', strtotime('-30 days'));
        $groupBy = "DATE(i.created_at)";
        $label = "DATE(i.created_at) AS label";
    } elseif ($period === 'weekly') {
        $start = $start ?: date('Y-m-d', strtotime('-26 weeks'));
        $groupBy = "YEARWEEK(i.created_at, 1)";
        $label = "CONCAT(YEAR(i.created_at), '-W', LPAD(WEEK(i.created_at, 1), 2, '0')) AS label";
    } else {
        $start = $start ?: date('Y-m-d', strtotime('-12 months'));
        $groupBy = "DATE_FORMAT(i.created_at, '%Y-%m')";
        $label = "DATE_FORMAT(i.created_at, '%Y-%m') AS label";
    }

    return Database::query(
        "SELECT {$label},
                COUNT(*) AS invoice_count,
                COALESCE(SUM(i.total), 0) AS total_revenue,
                COALESCE(SUM(i.tax_amount), 0) AS total_tax,
                COALESCE(SUM(i.subtotal_fees), 0) AS total_fees,
                COALESCE(SUM(i.amount_paid), 0) AS total_collected,
                COALESCE(SUM(i.balance_due), 0) AS total_outstanding
         FROM invoices i
         WHERE i.status IN ('open', 'completed')
           AND i.created_at >= ? AND i.created_at < DATE_ADD(?, INTERVAL 1 DAY)
         GROUP BY {$groupBy}
         ORDER BY label ASC",
        [$start, $end]
    );
}

function getInventoryStats(): array {
    $byCondition = Database::query(
        "SELECT `condition`, COUNT(*) AS cnt, COALESCE(SUM(retail_price), 0) AS total_value
         FROM tires WHERE status = 'available'
         GROUP BY `condition`"
    );

    $byBrand = Database::query(
        "SELECT b.brand_name, COUNT(*) AS cnt
         FROM tires t
         JOIN lkp_brands b ON t.brand_id = b.brand_id
         WHERE t.status = 'available'
         GROUP BY b.brand_id
         ORDER BY cnt DESC
         LIMIT 15"
    );

    $aging = Database::query(
        "SELECT
            CASE
                WHEN DATEDIFF(CURDATE(), acquired_at) <= 30 THEN '0-30 days'
                WHEN DATEDIFF(CURDATE(), acquired_at) <= 90 THEN '31-90 days'
                WHEN DATEDIFF(CURDATE(), acquired_at) <= 180 THEN '91-180 days'
                ELSE '180+ days'
            END AS age_bucket,
            COUNT(*) AS cnt
         FROM tires WHERE status = 'available'
         GROUP BY age_bucket
         ORDER BY FIELD(age_bucket, '0-30 days', '31-90 days', '91-180 days', '180+ days')"
    );

    $totalCount = (int) Database::scalar("SELECT COUNT(*) FROM tires WHERE status = 'available'");
    $totalValue = (float) Database::scalar("SELECT COALESCE(SUM(retail_price), 0) FROM tires WHERE status = 'available'");

    return [
        'total_count' => $totalCount,
        'total_value' => $totalValue,
        'by_condition' => $byCondition,
        'by_brand' => $byBrand,
        'aging' => $aging,
    ];
}

function getCashReconciliation(?string $start = null, ?string $end = null): array {
    $start = $start ?: date('Y-m-d', strtotime('-30 days'));
    $end = $end ?: date('Y-m-d');

    return Database::query(
        "SELECT cd.drawer_id, cd.drawer_date, cd.opening_balance, cd.closing_count,
                cd.expected_balance, cd.variance, cd.status,
                u_open.display_name AS opened_by_name,
                u_close.display_name AS closed_by_name
         FROM cash_drawers cd
         LEFT JOIN users u_open ON cd.opened_by = u_open.user_id
         LEFT JOIN users u_close ON cd.closed_by = u_close.user_id
         WHERE cd.drawer_date BETWEEN ? AND ?
         ORDER BY cd.drawer_date DESC",
        [$start, $end]
    );
}

function getOutstandingDeposits(): array {
    return Database::query("SELECT * FROM v_deposits_active ORDER BY expires_at ASC");
}

function getPaymentMethodBreakdown(?string $start = null, ?string $end = null): array {
    $start = $start ?: date('Y-m-d', strtotime('-30 days'));
    $end = $end ?: date('Y-m-d');

    return Database::query(
        "SELECT p.payment_method, COUNT(*) AS txn_count, COALESCE(SUM(p.amount), 0) AS total_amount
         FROM payments p
         WHERE p.processed_at >= ? AND p.processed_at < DATE_ADD(?, INTERVAL 1 DAY)
         GROUP BY p.payment_method
         ORDER BY total_amount DESC",
        [$start, $end]
    );
}

function getTopSellingTires(int $limit = 10, ?string $start = null, ?string $end = null): array {
    $start = $start ?: date('Y-m-d', strtotime('-90 days'));
    $end = $end ?: date('Y-m-d');

    return Database::query(
        "SELECT t.full_size_string, b.brand_name, t.model, COUNT(*) AS sold_count,
                AVG(li.unit_price) AS avg_price
         FROM invoice_line_items li
         JOIN tires t ON li.tire_id = t.tire_id
         LEFT JOIN lkp_brands b ON t.brand_id = b.brand_id
         JOIN invoices i ON li.invoice_id = i.invoice_id
         WHERE li.line_type = 'tire'
           AND i.status IN ('open', 'completed')
           AND i.created_at >= ? AND i.created_at < DATE_ADD(?, INTERVAL 1 DAY)
         GROUP BY t.full_size_string, b.brand_name, t.model
         ORDER BY sold_count DESC
         LIMIT ?",
        [$start, $end, $limit]
    );
}

function getLookupCostReport(?string $start = null, ?string $end = null): array {
    $start = $start ?: date('Y-m-01');
    $end = $end ?: date('Y-m-d');

    return Database::query(
        "SELECT DATE_FORMAT(created_at, '%Y-%m') AS month,
                COUNT(*) AS lookup_count,
                SUM(CASE WHEN source = 'api' THEN 1 ELSE 0 END) AS api_calls,
                SUM(CASE WHEN source = 'cache' THEN 1 ELSE 0 END) AS cache_hits,
                SUM(CASE WHEN source = 'api' THEN 0.05 ELSE 0 END) AS api_cost
         FROM plate_lookup_cache
         WHERE created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 DAY)
         GROUP BY month
         ORDER BY month ASC",
        [$start, $end]
    );
}
