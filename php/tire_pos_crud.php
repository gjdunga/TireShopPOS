<?php
declare(strict_types=1);

/**
 * ============================================================================
 * TireShopPOS: CRUD Operations
 * ============================================================================
 *
 * Loaded on EVERY request. Contains all create/read/update/delete functions
 * for the core domain entities: tires, customers, vehicles, work orders,
 * appointments, purchase orders, vendors, and supporting operations.
 *
 * Function groups:
 *   Tires           getTire(), createTire(), updateTire(), writeOffTire(),
 *                   searchTiresBySize(), searchTiresAdvanced(),
 *                   getTirePhotos(), saveTirePhoto(), deleteTirePhoto()
 *   Customers       getCustomer(), createCustomer(), updateCustomer(),
 *                   searchCustomers()
 *   Vehicles        getVehicle(), createVehicle(), updateVehicle(),
 *                   searchVehicles(), getVehicleHistory(),
 *                   getCustomerVehicles(), linkCustomerVehicle(),
 *                   unlinkCustomerVehicle()
 *   Work Orders     getWorkOrder(), createWorkOrder(), updateWorkOrder(),
 *                   listWorkOrders(), getOpenWorkOrders(),
 *                   assignWorkOrder(), addWorkOrderPosition(),
 *                   updateWorkOrderPosition(), completeWorkOrder()
 *   Appointments    getAppointment(), createAppointment(),
 *                   updateAppointment(), cancelAppointment(),
 *                   listAppointments(), getTodaysAppointments()
 *   Purchase Orders getPurchaseOrder(), createPurchaseOrder(),
 *                   addPoLineItem(), receivePurchaseOrder(),
 *                   listPurchaseOrders(), getOpenPurchaseOrders()
 *   Vendors         getVendor(), createVendor(), listVendors()
 *   Services        getService(), listServices()
 *   Config          getAllConfig(), getConfigValue(), updateConfig()
 *   VIN             validateVin()
 *
 * All write functions call auditLog() and logActivity() from helpers.
 * All functions use Database::query/execute with parameterized queries.
 *
 * Dependencies: App\Core\Database, tire_pos_helpers.php (auditLog, etc.)
 * Called by:    routes/api.php
 *
 * DunganSoft Technologies, March 2026
 * ============================================================================
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
    InputValidator::check('tires', $data);
    $fields = [
        'brand_id', 'tire_type_id', 'construction_id',
        'width_mm', 'aspect_ratio', 'wheel_diameter', 'size_format',
        'speed_rating_id', 'load_index_id', 'load_constr_id',
        'model_name', 'full_size_string', 'dot_tin_raw', 'dot_mfg_week', 'dot_mfg_year',
        'tread_depth_32nds', 'condition', 'status',
        'source_id', 'cost', 'retail_price',
        'bin_facility', 'bin_shelf', 'bin_level', 'notes'
    ];

    $setCols = [];
    $binds = [];
    // Fields that must be int or null (never empty string)
    $intFields = ['brand_id', 'tire_type_id', 'construction_id', 'width_mm',
        'aspect_ratio', 'wheel_diameter', 'speed_rating_id', 'load_index_id',
        'load_constr_id', 'dot_mfg_week', 'dot_mfg_year', 'tread_depth_32nds',
        'source_id'];
    $decFields = ['cost', 'retail_price'];
    foreach ($fields as $f) {
        if (array_key_exists($f, $data)) {
            $val = $data[$f];
            if (in_array($f, $intFields, true)) {
                $val = ($val === '' || $val === null) ? null : (int) $val;
            } elseif (in_array($f, $decFields, true)) {
                $val = ($val === '' || $val === null) ? null : $val;
            }
            $setCols[] = $f;
            $binds[] = $val;
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
    \App\Http\Middleware::checkConflict($data, $tire, 'tire');
    InputValidator::check('tires', $data);

    $editable = [
        'brand_id', 'tire_type_id', 'construction_id',
        'model_name', 'full_size_string', 'dot_tin_raw', 'dot_mfg_week', 'dot_mfg_year',
        'tread_depth_32nds', 'condition', 'status',
        'cost', 'retail_price', 'bin_facility', 'bin_shelf', 'bin_level', 'notes'
    ];

    $sets = [];
    $binds = [];
    $changes = [];
    $intFields = ['brand_id', 'tire_type_id', 'construction_id',
        'dot_mfg_week', 'dot_mfg_year', 'tread_depth_32nds'];
    $decFields = ['cost', 'retail_price'];

    foreach ($editable as $f) {
        if (array_key_exists($f, $data) && (string) ($data[$f] ?? '') !== (string) ($tire[$f] ?? '')) {
            $val = $data[$f];
            if (in_array($f, $intFields, true)) {
                $val = ($val === '' || $val === null) ? null : (int) $val;
            } elseif (in_array($f, $decFields, true)) {
                $val = ($val === '' || $val === null) ? null : $val;
            }
            $sets[] = "`{$f}` = ?";
            $binds[] = $val;
            $changes[$f] = ['old' => $tire[$f], 'new' => $val];
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
    return Database::transaction(function () use ($tireId, $filePath, $caption, $isPrimary, $uploadedBy) {
        // If marking as primary, clear other primaries
        if ($isPrimary) {
            Database::execute("UPDATE tire_photos SET is_primary = 0 WHERE tire_id = ?", [$tireId]);
        }

        Database::execute(
            "INSERT INTO tire_photos (tire_id, photo_path, photo_type, caption, uploaded_by) VALUES (?, ?, ?, ?, ?)",
            [$tireId, $filePath, $data['photo_type'] ?? 'other', $caption, $uploadedBy]
        );

        $photoId = (int) Database::lastInsertId();
        auditLog('tire_photos', $photoId, 'INSERT', null, null, null, $uploadedBy);
        return $photoId;
    });
}

function deleteTirePhoto(int $photoId, int $deletedBy): string {
    $photo = Database::queryOne("SELECT * FROM tire_photos WHERE photo_id = ?", [$photoId]);
    if ($photo === null) {
        throw new \RuntimeException('Photo not found.');
    }

    Database::execute("DELETE FROM tire_photos WHERE photo_id = ?", [$photoId]);
    auditLog('tire_photos', $photoId, 'DELETE', null, null, null, $deletedBy);
    return $photo['photo_path'];
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
    InputValidator::check('customers', $data, ['first_name', 'last_name']);

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
    \App\Http\Middleware::checkConflict($data, $customer, 'customer');
    InputValidator::check('customers', $data);

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
    InputValidator::check('vehicles', $data, ['year', 'make', 'model']);

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
    \App\Http\Middleware::checkConflict($data, $vehicle, 'vehicle');
    InputValidator::check('vehicles', $data);

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
                    t_ex.size_display AS existing_tire_size, t_ex.brand_name AS existing_tire_brand,
                    t_new.size_display AS new_tire_size, t_new.brand_name AS new_tire_brand
             FROM work_order_positions wop
             LEFT JOIN v_tire_inventory t_ex ON wop.tire_id_existing = t_ex.tire_id
             LEFT JOIN v_tire_inventory t_new ON wop.tire_id_new = t_new.tire_id
             WHERE wop.work_order_id = ?
             ORDER BY FIELD(wop.position_code, 'LF','RF','LR','RR','SPARE','LRI','RRI','LFI','RFI')",
            [$woId]
        );
        $wo['line_items'] = Database::query(
            "SELECT woli.*, sc.service_name, fc.fee_label
             FROM work_order_line_items woli
             LEFT JOIN service_catalog sc ON woli.service_id = sc.service_id
             LEFT JOIN fee_configuration fc ON woli.fee_config_id = fc.fee_id
             WHERE woli.work_order_id = ?
             ORDER BY woli.display_order, woli.line_id",
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
                                   estimated_price,
                                   deposit_amount, deposit_method, deposit_received_at, deposit_received_by,
                                   subtotal_materials, subtotal_labor, subtotal_fees,
                                   tax_rate, tax_amount, total_estimate,
                                   created_by)
         VALUES (?, ?, ?, ?, 'intake', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
            $woNumber,
            (int) ($data['customer_id'] ?? 0),
            isset($data['vehicle_id']) ? (int) $data['vehicle_id'] : null,
            isset($data['assigned_tech_id']) ? (int) $data['assigned_tech_id'] : null,
            $data['mileage_in'] ?? null,
            $data['customer_complaint'] ?? null,
            $data['special_notes'] ?? null,
            isset($data['estimated_price']) && $data['estimated_price'] !== '' ? $data['estimated_price'] : null,
            isset($data['deposit_amount']) && $data['deposit_amount'] !== '' ? $data['deposit_amount'] : null,
            $data['deposit_method'] ?? null,
            !empty($data['deposit_amount']) ? ($data['deposit_received_at'] ?? date('Y-m-d H:i:s')) : null,
            !empty($data['deposit_amount']) ? ($data['deposit_received_by'] ?? $createdBy) : null,
            $data['subtotal_materials'] ?? 0,
            $data['subtotal_labor'] ?? 0,
            $data['subtotal_fees'] ?? 0,
            $data['tax_rate'] ?? 0,
            $data['tax_amount'] ?? 0,
            $data['total_estimate'] ?? 0,
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
    \App\Http\Middleware::checkConflict($data, $wo, 'work order');
    InputValidator::check('work_orders', $data);

    $editable = ['customer_id', 'vehicle_id', 'mileage_in', 'mileage_out',
                 'customer_complaint', 'tech_diagnosis', 'special_notes', 'status',
                 'estimated_price',
                 'deposit_amount', 'deposit_method', 'deposit_received_at', 'deposit_received_by',
                 'subtotal_materials', 'subtotal_labor', 'subtotal_fees',
                 'tax_rate', 'tax_amount', 'total_estimate',
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
                                            unit_price,
                                            tread_depth_in, tread_depth_out, psi_in, psi_out,
                                            condition_notes, condition_grade)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
            $woId,
            $data['position_code'] ?? 'LF',
            $data['action_requested'] ?? 'none',
            $data['rotate_to_position'] ?? null,
            isset($data['tire_id_existing']) ? (int) $data['tire_id_existing'] : null,
            isset($data['tire_id_new']) ? (int) $data['tire_id_new'] : null,
            isset($data['unit_price']) && $data['unit_price'] !== '' ? $data['unit_price'] : null,
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
                 'tire_id_existing', 'tire_id_new', 'unit_price',
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


// ---- Work Order Line Items (labor, parts, fees, warranties, disposal) ----

/**
 * Add a line item to a work order. Recalculates WO subtotals.
 *
 * @param int   $woId      Work order ID
 * @param array $data      line_type, description, quantity, unit_price, is_taxable,
 *                         service_id, fee_config_id, tire_id, warranty_policy_id,
 *                         warranty_expires_at, warranty_terms, display_order
 * @param int   $createdBy User ID
 * @return int  New line_id
 */
function addWorkOrderLineItem(int $woId, array $data, int $createdBy): int {
    $wo = Database::queryOne("SELECT work_order_id FROM work_orders WHERE work_order_id = ?", [$woId]);
    if (!$wo) throw new \RuntimeException('Work order not found.');

    InputValidator::check('work_order_line_items', $data, ['line_type', 'description']);

    $lineType = $data['line_type'];
    $qty = (float) ($data['quantity'] ?? 1);
    $price = (float) ($data['unit_price'] ?? 0);
    $total = round($qty * $price, 2);

    // Default is_taxable based on line type (CO: materials taxable, labor/fees not)
    $taxable = (int) ($data['is_taxable'] ?? (in_array($lineType, ['part', 'warranty'], true) ? 1 : 0));

    return Database::transaction(function () use ($woId, $data, $createdBy, $lineType, $qty, $price, $total, $taxable) {
        Database::execute(
            "INSERT INTO work_order_line_items
             (work_order_id, line_type, description, quantity, unit_price, line_total,
              is_taxable, service_id, fee_config_id, tire_id,
              warranty_policy_id, warranty_expires_at, warranty_terms, display_order)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [
                $woId, $lineType, trim($data['description']),
                $qty, $price, $total, $taxable,
                $data['service_id'] ?? null,
                $data['fee_config_id'] ?? null,
                $data['tire_id'] ?? null,
                $data['warranty_policy_id'] ?? null,
                $data['warranty_expires_at'] ?? null,
                $data['warranty_terms'] ?? null,
                (int) ($data['display_order'] ?? 0),
            ]
        );

        $lineId = Database::lastInsertId();
        auditLog('work_order_line_items', $lineId, 'INSERT', null, null, null, $createdBy);
        logActivity($createdBy, 'WO_LINE_ADD', 'work_order_line_items', $lineId,
            "Added {$lineType}: {$data['description']} (\${$total}) to WO #{$woId}");

        recalcWorkOrderTotals($woId, $createdBy);
        return $lineId;
    });
}

/**
 * Update a line item. Recalculates WO subtotals.
 */
function updateWorkOrderLineItem(int $lineId, array $data, int $updatedBy): array {
    $line = Database::queryOne("SELECT * FROM work_order_line_items WHERE line_id = ?", [$lineId]);
    if (!$line) throw new \RuntimeException('Line item not found.');

    InputValidator::check('work_order_line_items', $data);

    $editable = ['line_type', 'description', 'quantity', 'unit_price',
                 'is_taxable', 'service_id', 'fee_config_id', 'tire_id',
                 'warranty_policy_id', 'warranty_expires_at', 'warranty_terms', 'display_order'];
    $sets = [];
    $binds = [];
    $changes = [];

    foreach ($editable as $f) {
        if (array_key_exists($f, $data) && (string) ($data[$f] ?? '') !== (string) ($line[$f] ?? '')) {
            $sets[] = "{$f} = ?";
            $binds[] = $data[$f];
            $changes[$f] = ['old' => $line[$f], 'new' => $data[$f]];
        }
    }

    // Recalculate line_total if qty or price changed
    $qty = (float) ($data['quantity'] ?? $line['quantity']);
    $price = (float) ($data['unit_price'] ?? $line['unit_price']);
    $newTotal = round($qty * $price, 2);
    if ((string) $newTotal !== (string) $line['line_total']) {
        $sets[] = "line_total = ?";
        $binds[] = $newTotal;
        $changes['line_total'] = ['old' => $line['line_total'], 'new' => $newTotal];
    }

    if (empty($sets)) return ['changed' => []];

    $binds[] = $lineId;
    $woId = (int) $line['work_order_id'];

    Database::transaction(function () use ($lineId, $sets, $binds, $changes, $updatedBy, $woId) {
        Database::execute("UPDATE work_order_line_items SET " . implode(', ', $sets) . " WHERE line_id = ?", $binds);

        foreach ($changes as $field => $vals) {
            auditLog('work_order_line_items', $lineId, 'UPDATE', $field,
                (string) ($vals['old'] ?? ''), (string) ($vals['new'] ?? ''), $updatedBy);
        }

        recalcWorkOrderTotals($woId, $updatedBy);
    });

    return ['changed' => array_keys($changes)];
}

/**
 * Delete a line item. Recalculates WO subtotals.
 */
function deleteWorkOrderLineItem(int $lineId, int $deletedBy): void {
    $line = Database::queryOne("SELECT * FROM work_order_line_items WHERE line_id = ?", [$lineId]);
    if (!$line) throw new \RuntimeException('Line item not found.');

    $woId = (int) $line['work_order_id'];

    Database::transaction(function () use ($lineId, $line, $deletedBy, $woId) {
        auditLog('work_order_line_items', $lineId, 'DELETE', null, null, null, $deletedBy);
        Database::execute("DELETE FROM work_order_line_items WHERE line_id = ?", [$lineId]);

        logActivity($deletedBy, 'WO_LINE_DELETE', 'work_order_line_items', $lineId,
            "Removed {$line['line_type']}: {$line['description']} from WO #{$woId}");

        recalcWorkOrderTotals($woId, $deletedBy);
    });
}

/**
 * Recalculate WO subtotals from line items.
 * materials = SUM(line_total) WHERE is_taxable = 1
 * labor     = SUM(line_total) WHERE line_type IN ('labor')
 * fees      = SUM(line_total) WHERE line_type IN ('fee','disposal')
 * tax       = materials * tax_rate
 * total     = materials + labor + fees + tax
 */
function recalcWorkOrderTotals(int $woId, int $updatedBy): void {
    $wo = Database::queryOne("SELECT tax_rate FROM work_orders WHERE work_order_id = ?", [$woId]);
    if (!$wo) return;

    $sums = Database::queryOne(
        "SELECT
            COALESCE(SUM(CASE WHEN is_taxable = 1 THEN line_total ELSE 0 END), 0) AS materials,
            COALESCE(SUM(CASE WHEN line_type = 'labor' THEN line_total ELSE 0 END), 0) AS labor,
            COALESCE(SUM(CASE WHEN line_type IN ('fee','disposal') THEN line_total ELSE 0 END), 0) AS fees
         FROM work_order_line_items WHERE work_order_id = ?",
        [$woId]
    );

    $materials = (float) $sums['materials'];
    $labor = (float) $sums['labor'];
    $fees = (float) $sums['fees'];
    $taxRate = (float) $wo['tax_rate'];
    $taxAmount = round($materials * $taxRate, 2);
    $total = round($materials + $labor + $fees + $taxAmount, 2);

    Database::execute(
        "UPDATE work_orders SET subtotal_materials = ?, subtotal_labor = ?,
         subtotal_fees = ?, tax_amount = ?, total_estimate = ?,
         updated_at = CURRENT_TIMESTAMP WHERE work_order_id = ?",
        [$materials, $labor, $fees, $taxAmount, $total, $woId]
    );
}

function completeWorkOrder(int $woId, int $completedBy): array {
    $wo = Database::queryOne("SELECT status FROM work_orders WHERE work_order_id = ?", [$woId]);
    if (!$wo) throw new \RuntimeException('Work order not found.');
    if ($wo['status'] === 'complete') throw new \RuntimeException('Work order is already complete.');
    if ($wo['status'] === 'cancelled') throw new \RuntimeException('Cannot complete a cancelled work order.');

    // Torque gate: every position must have torque_verified = 1
    $check = canCompleteWorkOrder($woId);
    if (!$check['can_complete']) {
        throw new \RuntimeException('Cannot complete: ' . implode('; ', $check['blockers']));
    }

    Database::execute(
        "UPDATE work_orders SET status = 'complete', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE work_order_id = ?",
        [$woId]
    );

    auditLog('work_orders', $woId, 'UPDATE', 'status', $wo['status'], 'complete', $completedBy);
    logActivity($completedBy, 'WO_COMPLETE', 'work_orders', $woId, 'Completed work order');

    return $check;
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
    InputValidator::check('purchase_orders', $data);
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
    InputValidator::check('po_line_items', $data);

    Database::execute(
        "INSERT INTO po_line_items (po_id, description, quantity_ordered, unit_cost)
         VALUES (?, ?, ?, ?)",
        [
            $poId,
            $data['description'] ?? '',
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

    return Database::transaction(function () use ($poId, $receivedItems, $receivedBy, $po) {
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
    });
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
    InputValidator::check('appointments', $data, ['appointment_date']);
    $date = $data['appointment_date'];

    Database::execute(
        "INSERT INTO appointments (customer_id, vehicle_id, appointment_date, appointment_time,
                                    est_duration_min, service_requested, notes, status, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'scheduled', ?)",
        [
            isset($data['customer_id']) ? (int) $data['customer_id'] : null,
            isset($data['vehicle_id']) ? (int) $data['vehicle_id'] : null,
            $date,
            $data['appointment_time'] ?? null,
            (int) ($data['est_duration_min'] ?? $data['est_duration_min'] ?? 60),
            $data['service_requested'] ?? $data['service_requested'] ?? null,
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
    \App\Http\Middleware::checkConflict($data, $appt, 'appointment');
    InputValidator::check('appointments', $data);

    $editable = ['customer_id', 'vehicle_id', 'appointment_date', 'appointment_time',
                 'est_duration_min', 'service_requested', 'notes', 'status'];
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
                               waiver_text, customer_signature,
                               signed_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
            $type,
            isset($data['customer_id']) ? (int) $data['customer_id'] : null,
            isset($data['vehicle_id']) ? (int) $data['vehicle_id'] : null,
            isset($data['work_order_id']) ? (int) $data['work_order_id'] : null,
            isset($data['tire_id']) ? (int) $data['tire_id'] : null,
            $data['waiver_text'] ?? getWaiverTemplate($type),
            $data['customer_signature'] ?? null,
            ($data['customer_signature'] ?? null) ? date('Y-m-d H:i:s') : null,
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
    InputValidator::check('vendors', $data, ['vendor_name']);
    $name = trim($data['vendor_name']);

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

function listServices(bool $activeOnly = true): array {
    $where = $activeOnly ? "WHERE is_active = 1" : "";
    return Database::query(
        "SELECT * FROM service_catalog {$where} ORDER BY display_order, service_name"
    );
}

function getService(int $serviceId): ?array {
    return Database::queryOne("SELECT * FROM service_catalog WHERE service_id = ?", [$serviceId]);
}

function createService(array $data, int $createdBy): int {
    InputValidator::check('service_catalog', $data, ['service_code', 'service_name']);

    Database::execute(
        "INSERT INTO service_catalog (service_code, service_name, default_labor, is_per_tire, is_active, display_order)
         VALUES (?, ?, ?, ?, ?, ?)",
        [
            strtoupper(trim($data['service_code'])),
            trim($data['service_name']),
            (float) ($data['default_labor'] ?? 0),
            (int) ($data['is_per_tire'] ?? 1),
            (int) ($data['is_active'] ?? 1),
            (int) ($data['display_order'] ?? 0),
        ]
    );

    $id = Database::lastInsertId();
    auditLog('service_catalog', $id, 'INSERT', null, null, null, $createdBy);
    logActivity($createdBy, 'SERVICE_CREATE', 'service_catalog', $id, trim($data['service_name']));
    return $id;
}

function updateService(int $serviceId, array $data, int $updatedBy): array {
    $svc = getService($serviceId);
    if (!$svc) throw new \RuntimeException('Service not found.');

    InputValidator::check('service_catalog', $data);

    $editable = ['service_code', 'service_name', 'default_labor', 'is_per_tire', 'is_active', 'display_order'];
    $sets = [];
    $binds = [];
    $changes = [];

    foreach ($editable as $f) {
        if (array_key_exists($f, $data) && (string) ($data[$f] ?? '') !== (string) ($svc[$f] ?? '')) {
            $val = $data[$f];
            if ($f === 'service_code') $val = strtoupper(trim($val));
            if ($f === 'service_name') $val = trim($val);
            $sets[] = "{$f} = ?";
            $binds[] = $val;
            $changes[$f] = ['old' => $svc[$f], 'new' => $val];
        }
    }

    if (empty($sets)) return ['changed' => []];

    $binds[] = $serviceId;
    Database::execute("UPDATE service_catalog SET " . implode(', ', $sets) . " WHERE service_id = ?", $binds);

    foreach ($changes as $field => $vals) {
        auditLog('service_catalog', $serviceId, 'UPDATE', $field,
            (string) ($vals['old'] ?? ''), (string) ($vals['new'] ?? ''), $updatedBy);
    }

    return ['changed' => array_keys($changes)];
}

function deleteService(int $serviceId, int $deletedBy): void {
    $svc = getService($serviceId);
    if (!$svc) throw new \RuntimeException('Service not found.');

    // Soft delete: set is_active = 0 (referenced by work_order_line_items FK)
    Database::execute("UPDATE service_catalog SET is_active = 0 WHERE service_id = ?", [$serviceId]);
    auditLog('service_catalog', $serviceId, 'UPDATE', 'is_active', '1', '0', $deletedBy);
    logActivity($deletedBy, 'SERVICE_DELETE', 'service_catalog', $serviceId, $svc['service_name']);
}


// ============================================================================
// Fee Configuration (CO tire disposal fees, environmental fees, etc.)
// ============================================================================

function listFees(bool $activeOnly = true): array {
    $where = $activeOnly ? "WHERE is_active = 1" : "";
    return Database::query("SELECT * FROM fee_configuration {$where} ORDER BY fee_key");
}

function getFee(int $feeId): ?array {
    return Database::queryOne("SELECT * FROM fee_configuration WHERE fee_id = ?", [$feeId]);
}

function getFeeByKey(string $key): ?array {
    return Database::queryOne("SELECT * FROM fee_configuration WHERE fee_key = ?", [$key]);
}

/**
 * Get a config value. Checks fee_configuration by fee_key first,
 * then falls back to shop_settings by setting_key.
 * Returns {key, value} for backward compatibility with QuoteTool.
 */
function getConfigValue(string $key): ?array {
    // Try fee_configuration first
    $fee = Database::queryOne("SELECT fee_key, fee_amount FROM fee_configuration WHERE fee_key = ?", [$key]);
    if ($fee) {
        return ['key' => $fee['fee_key'], 'value' => $fee['fee_amount']];
    }
    // Fall back to shop_settings (for tax_rate, shop_name, etc.)
    $setting = Database::queryOne("SELECT setting_key, setting_value FROM shop_settings WHERE setting_key = ?", [$key]);
    if ($setting) {
        return ['key' => $setting['setting_key'], 'value' => $setting['setting_value']];
    }
    return null;
}

function createFee(array $data, int $createdBy): int {
    $key = strtoupper(trim($data['fee_key'] ?? ''));
    $label = trim($data['fee_label'] ?? '');
    if ($key === '' || $label === '') {
        throw new \InvalidArgumentException('Fee key and label are required.');
    }

    Database::execute(
        "INSERT INTO fee_configuration (fee_key, fee_label, fee_amount, is_per_tire, applies_to,
         is_taxable, statutory_text, effective_date, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
            $key, $label,
            (float) ($data['fee_amount'] ?? 0),
            (int) ($data['is_per_tire'] ?? 1),
            $data['applies_to'] ?? 'new_only',
            (int) ($data['is_taxable'] ?? 0),
            $data['statutory_text'] ?? null,
            $data['effective_date'] ?? date('Y-m-d'),
            (int) ($data['is_active'] ?? 1),
        ]
    );

    $id = Database::lastInsertId();
    auditLog('fee_configuration', $id, 'INSERT', null, null, null, $createdBy);
    logActivity($createdBy, 'FEE_CREATE', 'fee_configuration', $id, "{$key}: {$label}");
    return $id;
}

function updateFee(int $feeId, array $data, int $updatedBy): array {
    $fee = getFee($feeId);
    if (!$fee) throw new \RuntimeException('Fee not found.');

    $editable = ['fee_key', 'fee_label', 'fee_amount', 'is_per_tire',
                 'applies_to', 'is_taxable', 'statutory_text', 'effective_date', 'is_active'];
    $sets = [];
    $binds = [];
    $changes = [];

    foreach ($editable as $f) {
        if (array_key_exists($f, $data) && (string) ($data[$f] ?? '') !== (string) ($fee[$f] ?? '')) {
            $sets[] = "{$f} = ?";
            $binds[] = $data[$f];
            $changes[$f] = ['old' => $fee[$f], 'new' => $data[$f]];
        }
    }

    if (empty($sets)) return ['changed' => []];

    $binds[] = $feeId;
    Database::execute("UPDATE fee_configuration SET " . implode(', ', $sets) . " WHERE fee_id = ?", $binds);

    foreach ($changes as $field => $vals) {
        auditLog('fee_configuration', $feeId, 'UPDATE', $field,
            (string) ($vals['old'] ?? ''), (string) ($vals['new'] ?? ''), $updatedBy);
    }

    return ['changed' => array_keys($changes)];
}

function deleteFee(int $feeId, int $deletedBy): void {
    $fee = getFee($feeId);
    if (!$fee) throw new \RuntimeException('Fee not found.');

    // Soft delete (referenced by work_order_line_items FK)
    Database::execute("UPDATE fee_configuration SET is_active = 0 WHERE fee_id = ?", [$feeId]);
    auditLog('fee_configuration', $feeId, 'UPDATE', 'is_active', '1', '0', $deletedBy);
    logActivity($deletedBy, 'FEE_DELETE', 'fee_configuration', $feeId, $fee['fee_label']);
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


// ============================================================================
// P2g Report Functions
// ============================================================================

function getSalesSummary(string $period = 'daily', ?string $start = null, ?string $end = null): array {
    $end = $end ?: date('Y-m-d');

    if ($period === 'daily') {
        $start = $start ?: date('Y-m-d', strtotime('-30 days'));
        $groupBy = "DATE(wo.created_at)";
        $label = "DATE(wo.created_at) AS label";
    } elseif ($period === 'weekly') {
        $start = $start ?: date('Y-m-d', strtotime('-26 weeks'));
        $groupBy = "YEARWEEK(wo.created_at, 1)";
        $label = "CONCAT(YEAR(wo.created_at), '-W', LPAD(WEEK(wo.created_at, 1), 2, '0')) AS label";
    } else {
        $start = $start ?: date('Y-m-d', strtotime('-12 months'));
        $groupBy = "DATE_FORMAT(wo.created_at, '%Y-%m')";
        $label = "DATE_FORMAT(wo.created_at, '%Y-%m') AS label";
    }

    return Database::query(
        "SELECT {$label},
                COUNT(*) AS wo_count,
                COALESCE(SUM(wo.total_estimate), 0) AS total_revenue,
                COALESCE(SUM(wo.subtotal_materials), 0) AS total_materials,
                COALESCE(SUM(wo.subtotal_labor), 0) AS total_labor,
                COALESCE(SUM(wo.tax_amount), 0) AS total_tax,
                COALESCE(SUM(wo.subtotal_fees), 0) AS total_fees,
                COALESCE(SUM(wo.deposit_amount), 0) AS total_deposits
         FROM work_orders wo
         WHERE wo.status IN ('in_progress', 'complete')
           AND wo.created_at >= ? AND wo.created_at < DATE_ADD(?, INTERVAL 1 DAY)
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

function getTopSellingTires(int $limit = 10, ?string $start = null, ?string $end = null): array {
    $start = $start ?: date('Y-m-d', strtotime('-90 days'));
    $end = $end ?: date('Y-m-d');

    return Database::query(
        "SELECT t.full_size_string, b.brand_name, t.model_name AS model, COUNT(*) AS sold_count,
                AVG(wop.unit_price) AS avg_price
         FROM work_order_positions wop
         JOIN tires t ON wop.tire_id_new = t.tire_id
         LEFT JOIN lkp_brands b ON t.brand_id = b.brand_id
         JOIN work_orders wo ON wop.work_order_id = wo.work_order_id
         WHERE wop.tire_id_new IS NOT NULL
           AND wo.status IN ('in_progress', 'complete')
           AND wo.created_at >= ? AND wo.created_at < DATE_ADD(?, INTERVAL 1 DAY)
         GROUP BY t.full_size_string, b.brand_name, t.model_name
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


// ============================================================================
// Service Parts (consumables per service: valve stems, weights, etc.)
// ============================================================================

function listServiceParts(int $serviceId): array {
    return Database::query(
        "SELECT * FROM service_parts WHERE service_id = ? AND is_active = 1 ORDER BY part_name",
        [$serviceId]
    );
}

function getServicePart(int $partId): ?array {
    return Database::queryOne("SELECT * FROM service_parts WHERE part_id = ?", [$partId]);
}

function createServicePart(array $data, int $createdBy): int {
    $serviceId = (int) ($data['service_id'] ?? 0);
    $name = trim($data['part_name'] ?? '');
    if ($serviceId <= 0 || $name === '') {
        throw new \InvalidArgumentException('service_id and part_name are required.');
    }

    Database::execute(
        "INSERT INTO service_parts (service_id, part_name, default_cost, is_taxable, is_active)
         VALUES (?, ?, ?, ?, ?)",
        [$serviceId, $name, (float) ($data['default_cost'] ?? 0), (int) ($data['is_taxable'] ?? 1), 1]
    );
    $id = Database::lastInsertId();
    auditLog('service_parts', $id, 'INSERT', null, null, null, $createdBy);
    return $id;
}

function updateServicePart(int $partId, array $data, int $updatedBy): array {
    $part = getServicePart($partId);
    if (!$part) throw new \RuntimeException('Service part not found.');

    $editable = ['part_name', 'default_cost', 'is_taxable', 'is_active'];
    $sets = []; $binds = []; $changes = [];
    foreach ($editable as $f) {
        if (array_key_exists($f, $data) && (string) ($data[$f] ?? '') !== (string) ($part[$f] ?? '')) {
            $sets[] = "{$f} = ?"; $binds[] = $data[$f];
            $changes[$f] = ['old' => $part[$f], 'new' => $data[$f]];
        }
    }
    if (empty($sets)) return ['changed' => []];
    $binds[] = $partId;
    Database::execute("UPDATE service_parts SET " . implode(', ', $sets) . " WHERE part_id = ?", $binds);
    foreach ($changes as $field => $vals) {
        auditLog('service_parts', $partId, 'UPDATE', $field, (string) ($vals['old'] ?? ''), (string) ($vals['new'] ?? ''), $updatedBy);
    }
    return ['changed' => array_keys($changes)];
}

function deleteServicePart(int $partId, int $deletedBy): void {
    $part = getServicePart($partId);
    if (!$part) throw new \RuntimeException('Service part not found.');
    Database::execute("UPDATE service_parts SET is_active = 0 WHERE part_id = ?", [$partId]);
    auditLog('service_parts', $partId, 'UPDATE', 'is_active', '1', '0', $deletedBy);
}
