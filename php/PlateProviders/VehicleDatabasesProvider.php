<?php
// ============================================================================
// TireShopPOS: VehicleDatabases.com Plate Provider
// ============================================================================
//
// API: GET https://api.vehicledatabases.com/license-plate-lookup/{plate}/{state}
// Auth: x-AuthKey: {key}
// Response: { vin, year, make, model, trim, body_type, drive_type, engine,
//             transmission, fuel_type, doors }
// Pricing: Tiered subscription plans (starter, growth, scale)
// Docs: https://vehicledatabases.com/license-plate-api
//
// DunganSoft Technologies, March 2026
// ============================================================================

require_once __DIR__ . '/PlateProviderInterface.php';

class VehicleDatabasesProvider implements PlateProviderInterface
{
    private const BASE_URL = 'https://api.vehicledatabases.com/license-plate-lookup';
    private const TIMEOUT  = 10;

    public function getName(): string  { return 'VehicleDatabases'; }
    public function getSlug(): string  { return 'vehicledatabases'; }
    public function getCostCents(): int { return 10; } // Varies by plan; estimate

    public function lookup(string $plate, string $state, string $apiKey, callable $logger): ?array
    {
        if (empty($apiKey)) {
            $logger($this->getName(), self::BASE_URL, 0, false, 'Missing API key', null, 0);
            return null;
        }

        $url = self::BASE_URL . '/' . urlencode($plate) . '/' . urlencode($state);

        $startMs = hrtime(true);

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => self::TIMEOUT,
            CURLOPT_HTTPHEADER     => [
                'x-AuthKey: ' . $apiKey,
                'Accept: application/json',
            ],
        ]);

        $response = curl_exec($ch);
        $httpStatus = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        $elapsedMs = (int) ((hrtime(true) - $startMs) / 1_000_000);

        if ($response === false || $httpStatus !== 200) {
            $errorMsg = $curlError ?: "HTTP {$httpStatus}";
            $logger($this->getName(), $url, $httpStatus, false, $errorMsg, $elapsedMs, 0);
            return null;
        }

        $data = json_decode($response, true);
        if (!$data || empty($data['vin'])) {
            $logger($this->getName(), $url, $httpStatus, false, 'Empty or invalid response', $elapsedMs, 0);
            return null;
        }

        $logger($this->getName(), $url, $httpStatus, true, null, $elapsedMs, $this->getCostCents());

        return [
            'vin'        => $data['vin'] ?? null,
            'year'       => isset($data['year']) ? (int) $data['year'] : null,
            'make'       => $data['make'] ?? null,
            'model'      => $data['model'] ?? null,
            'trim_level' => $data['trim'] ?? null,
            'engine'     => $data['engine'] ?? null,
            'drive_type' => $data['drive_type'] ?? $data['drivetrain'] ?? null,
            'color'      => null, // Not returned by this API
            'body_style' => $data['body_type'] ?? null,
        ];
    }
}
