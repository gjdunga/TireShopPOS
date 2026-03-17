<?php
/**
 * ============================================================================
 * WebhookDispatcher: Outbound event dispatch and inbound webhook processing.
 * ============================================================================
 *
 * Outbound: When business events fire (via logActivity), this dispatcher
 *   finds all active webhook endpoints subscribed to that event, signs the
 *   payload with HMAC-SHA256, and POSTs to each URL. Results logged in
 *   webhook_deliveries. Failed deliveries are retried up to max_attempts.
 *
 * Inbound: External systems (Flowroute, marketplace platforms) POST to
 *   /api/webhooks/inbound/{provider}. Payloads are logged in
 *   webhook_inbound_log with optional signature verification.
 *
 * Event types (match logActivity types):
 *   WO_CREATE, WO_COMPLETE, WO_ASSIGN, CUSTOMER_CREATE, VEHICLE_CREATE,
 *   APPT_CREATE, TIRE_ADD, TIRE_WRITE_OFF, PO_CREATE, PO_RECEIVE,
 *   WAIVER_CREATE, CONFIG_UPDATE
 *
 * DunganSoft Technologies, March 2026
 * ============================================================================
 */

use App\Core\Database;

class WebhookDispatcher
{
    /** All supported outbound event types. */
    public const EVENTS = [
        'WO_CREATE', 'WO_COMPLETE', 'WO_ASSIGN',
        'WO_LINE_ADD', 'WO_LINE_DELETE',
        'CUSTOMER_CREATE', 'VEHICLE_CREATE', 'APPT_CREATE',
        'TIRE_ADD', 'TIRE_WRITE_OFF',
        'PO_CREATE', 'PO_RECEIVE',
        'WAIVER_CREATE', 'CONFIG_UPDATE',
        'SERVICE_CREATE', 'SERVICE_DELETE',
        'FEE_CREATE', 'FEE_DELETE',
    ];

    // ========================================================================
    // Outbound: Fire events
    // ========================================================================

    /**
     * Fire an event to all subscribed active endpoints.
     * Called from logActivity() after the activity is recorded.
     *
     * @param string   $eventType One of self::EVENTS
     * @param array    $payload   Event data (entity_type, entity_id, details, user_id, etc.)
     */
    public static function fire(string $eventType, array $payload): void
    {
        if (!in_array($eventType, self::EVENTS, true)) {
            return;
        }

        $endpoints = Database::query(
            "SELECT endpoint_id, url, secret FROM webhook_endpoints WHERE is_active = 1"
        );

        if (empty($endpoints)) {
            return;
        }

        $payload['event'] = $eventType;
        $payload['fired_at'] = date('Y-m-d\TH:i:s\Z');
        $jsonPayload = json_encode($payload, JSON_UNESCAPED_SLASHES);

        foreach ($endpoints as $ep) {
            // Check if this endpoint subscribes to this event
            $events = json_decode($ep['events'] ?? '[]', true);
            if (!is_array($events)) continue;

            // Support wildcard "*" subscription
            if (!in_array('*', $events, true) && !in_array($eventType, $events, true)) {
                continue;
            }

            // Create delivery record
            Database::execute(
                "INSERT INTO webhook_deliveries (endpoint_id, event_type, payload, status, max_attempts)
                 VALUES (?, ?, ?, 'pending', 3)",
                [$ep['endpoint_id'], $eventType, $jsonPayload]
            );
            $deliveryId = Database::lastInsertId();

            // Attempt delivery
            self::deliver($deliveryId, $ep['url'], $ep['secret'], $jsonPayload);
        }
    }

    /**
     * Attempt to deliver a webhook.
     */
    private static function deliver(int $deliveryId, string $url, string $secret, string $payload): void
    {
        $signature = hash_hmac('sha256', $payload, $secret);
        $timestamp = time();

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $payload,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 10,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_HTTPHEADER     => [
                'Content-Type: application/json',
                'X-Webhook-Signature: sha256=' . $signature,
                'X-Webhook-Timestamp: ' . $timestamp,
                'X-Webhook-Id: ' . $deliveryId,
                'User-Agent: TireShopPOS/1.1.0',
            ],
        ]);

        $response = curl_exec($ch);
        $httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlErr = curl_error($ch);
        curl_close($ch);

        $responseBody = is_string($response) ? substr($response, 0, 1000) : null;

        if ($curlErr) {
            self::markFailed($deliveryId, "curl: {$curlErr}", $responseBody);
            return;
        }

        if ($httpCode >= 200 && $httpCode < 300) {
            Database::execute(
                "UPDATE webhook_deliveries SET status = 'sent', response_code = ?,
                 response_body = ?, attempts = attempts + 1, completed_at = NOW()
                 WHERE delivery_id = ?",
                [$httpCode, $responseBody, $deliveryId]
            );
        } else {
            self::markFailed($deliveryId, "HTTP {$httpCode}", $responseBody, $httpCode);
        }
    }

    /**
     * Mark a delivery as failed and schedule retry if attempts remain.
     */
    private static function markFailed(int $deliveryId, string $error, ?string $responseBody, ?int $httpCode = null): void
    {
        $delivery = Database::queryOne("SELECT attempts, max_attempts FROM webhook_deliveries WHERE delivery_id = ?", [$deliveryId]);
        $attempts = ($delivery['attempts'] ?? 0) + 1;
        $maxAttempts = $delivery['max_attempts'] ?? 3;

        if ($attempts >= $maxAttempts) {
            Database::execute(
                "UPDATE webhook_deliveries SET status = 'failed', response_code = ?,
                 response_body = ?, error_message = ?, attempts = ?, completed_at = NOW()
                 WHERE delivery_id = ?",
                [$httpCode, $responseBody, substr($error, 0, 255), $attempts, $deliveryId]
            );
        } else {
            // Exponential backoff: 30s, 120s, 480s
            $delaySec = 30 * pow(4, $attempts - 1);
            Database::execute(
                "UPDATE webhook_deliveries SET response_code = ?, response_body = ?,
                 error_message = ?, attempts = ?, next_retry_at = DATE_ADD(NOW(), INTERVAL ? SECOND)
                 WHERE delivery_id = ?",
                [$httpCode, $responseBody, substr($error, 0, 255), $attempts, $delaySec, $deliveryId]
            );
        }
    }

    /**
     * Process pending retries. Called from cron or manually.
     * Returns count of deliveries retried.
     */
    public static function processRetries(int $limit = 20): array
    {
        $pending = Database::query(
            "SELECT d.delivery_id, d.payload, e.url, e.secret
             FROM webhook_deliveries d
             JOIN webhook_endpoints e ON d.endpoint_id = e.endpoint_id
             WHERE d.status = 'pending' AND d.attempts > 0
               AND d.next_retry_at IS NOT NULL AND d.next_retry_at <= NOW()
               AND e.is_active = 1
             ORDER BY d.next_retry_at ASC
             LIMIT ?",
            [$limit]
        );

        $sent = 0;
        $failed = 0;

        foreach ($pending as $d) {
            self::deliver($d['delivery_id'], $d['url'], $d['secret'], $d['payload']);
            $row = Database::queryOne("SELECT status FROM webhook_deliveries WHERE delivery_id = ?", [$d['delivery_id']]);
            if ($row && $row['status'] === 'sent') $sent++;
            else $failed++;
        }

        return ['retried' => count($pending), 'sent' => $sent, 'failed' => $failed];
    }

    // ========================================================================
    // Inbound: Receive webhooks
    // ========================================================================

    /**
     * Log an inbound webhook payload.
     *
     * @param string  $provider   Provider slug (e.g., 'flowroute', 'facebook_marketplace')
     * @param string  $payload    Raw request body
     * @param array   $headers    Relevant headers for signature verification
     * @param ?bool   $sigValid   Signature validation result (null if no sig expected)
     * @return int    Inbound log ID
     */
    public static function logInbound(string $provider, string $payload, array $headers = [], ?bool $sigValid = null): int
    {
        $decoded = json_decode($payload, true);
        $eventType = $decoded['event'] ?? $decoded['type'] ?? $decoded['event_type'] ?? null;

        Database::execute(
            "INSERT INTO webhook_inbound_log (provider, event_type, payload, headers, signature_valid, remote_ip)
             VALUES (?, ?, ?, ?, ?, ?)",
            [
                $provider,
                $eventType,
                $payload,
                !empty($headers) ? json_encode($headers) : null,
                $sigValid,
                $_SERVER['REMOTE_ADDR'] ?? null,
            ]
        );

        return Database::lastInsertId();
    }

    /**
     * Verify HMAC-SHA256 signature on an inbound webhook.
     *
     * @param string $payload   Raw request body
     * @param string $signature Signature from header (e.g., "sha256=abc123...")
     * @param string $secret    Shared secret for this provider
     * @return bool
     */
    public static function verifySignature(string $payload, string $signature, string $secret): bool
    {
        $expected = 'sha256=' . hash_hmac('sha256', $payload, $secret);
        return hash_equals($expected, $signature);
    }

    /**
     * Mark an inbound webhook as processed.
     */
    public static function markInboundProcessed(int $inboundId, string $result): void
    {
        Database::execute(
            "UPDATE webhook_inbound_log SET processed = 1, process_result = ? WHERE inbound_id = ?",
            [substr($result, 0, 255), $inboundId]
        );
    }

    // ========================================================================
    // CRUD for webhook endpoints
    // ========================================================================

    public static function listEndpoints(): array
    {
        return Database::query("SELECT * FROM webhook_endpoints ORDER BY created_at DESC");
    }

    public static function getEndpoint(int $id): ?array
    {
        return Database::queryOne("SELECT * FROM webhook_endpoints WHERE endpoint_id = ?", [$id]);
    }

    public static function createEndpoint(array $data, int $createdBy): int
    {
        \InputValidator::check('webhook_endpoints', $data, ['url']);

        $url = trim($data['url']);
        $secret = $data['secret'] ?? bin2hex(random_bytes(32));
        $events = $data['events'] ?? ['*'];
        if (!is_array($events)) $events = ['*'];

        Database::execute(
            "INSERT INTO webhook_endpoints (url, secret, label, events, is_active, created_by)
             VALUES (?, ?, ?, ?, 1, ?)",
            [$url, $secret, $data['label'] ?? null, json_encode($events), $createdBy]
        );

        $id = Database::lastInsertId();
        auditLog('webhook_endpoints', $id, 'INSERT', null, null, null, $createdBy);
        return $id;
    }

    public static function updateEndpoint(int $id, array $data, int $updatedBy): array
    {
        $ep = self::getEndpoint($id);
        if (!$ep) throw new \RuntimeException('Webhook endpoint not found.');
        \InputValidator::check('webhook_endpoints', $data);

        $sets = [];
        $params = [];
        foreach (['url', 'label', 'secret'] as $f) {
            if (array_key_exists($f, $data)) {
                $sets[] = "{$f} = ?";
                $params[] = $data[$f];
            }
        }
        if (array_key_exists('events', $data)) {
            $sets[] = "events = ?";
            $params[] = json_encode(is_array($data['events']) ? $data['events'] : ['*']);
        }
        if (array_key_exists('is_active', $data)) {
            $sets[] = "is_active = ?";
            $params[] = (int) $data['is_active'];
        }

        if (empty($sets)) return ['changed' => 0];

        $params[] = $id;
        Database::execute("UPDATE webhook_endpoints SET " . implode(', ', $sets) . " WHERE endpoint_id = ?", $params);
        auditLog('webhook_endpoints', $id, 'UPDATE', null, null, null, $updatedBy);

        return ['changed' => count($sets)];
    }

    public static function deleteEndpoint(int $id, int $deletedBy): void
    {
        auditLog('webhook_endpoints', $id, 'DELETE', null, null, null, $deletedBy);
        Database::execute("DELETE FROM webhook_endpoints WHERE endpoint_id = ?", [$id]);
    }

    /**
     * Test an endpoint by sending a ping event.
     */
    public static function testEndpoint(int $id): array
    {
        $ep = self::getEndpoint($id);
        if (!$ep) return ['success' => false, 'error' => 'Endpoint not found.'];

        $payload = json_encode([
            'event' => 'PING',
            'fired_at' => date('Y-m-d\TH:i:s\Z'),
            'message' => 'TireShopPOS webhook test',
            'endpoint_id' => $id,
        ], JSON_UNESCAPED_SLASHES);

        $signature = hash_hmac('sha256', $payload, $ep['secret']);

        $ch = curl_init($ep['url']);
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $payload,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 10,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_HTTPHEADER     => [
                'Content-Type: application/json',
                'X-Webhook-Signature: sha256=' . $signature,
                'X-Webhook-Timestamp: ' . time(),
                'X-Webhook-Id: test',
                'User-Agent: TireShopPOS/1.1.0',
            ],
        ]);

        $response = curl_exec($ch);
        $httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlErr = curl_error($ch);
        curl_close($ch);

        if ($curlErr) return ['success' => false, 'error' => "Connection failed: {$curlErr}"];
        if ($httpCode >= 200 && $httpCode < 300) return ['success' => true, 'status' => $httpCode];
        return ['success' => false, 'error' => "HTTP {$httpCode}", 'status' => $httpCode];
    }

    /**
     * Get delivery stats for the admin UI.
     */
    public static function getStats(): array
    {
        $pending = (int) Database::scalar("SELECT COUNT(*) FROM webhook_deliveries WHERE status = 'pending'");
        $sentToday = (int) Database::scalar("SELECT COUNT(*) FROM webhook_deliveries WHERE status = 'sent' AND completed_at >= CURDATE()");
        $failedToday = (int) Database::scalar("SELECT COUNT(*) FROM webhook_deliveries WHERE status = 'failed' AND completed_at >= CURDATE()");

        return ['pending' => $pending, 'sent_today' => $sentToday, 'failed_today' => $failedToday];
    }

    /**
     * Get recent deliveries for an endpoint.
     */
    public static function getDeliveries(int $endpointId, int $limit = 20): array
    {
        return Database::query(
            "SELECT delivery_id, event_type, status, response_code, error_message, attempts, created_at, completed_at
             FROM webhook_deliveries WHERE endpoint_id = ? ORDER BY created_at DESC LIMIT ?",
            [$endpointId, $limit]
        );
    }

    /**
     * Get recent inbound webhooks.
     */
    public static function getInboundLog(string $provider = '', int $limit = 50): array
    {
        if ($provider !== '') {
            return Database::query(
                "SELECT * FROM webhook_inbound_log WHERE provider = ? ORDER BY created_at DESC LIMIT ?",
                [$provider, $limit]
            );
        }
        return Database::query("SELECT * FROM webhook_inbound_log ORDER BY created_at DESC LIMIT ?", [$limit]);
    }
}
