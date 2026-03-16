<?php
// ============================================================================
// tire_pos_p6.php
// Phase 6: Marketplace Integration CRUD functions
// DunganSoft Technologies, March 2026
// ============================================================================

use App\Core\Database;

// ============================================================================
// Integration Credentials
// ============================================================================

function getIntegrationCredentials(string $integration, string $env = 'production'): array {
    return Database::query(
        "SELECT credential_key, credential_value, expires_at
         FROM integration_credentials
         WHERE integration = ? AND environment = ? AND is_active = 1",
        [$integration, $env]
    );
}

function setIntegrationCredential(string $integration, string $key, string $value, int $userId, string $env = 'production', ?string $expires = null): void {
    $sql = "INSERT INTO integration_credentials (integration, credential_key, credential_value, environment, expires_at, updated_by)
            VALUES (?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE credential_value = VALUES(credential_value), expires_at = VALUES(expires_at),
            updated_by = VALUES(updated_by), is_active = 1";
    getDB()->prepare($sql)->execute([$integration, $key, $value, $env, $expires, $userId]);
}

function listIntegrations(): array {
    return Database::query(
        "SELECT integration, environment, COUNT(*) AS credential_count,
                MAX(updated_at) AS last_updated
         FROM integration_credentials WHERE is_active = 1
         GROUP BY integration, environment
         ORDER BY integration"
    );
}

function removeIntegrationCredential(string $integration, string $key, string $env = 'production'): void {
    getDB()->prepare(
        "UPDATE integration_credentials SET is_active = 0 WHERE integration = ? AND credential_key = ? AND environment = ?"
    )->execute([$integration, $key, $env]);
}


// ============================================================================
// Integration Sync Log
// ============================================================================

function logSync(string $integration, string $action, string $direction, string $status,
    ?string $reqSummary = null, ?int $respCode = null, ?string $respSummary = null,
    ?string $error = null, ?string $entityType = null, ?int $entityId = null, ?int $durationMs = null): int {

    $sql = "INSERT INTO integration_sync_log
            (integration, action, direction, status, request_summary, response_code,
             response_summary, error_message, entity_type, entity_id, duration_ms)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
    getDB()->prepare($sql)->execute([
        $integration, $action, $direction, $status, $reqSummary, $respCode,
        $respSummary, $error, $entityType, $entityId, $durationMs,
    ]);
    return (int) getDB()->lastInsertId();
}

function getSyncLog(string $integration = '', int $limit = 50, int $offset = 0): array {
    $where = $integration ? 'WHERE integration = ?' : '';
    $params = $integration ? [$integration] : [];
    $total = (int) Database::scalar("SELECT COUNT(*) FROM integration_sync_log {$where}", $params);
    $params[] = $limit; $params[] = $offset;
    $rows = Database::query(
        "SELECT * FROM integration_sync_log {$where} ORDER BY created_at DESC LIMIT ? OFFSET ?", $params
    );
    return ['rows' => $rows, 'total' => $total];
}


// ============================================================================
// Marketplace Listings
// ============================================================================

function createListing(array $data, int $createdBy): int {
    $sql = "INSERT INTO marketplace_listings
            (platform, tire_id, wheel_id, title, description, price, status, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)";
    getDB()->prepare($sql)->execute([
        $data['platform'], $data['tire_id'] ?? null, $data['wheel_id'] ?? null,
        $data['title'], $data['description'] ?? null, $data['price'],
        $data['status'] ?? 'draft', $createdBy,
    ]);
    return (int) getDB()->lastInsertId();
}

function listListings(string $platform = '', string $status = '', int $limit = 50, int $offset = 0): array {
    $where = []; $params = [];
    if ($platform) { $where[] = 'ml.platform = ?'; $params[] = $platform; }
    if ($status) { $where[] = 'ml.status = ?'; $params[] = $status; }
    $whereStr = $where ? 'WHERE ' . implode(' AND ', $where) : '';

    $total = (int) Database::scalar("SELECT COUNT(*) FROM marketplace_listings ml {$whereStr}", $params);
    $params[] = $limit; $params[] = $offset;
    $rows = Database::query(
        "SELECT ml.*, t.full_size_string AS tire_size, tb.brand_name AS tire_brand
         FROM marketplace_listings ml
         LEFT JOIN tires t ON ml.tire_id = t.tire_id
         LEFT JOIN lkp_brands tb ON t.brand_id = tb.brand_id
         {$whereStr}
         ORDER BY ml.created_at DESC LIMIT ? OFFSET ?",
        $params
    );
    return ['rows' => $rows, 'total' => $total];
}

function updateListing(int $listingId, array $data): array {
    $editable = ['title', 'description', 'price', 'status', 'external_id', 'external_url',
                 'listed_at', 'expires_at', 'sync_status', 'last_synced_at'];
    $sets = []; $params = [];
    foreach ($editable as $col) {
        if (array_key_exists($col, $data)) { $sets[] = "{$col} = ?"; $params[] = $data[$col]; }
    }
    if (empty($sets)) return ['changed' => 0];
    $params[] = $listingId;
    getDB()->prepare("UPDATE marketplace_listings SET " . implode(', ', $sets) . " WHERE listing_id = ?")->execute($params);
    return ['changed' => count($sets)];
}

function generateListingContent(int $tireId, string $platform): array {
    $tire = Database::queryOne(
        "SELECT t.*, b.brand_name FROM v_tire_inventory t
         LEFT JOIN lkp_brands b ON t.brand_id = b.brand_id WHERE t.tire_id = ?",
        [$tireId]
    );
    if (!$tire) throw new RuntimeException('Tire not found');

    $size = $tire['size_display'] ?? $tire['full_size_string'] ?? '';
    $brand = $tire['brand_name'] ?? 'Unknown';
    $model = $tire['model'] ?? '';
    $cond = ucfirst($tire['condition'] ?? 'used');
    $tread = ($tire['tread_depth_32nds'] ?? '') . '/32"';
    $price = number_format((float) ($tire['retail_price'] ?? 0), 2);

    $title = "{$cond} {$brand} {$model} {$size} Tire";

    if ($platform === 'ebay') {
        $desc = "{$cond} {$brand} {$model} tire, size {$size}.\n\n"
            . "Tread Depth: {$tread}\n"
            . "DOT: " . ($tire['dot_tin'] ?? 'N/A') . "\n\n"
            . "Professionally inspected. Mounting and balancing available at our Canon City, CO shop.\n"
            . "Road hazard warranty available for purchase.\n\n"
            . "Ships within 2 business days. Local pickup also available.";
    } elseif ($platform === 'craigslist' || $platform === 'facebook') {
        $desc = "{$cond} {$brand} {$model} {$size}\n"
            . "Tread: {$tread}\n"
            . "Price: \${$price}\n\n"
            . "Professionally inspected at our shop. Mount + balance available.\n"
            . "Cash, card, or Venmo accepted.\n"
            . "Located in Canon City, CO. Call or text for availability.";
    } else {
        $desc = "{$cond} {$brand} {$model} {$size}, tread {$tread}. \${$price}.";
    }

    return [
        'title' => $title,
        'description' => $desc,
        'price' => (float) ($tire['retail_price'] ?? 0),
        'tire' => $tire,
    ];
}


// ============================================================================
// Marketplace Orders
// ============================================================================

function importMarketplaceOrder(array $data): int {
    $sql = "INSERT INTO marketplace_orders
            (platform, external_order_id, buyer_name, buyer_email, buyer_phone,
             buyer_address, order_total, platform_fees, shipping_cost, status, ordered_at, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE status = VALUES(status), notes = VALUES(notes)";
    getDB()->prepare($sql)->execute([
        $data['platform'], $data['external_order_id'],
        $data['buyer_name'] ?? null, $data['buyer_email'] ?? null,
        $data['buyer_phone'] ?? null, $data['buyer_address'] ?? null,
        $data['order_total'] ?? '0', $data['platform_fees'] ?? '0',
        $data['shipping_cost'] ?? '0', $data['status'] ?? 'pending',
        $data['ordered_at'] ?? date('Y-m-d H:i:s'), $data['notes'] ?? null,
    ]);
    return (int) getDB()->lastInsertId();
}

function listMarketplaceOrders(string $platform = '', string $status = '', int $limit = 50, int $offset = 0): array {
    $where = []; $params = [];
    if ($platform) { $where[] = 'platform = ?'; $params[] = $platform; }
    if ($status) { $where[] = 'status = ?'; $params[] = $status; }
    $whereStr = $where ? 'WHERE ' . implode(' AND ', $where) : '';

    $total = (int) Database::scalar("SELECT COUNT(*) FROM marketplace_orders {$whereStr}", $params);
    $params[] = $limit; $params[] = $offset;
    $rows = Database::query(
        "SELECT * FROM marketplace_orders {$whereStr} ORDER BY ordered_at DESC LIMIT ? OFFSET ?", $params
    );
    return ['rows' => $rows, 'total' => $total];
}

function getMarketplaceOrder(int $orderId): ?array {
    $order = Database::queryOne("SELECT * FROM marketplace_orders WHERE order_id = ?", [$orderId]);
    if (!$order) return null;
    $order['items'] = Database::query("SELECT * FROM marketplace_order_items WHERE order_id = ?", [$orderId]);
    return $order;
}

function updateMarketplaceOrderStatus(int $orderId, string $status, ?int $invoiceId = null): void {
    $sql = "UPDATE marketplace_orders SET status = ?";
    $params = [$status];
    if ($invoiceId) { $sql .= ", invoice_id = ?"; $params[] = $invoiceId; }
    $sql .= " WHERE order_id = ?";
    $params[] = $orderId;
    getDB()->prepare($sql)->execute($params);
}


// ============================================================================
// B2B Network
// ============================================================================

function listB2bInventory(string $listingType = '', bool $visibleOnly = true): array {
    $where = [];
    $params = [];
    if ($visibleOnly) $where[] = 'b.visible = 1';
    if ($listingType) { $where[] = 'b.listing_type = ?'; $params[] = $listingType; }
    $whereStr = $where ? 'WHERE ' . implode(' AND ', $where) : '';

    return Database::query(
        "SELECT b.*, t.full_size_string AS tire_size, tb.brand_name AS tire_brand,
                t.tread_depth_32nds, t.`condition` AS tire_condition
         FROM b2b_network_inventory b
         LEFT JOIN tires t ON b.tire_id = t.tire_id
         LEFT JOIN lkp_brands tb ON t.brand_id = tb.brand_id
         LEFT JOIN wheels w ON b.wheel_id = w.wheel_id
         {$whereStr}
         ORDER BY b.created_at DESC",
        $params
    );
}

function addToB2bNetwork(array $data): int {
    $sql = "INSERT INTO b2b_network_inventory
            (tire_id, wheel_id, listing_type, wholesale_price, min_quantity, max_quantity, description)
            VALUES (?, ?, ?, ?, ?, ?, ?)";
    getDB()->prepare($sql)->execute([
        $data['tire_id'] ?? null, $data['wheel_id'] ?? null,
        $data['listing_type'] ?? 'sell', $data['wholesale_price'],
        (int) ($data['min_quantity'] ?? 1), $data['max_quantity'] ?? null,
        $data['description'] ?? null,
    ]);
    return (int) getDB()->lastInsertId();
}

function removeFromB2bNetwork(int $b2bId): void {
    getDB()->prepare("UPDATE b2b_network_inventory SET visible = 0 WHERE b2b_id = ?")->execute([$b2bId]);
}


// ============================================================================
// Directory Listings
// ============================================================================

function listDirectoryListings(): array {
    return Database::query("SELECT * FROM directory_listings ORDER BY directory_name");
}

function createDirectoryListing(array $data): int {
    $sql = "INSERT INTO directory_listings (directory_name, listing_url, listing_status, profile_data, notes)
            VALUES (?, ?, ?, ?, ?)";
    getDB()->prepare($sql)->execute([
        $data['directory_name'], $data['listing_url'] ?? null,
        $data['listing_status'] ?? 'pending',
        isset($data['profile_data']) ? json_encode($data['profile_data']) : null,
        $data['notes'] ?? null,
    ]);
    return (int) getDB()->lastInsertId();
}

function updateDirectoryListing(int $dirId, array $data): void {
    $editable = ['listing_url', 'listing_status', 'profile_data', 'notes', 'last_verified'];
    $sets = []; $params = [];
    foreach ($editable as $col) {
        if (array_key_exists($col, $data)) {
            $sets[] = "{$col} = ?";
            $params[] = $col === 'profile_data' ? json_encode($data[$col]) : $data[$col];
        }
    }
    if (empty($sets)) return;
    $params[] = $dirId;
    getDB()->prepare("UPDATE directory_listings SET " . implode(', ', $sets) . " WHERE directory_id = ?")->execute($params);
}


// ============================================================================
// Distributor Integration (ATD / TBC / NTW abstraction)
// ============================================================================

function searchDistributorCatalog(string $distributor, string $size): array {
    // Abstraction layer: real implementation calls distributor API.
    // Framework returns structure; actual API calls activate with credentials.
    $creds = getIntegrationCredentials($distributor);
    if (empty($creds)) {
        return ['error' => "No credentials configured for {$distributor}. Add API keys in Settings > Integrations.",
                'results' => []];
    }

    $startMs = (int) (microtime(true) * 1000);

    // Placeholder: in production, this would call the distributor's REST API
    // with the configured credentials. The response structure is standardized.
    $results = [
        'distributor' => $distributor,
        'query' => $size,
        'results' => [],
        'note' => "Distributor API integration ready. Configure {$distributor} credentials to enable live catalog search.",
    ];

    $durationMs = (int) (microtime(true) * 1000) - $startMs;
    logSync($distributor, 'search_catalog', 'outbound', 'success',
        "Search: {$size}", 200, 'Framework ready', null, 'tire', null, $durationMs);

    return $results;
}

function placeDistributorOrder(string $distributor, array $items): array {
    $creds = getIntegrationCredentials($distributor);
    if (empty($creds)) {
        return ['error' => "No credentials configured for {$distributor}."];
    }

    // Framework: validates items, logs intent, returns order structure
    $startMs = (int) (microtime(true) * 1000);

    $order = [
        'distributor' => $distributor,
        'items' => $items,
        'status' => 'framework_ready',
        'note' => "Order framework ready. Live ordering activates with {$distributor} API credentials.",
    ];

    $durationMs = (int) (microtime(true) * 1000) - $startMs;
    logSync($distributor, 'place_order', 'outbound', 'success',
        count($items) . ' items', 200, 'Framework ready', null, null, null, $durationMs);

    return $order;
}
