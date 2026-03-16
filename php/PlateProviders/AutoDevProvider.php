<?php
// ============================================================================
// TireShopPOS: Auto.dev Plate Provider
// ============================================================================
//
// API: GET https://api.auto.dev/plate/{state}/{plate}
// Auth: Authorization: Bearer {key}
// Response: { vin, year, make, model, trim, drivetrain, engine, transmission }
// Pricing: 1,000 free calls/month, usage-based after that
// Docs: https://docs.auto.dev/v2/products/plate-to-vin
//
// DunganSoft Technologies, March 2026
// ============================================================================

require_once __DIR__ . '/PlateProviderInterface.php';

class AutoDevProvider implements PlateProviderInterface
{
    private const BASE_URL = 'https://api.auto.dev/plate';
    private const TIMEOUT  = 10;

    /** @inheritDoc */
    public function getName(): string  { return 'Auto.dev'; }

    /** @inheritDoc */
    public function getSlug(): string  { return 'autodev'; }

    /**
     * Auto.dev free tier: 1,000 calls/month at $0.00, usage-based after.
     * We report 0 cents; actual overage cost depends on the user's plan.
     */
    public function getCostCents(): int { return 0; }

    /**
     * Call Auto.dev plate-to-VIN endpoint.
     *
     * Request:  GET https://api.auto.dev/plate/{state}/{plate}
     * Headers:  Authorization: Bearer {apiKey}
     * Response: { vin, year, make, model, trim, drivetrain, engine, transmission, isDefault }
     *
     * @inheritDoc
     */

    public function lookup(string $plate, string $state, string $apiKey, callable $logger): ?array
    {
        if (empty($apiKey)) {
            $logger($this->getName(), self::BASE_URL, 0, false, 'Missing API key', null, 0);
            return null;
        }

        // Auto.dev uses path params: /plate/{state}/{plate}
        $url = self::BASE_URL . '/' . urlencode($state) . '/' . urlencode($plate);

        $startMs = hrtime(true);

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => self::TIMEOUT,
            CURLOPT_HTTPHEADER     => [
                'Authorization: Bearer ' . $apiKey,
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
            'drive_type' => $data['drivetrain'] ?? null,
            'color'      => null, // Auto.dev does not return color
            'body_style' => null, // Auto.dev does not return body style in plate endpoint
        ];
    }
}
