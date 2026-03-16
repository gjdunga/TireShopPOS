<?php
// ============================================================================
// tire_pos_p5.php
// Phase 5: Customer Engagement CRUD functions
// DunganSoft Technologies, March 2026
// ============================================================================

use App\Core\Database;

// ============================================================================
// Discount Groups
// ============================================================================

function listDiscountGroups(bool $activeOnly = true): array {
    $where = $activeOnly ? 'WHERE is_active = 1' : '';
    return Database::query("SELECT * FROM discount_groups {$where} ORDER BY group_name");
}

function getDiscountGroup(int $groupId): ?array {
    return Database::queryOne("SELECT * FROM discount_groups WHERE group_id = ?", [$groupId]);
}

function createDiscountGroup(array $data): int {
    $sql = "INSERT INTO discount_groups (group_name, group_code, discount_type, discount_value,
            applies_to, auto_apply, min_purchase, stackable, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)";
    getDB()->prepare($sql)->execute([
        $data['group_name'], $data['group_code'], $data['discount_type'] ?? 'percentage',
        $data['discount_value'] ?? '0', $data['applies_to'] ?? 'all',
        (int) ($data['auto_apply'] ?? 1), $data['min_purchase'] ?? null,
        (int) ($data['stackable'] ?? 0), $data['notes'] ?? null,
    ]);
    return (int) getDB()->lastInsertId();
}

function updateDiscountGroup(int $groupId, array $data): array {
    $editable = ['group_name', 'discount_type', 'discount_value', 'applies_to',
                 'auto_apply', 'min_purchase', 'stackable', 'notes', 'is_active'];
    $sets = []; $params = [];
    foreach ($editable as $col) {
        if (array_key_exists($col, $data)) { $sets[] = "{$col} = ?"; $params[] = $data[$col]; }
    }
    if (empty($sets)) return ['changed' => 0];
    $params[] = $groupId;
    getDB()->prepare("UPDATE discount_groups SET " . implode(', ', $sets) . " WHERE group_id = ?")->execute($params);
    return ['changed' => count($sets)];
}

function getCustomerDiscountGroups(int $customerId): array {
    return Database::query(
        "SELECT dg.*, cdg.added_at, cdg.expires_at, cdg.id AS membership_id
         FROM customer_discount_groups cdg
         JOIN discount_groups dg ON cdg.group_id = dg.group_id
         WHERE cdg.customer_id = ?
           AND dg.is_active = 1
           AND (cdg.expires_at IS NULL OR cdg.expires_at >= CURDATE())
         ORDER BY dg.group_name",
        [$customerId]
    );
}

function addCustomerToGroup(int $customerId, int $groupId, int $addedBy, ?string $expiresAt = null): int {
    $sql = "INSERT INTO customer_discount_groups (customer_id, group_id, added_by, expires_at)
            VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE expires_at = VALUES(expires_at)";
    getDB()->prepare($sql)->execute([$customerId, $groupId, $addedBy, $expiresAt]);
    return (int) getDB()->lastInsertId();
}

function removeCustomerFromGroup(int $customerId, int $groupId): void {
    getDB()->prepare("DELETE FROM customer_discount_groups WHERE customer_id = ? AND group_id = ?")
        ->execute([$customerId, $groupId]);
}

function calculateCustomerDiscount(int $customerId, string $subtotal, string $lineType = 'all'): array {
    $groups = getCustomerDiscountGroups($customerId);
    $totalDiscount = '0.00';
    $applied = [];

    foreach ($groups as $g) {
        if (!$g['auto_apply']) continue;
        if ($g['applies_to'] !== 'all' && $g['applies_to'] !== $lineType) continue;
        if ($g['min_purchase'] && bccomp($subtotal, $g['min_purchase'], 2) < 0) continue;

        $amt = '0.00';
        if ($g['discount_type'] === 'percentage') {
            $amt = bcdiv(bcmul($subtotal, $g['discount_value'], 4), '100', 2);
        } elseif ($g['discount_type'] === 'fixed_per_invoice') {
            $amt = $g['discount_value'];
        }

        if (bccomp($amt, '0.00', 2) > 0) {
            $totalDiscount = bcadd($totalDiscount, $amt, 2);
            $applied[] = ['group' => $g['group_name'], 'code' => $g['group_code'], 'amount' => $amt];
        }
    }

    return ['total_discount' => $totalDiscount, 'applied' => $applied];
}


// ============================================================================
// Coupons
// ============================================================================

function listCoupons(bool $activeOnly = true): array {
    $where = $activeOnly ? "WHERE is_active = 1 AND (valid_until IS NULL OR valid_until >= CURDATE())" : '';
    return Database::query("SELECT * FROM coupons {$where} ORDER BY created_at DESC");
}

function getCoupon(int $couponId): ?array {
    return Database::queryOne("SELECT * FROM coupons WHERE coupon_id = ?", [$couponId]);
}

function getCouponByCode(string $code): ?array {
    return Database::queryOne("SELECT * FROM coupons WHERE coupon_code = ? AND is_active = 1", [$code]);
}

function createCoupon(array $data, int $createdBy): int {
    $sql = "INSERT INTO coupons (coupon_code, coupon_name, coupon_type, discount_type,
            discount_value, buy_qty, get_qty, applies_to, min_purchase, max_discount,
            usage_limit, usage_per_customer, stackable, valid_from, valid_until, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
    getDB()->prepare($sql)->execute([
        strtoupper($data['coupon_code']), $data['coupon_name'],
        $data['coupon_type'] ?? 'store', $data['discount_type'] ?? 'percentage',
        $data['discount_value'], $data['buy_qty'] ?? null, $data['get_qty'] ?? null,
        $data['applies_to'] ?? 'all', $data['min_purchase'] ?? null,
        $data['max_discount'] ?? null, $data['usage_limit'] ?? null,
        $data['usage_per_customer'] ?? null, (int) ($data['stackable'] ?? 0),
        $data['valid_from'] ?? date('Y-m-d'), $data['valid_until'] ?? null, $createdBy,
    ]);
    return (int) getDB()->lastInsertId();
}

function validateCoupon(string $code, string $subtotal, ?int $customerId = null): array {
    $coupon = getCouponByCode($code);
    if (!$coupon) return ['valid' => false, 'reason' => 'Coupon not found.'];

    $now = date('Y-m-d');
    if ($coupon['valid_from'] > $now) return ['valid' => false, 'reason' => 'Coupon not yet active.'];
    if ($coupon['valid_until'] && $coupon['valid_until'] < $now) return ['valid' => false, 'reason' => 'Coupon expired.'];
    if ($coupon['usage_limit'] && $coupon['usage_count'] >= $coupon['usage_limit']) {
        return ['valid' => false, 'reason' => 'Coupon usage limit reached.'];
    }
    if ($customerId && $coupon['usage_per_customer']) {
        $used = (int) Database::scalar(
            "SELECT COUNT(*) FROM coupon_usage WHERE coupon_id = ? AND customer_id = ?",
            [$coupon['coupon_id'], $customerId]
        );
        if ($used >= $coupon['usage_per_customer']) {
            return ['valid' => false, 'reason' => 'Customer usage limit reached.'];
        }
    }
    if ($coupon['min_purchase'] && bccomp($subtotal, $coupon['min_purchase'], 2) < 0) {
        return ['valid' => false, 'reason' => 'Minimum purchase of $' . $coupon['min_purchase'] . ' not met.'];
    }

    // Calculate discount
    $discount = '0.00';
    if ($coupon['discount_type'] === 'percentage') {
        $discount = bcdiv(bcmul($subtotal, $coupon['discount_value'], 4), '100', 2);
    } elseif ($coupon['discount_type'] === 'fixed') {
        $discount = $coupon['discount_value'];
    }

    if ($coupon['max_discount'] && bccomp($discount, $coupon['max_discount'], 2) > 0) {
        $discount = $coupon['max_discount'];
    }

    return [
        'valid' => true,
        'coupon' => $coupon,
        'discount' => $discount,
        'coupon_type' => $coupon['coupon_type'],
        'note' => $coupon['coupon_type'] === 'manufacturer'
            ? 'Manufacturer coupon: reduces taxable base before tax calculation.'
            : 'Store coupon: applied after tax calculation.',
    ];
}

function applyCoupon(int $couponId, int $invoiceId, ?int $customerId, string $discountApplied): void {
    getDB()->prepare(
        "INSERT INTO coupon_usage (coupon_id, invoice_id, customer_id, discount_applied) VALUES (?, ?, ?, ?)"
    )->execute([$couponId, $invoiceId, $customerId, $discountApplied]);

    getDB()->prepare("UPDATE coupons SET usage_count = usage_count + 1 WHERE coupon_id = ?")->execute([$couponId]);
}


// ============================================================================
// Billing Statements
// ============================================================================

function generateStatement(int $customerId, string $periodStart, string $periodEnd, int $createdBy): int {
    $db = getDB();

    // Opening balance: closing balance of previous statement, or 0
    $prevBalance = Database::scalar(
        "SELECT closing_balance FROM billing_statements WHERE customer_id = ? AND period_end < ? ORDER BY period_end DESC LIMIT 1",
        [$customerId, $periodStart]
    ) ?? '0.00';

    // Charges: invoices created in period with balance_due > 0
    $charges = Database::scalar(
        "SELECT COALESCE(SUM(total), 0) FROM invoices WHERE customer_id = ? AND created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 DAY) AND status IN ('open','completed')",
        [$customerId, $periodStart, $periodEnd]
    );

    // Payments in period
    $payments = Database::scalar(
        "SELECT COALESCE(SUM(p.amount), 0) FROM payments p JOIN invoices i ON p.invoice_id = i.invoice_id WHERE i.customer_id = ? AND p.processed_at >= ? AND p.processed_at < DATE_ADD(?, INTERVAL 1 DAY)",
        [$customerId, $periodStart, $periodEnd]
    );

    $closing = bcadd(bcsub(bcadd($prevBalance, $charges, 2), $payments, 2), '0.00', 2);
    $dueDate = date('Y-m-d', strtotime($periodEnd . ' + 30 days'));
    $stmtNum = 'STMT-' . str_pad((string) $customerId, 4, '0', STR_PAD_LEFT) . '-' . date('Ym', strtotime($periodEnd));

    $sql = "INSERT INTO billing_statements (customer_id, statement_number, statement_date, period_start, period_end,
            opening_balance, charges, payments, adjustments, closing_balance, due_date, created_by)
            VALUES (?, ?, CURDATE(), ?, ?, ?, ?, ?, 0, ?, ?, ?)";
    $db->prepare($sql)->execute([
        $customerId, $stmtNum, $periodStart, $periodEnd,
        $prevBalance, $charges, $payments, $closing, $dueDate, $createdBy,
    ]);
    $stmtId = (int) $db->lastInsertId();

    // Populate line items
    $invoices = Database::query(
        "SELECT invoice_id, invoice_number, total, created_at FROM invoices WHERE customer_id = ? AND created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 DAY) AND status IN ('open','completed')",
        [$customerId, $periodStart, $periodEnd]
    );
    foreach ($invoices as $inv) {
        $db->prepare("INSERT INTO statement_line_items (statement_id, line_date, line_type, reference, description, amount, invoice_id) VALUES (?, ?, 'invoice', ?, ?, ?, ?)")
            ->execute([$stmtId, substr($inv['created_at'], 0, 10), $inv['invoice_number'], 'Invoice ' . $inv['invoice_number'], $inv['total'], $inv['invoice_id']]);
    }

    $pmts = Database::query(
        "SELECT p.payment_id, p.amount, p.processed_at, p.payment_method, i.invoice_number FROM payments p JOIN invoices i ON p.invoice_id = i.invoice_id WHERE i.customer_id = ? AND p.processed_at >= ? AND p.processed_at < DATE_ADD(?, INTERVAL 1 DAY)",
        [$customerId, $periodStart, $periodEnd]
    );
    foreach ($pmts as $p) {
        $db->prepare("INSERT INTO statement_line_items (statement_id, line_date, line_type, reference, description, amount, payment_id) VALUES (?, ?, 'payment', ?, ?, ?, ?)")
            ->execute([$stmtId, substr($p['processed_at'], 0, 10), $p['invoice_number'], ucfirst(str_replace('_', ' ', $p['payment_method'])) . ' payment', '-' . $p['amount'], $p['payment_id']]);
    }

    return $stmtId;
}

function getStatement(int $stmtId): ?array {
    $stmt = Database::queryOne(
        "SELECT bs.*, c.first_name, c.last_name, c.phone_primary, c.email,
                c.address_line1, c.city, c.state, c.zip
         FROM billing_statements bs
         JOIN customers c ON bs.customer_id = c.customer_id
         WHERE bs.statement_id = ?",
        [$stmtId]
    );
    if (!$stmt) return null;
    $stmt['line_items'] = Database::query(
        "SELECT * FROM statement_line_items WHERE statement_id = ? ORDER BY line_date, line_id", [$stmtId]
    );
    return $stmt;
}

function listStatements(int $customerId = 0, string $status = '', int $limit = 50, int $offset = 0): array {
    $where = []; $params = [];
    if ($customerId > 0) { $where[] = 'bs.customer_id = ?'; $params[] = $customerId; }
    if ($status) { $where[] = 'bs.status = ?'; $params[] = $status; }
    $whereStr = $where ? 'WHERE ' . implode(' AND ', $where) : '';

    $total = (int) Database::scalar("SELECT COUNT(*) FROM billing_statements bs {$whereStr}", $params);
    $params[] = $limit; $params[] = $offset;
    $rows = Database::query(
        "SELECT bs.*, c.first_name, c.last_name
         FROM billing_statements bs
         JOIN customers c ON bs.customer_id = c.customer_id
         {$whereStr} ORDER BY bs.statement_date DESC LIMIT ? OFFSET ?",
        $params
    );
    return ['rows' => $rows, 'total' => $total];
}

function getArSummary(): array {
    $total = Database::scalar("SELECT COALESCE(SUM(closing_balance), 0) FROM billing_statements WHERE status IN ('sent','overdue') AND closing_balance > 0");
    $overdue = Database::scalar("SELECT COALESCE(SUM(closing_balance), 0) FROM billing_statements WHERE status = 'overdue' AND closing_balance > 0");
    $count = (int) Database::scalar("SELECT COUNT(*) FROM billing_statements WHERE status IN ('sent','overdue') AND closing_balance > 0");
    return ['total_ar' => (float) $total, 'overdue' => (float) $overdue, 'accounts' => $count];
}


// ============================================================================
// Tire Storage
// ============================================================================

function listTireStorage(string $status = 'stored', int $limit = 50, int $offset = 0): array {
    $where = $status ? "WHERE ts.status = ?" : '';
    $params = $status ? [$status] : [];
    $total = (int) Database::scalar("SELECT COUNT(*) FROM tire_storage ts {$where}", $params);
    $params[] = $limit; $params[] = $offset;
    $rows = Database::query(
        "SELECT ts.*, c.first_name, c.last_name, c.phone_primary
         FROM tire_storage ts
         JOIN customers c ON ts.customer_id = c.customer_id
         {$where} ORDER BY ts.stored_at DESC LIMIT ? OFFSET ?",
        $params
    );
    return ['rows' => $rows, 'total' => $total];
}

function createTireStorage(array $data, int $createdBy): int {
    $sql = "INSERT INTO tire_storage (customer_id, tire_id, description, quantity, location_code,
            stored_at, expected_pickup, monthly_rate, notes, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
    getDB()->prepare($sql)->execute([
        (int) $data['customer_id'], isset($data['tire_id']) ? (int) $data['tire_id'] : null,
        $data['description'], (int) ($data['quantity'] ?? 4),
        $data['location_code'] ?? null, $data['stored_at'] ?? date('Y-m-d'),
        $data['expected_pickup'] ?? null, $data['monthly_rate'] ?? '0.00',
        $data['notes'] ?? null, $createdBy,
    ]);
    return (int) getDB()->lastInsertId();
}

function pickupTireStorage(int $storageId): void {
    getDB()->prepare("UPDATE tire_storage SET status = 'picked_up', picked_up_at = CURDATE() WHERE storage_id = ?")->execute([$storageId]);
}

function generateStorageBilling(string $billingMonth): array {
    $items = Database::query(
        "SELECT ts.storage_id, ts.customer_id, ts.monthly_rate
         FROM tire_storage ts
         WHERE ts.status = 'stored' AND ts.monthly_rate > 0",
    );
    $created = 0;
    foreach ($items as $item) {
        $existing = Database::queryOne(
            "SELECT billing_id FROM storage_billing WHERE storage_id = ? AND billing_month = ?",
            [$item['storage_id'], $billingMonth]
        );
        if ($existing) continue;
        getDB()->prepare(
            "INSERT INTO storage_billing (storage_id, billing_month, amount) VALUES (?, ?, ?)"
        )->execute([$item['storage_id'], $billingMonth, $item['monthly_rate']]);
        $created++;
    }
    return ['created' => $created, 'month' => $billingMonth];
}

function listPendingStorageBilling(): array {
    return Database::query(
        "SELECT sb.*, ts.description, ts.customer_id, c.first_name, c.last_name
         FROM storage_billing sb
         JOIN tire_storage ts ON sb.storage_id = ts.storage_id
         JOIN customers c ON ts.customer_id = c.customer_id
         WHERE sb.status = 'pending'
         ORDER BY sb.billing_month, c.last_name"
    );
}


// ============================================================================
// Tire Pricing Advisor
// ============================================================================

function getPricingAdvice(int $tireId): array {
    $tire = Database::queryOne(
        "SELECT t.*, b.brand_name FROM v_tire_inventory t
         LEFT JOIN lkp_brands b ON t.brand_id = b.brand_id
         WHERE t.tire_id = ?",
        [$tireId]
    );
    if (!$tire) return ['error' => 'Tire not found'];

    $cost = (float) ($tire['acquisition_cost'] ?? 0);
    $tread = (int) ($tire['tread_depth_32nds'] ?? 0);
    $condition = $tire['condition'] ?? 'used';
    $currentPrice = (float) ($tire['retail_price'] ?? 0);

    // Brand tier multiplier
    $premiumBrands = ['Michelin', 'Bridgestone', 'Goodyear', 'Continental', 'Pirelli'];
    $midBrands = ['Cooper', 'Falken', 'General', 'Hankook', 'Toyo', 'Yokohama', 'BFGoodrich'];
    $brand = $tire['brand_name'] ?? '';
    $brandTier = in_array($brand, $premiumBrands) ? 'premium' : (in_array($brand, $midBrands) ? 'mid' : 'economy');
    $brandMultiplier = $brandTier === 'premium' ? 1.15 : ($brandTier === 'mid' ? 1.0 : 0.85);

    // Tread life remaining (new tire = 10/32 to 11/32 typically)
    $maxTread = $condition === 'new' ? 1.0 : (max(0, $tread - 2) / 10.0);

    // Age factor (DOT week/year parsing would go here; simplified)
    $ageFactor = 1.0;

    if ($condition === 'new') {
        // New tire pricing: cost * markup
        $suggestedMin = $cost > 0 ? round($cost * 1.25, 2) : 0;
        $suggestedMax = $cost > 0 ? round($cost * 1.60, 2) : 0;
        $suggested = $cost > 0 ? round($cost * 1.40 * $brandMultiplier, 2) : $currentPrice;
    } else {
        // Used tire pricing: based on tread remaining and brand
        $baseUsed = $cost > 0 ? $cost * 2.0 : 40.00;
        $treadAdjusted = $baseUsed * $maxTread * $brandMultiplier * $ageFactor;
        $suggested = round(max($treadAdjusted, 15.00), 2);
        $suggestedMin = round($suggested * 0.80, 2);
        $suggestedMax = round($suggested * 1.25, 2);
    }

    // Comparable sales (same size, last 90 days)
    $comps = Database::query(
        "SELECT AVG(li.unit_price) AS avg_price, COUNT(*) AS sale_count
         FROM invoice_line_items li
         JOIN tires t ON li.tire_id = t.tire_id
         JOIN invoices i ON li.invoice_id = i.invoice_id
         WHERE t.full_size_string = ? AND t.`condition` = ?
           AND li.line_type = 'tire'
           AND i.status IN ('open','completed')
           AND i.created_at >= DATE_SUB(CURDATE(), INTERVAL 90 DAY)",
        [$tire['size_display'] ?? $tire['full_size_string'] ?? '', $condition]
    );
    $avgComp = $comps[0]['avg_price'] ? round((float) $comps[0]['avg_price'], 2) : null;
    $compCount = (int) ($comps[0]['sale_count'] ?? 0);

    return [
        'tire_id' => $tireId,
        'size' => $tire['size_display'] ?? $tire['full_size_string'] ?? '',
        'brand' => $brand,
        'brand_tier' => $brandTier,
        'condition' => $condition,
        'tread_depth' => $tread,
        'acquisition_cost' => $cost,
        'current_price' => $currentPrice,
        'suggested_price' => $suggested,
        'suggested_range' => ['min' => $suggestedMin, 'max' => $suggestedMax],
        'factors' => [
            'brand_multiplier' => $brandMultiplier,
            'tread_life_pct' => round($maxTread * 100, 0),
            'age_factor' => $ageFactor,
        ],
        'comparable_sales' => [
            'avg_price' => $avgComp,
            'sale_count' => $compCount,
            'period' => '90 days',
        ],
    ];
}
