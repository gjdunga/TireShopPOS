<?php
// ============================================================================
// TireShopPOS: PlateToVIN Plate Provider
// ============================================================================
//
// API: POST https://platetovin.com/api/convert
// Auth: Authorization: {key} (no "Bearer" prefix)
// Body: { "plate": "...", "state": "..." }
// Response: { success, vin: { vin, year, make, model, trim, engine, style,
//             driveType, fuel, color: { name, abbreviation }, transmission } }
// Pricing: $0.05 per call
// Docs: https://platetovin.com/docs/index.html
//
// DunganSoft Technologies, March 2026
// ============================================================================

require_once __DIR__ . '/PlateProviderInterface.php';

class PlateToVinProvider implements PlateProviderInterface
{
    private const BASE_URL = 'https://platetovin.com/api/convert';
    private const TIMEOUT  = 10;

    /** @inheritDoc */
    public function getName(): string  { return 'PlateToVIN'; }

    /** @inheritDoc */
    public function getSlug(): string  { return 'platetovin'; }

    /** Fixed $0.05 per call. */
    public function getCostCents(): int { return 5; }

    /**
     * Call PlateToVIN plate-to-VIN endpoint.
     *
     * Request:  POST https://platetovin.com/api/convert
     * Headers:  Authorization: {apiKey}  (no "Bearer" prefix)
     * Body:     { "plate": "...", "state": "..." }
     * Response: { success, vin: { vin, year, make, model, trim, engine,
     *             style, driveType, fuel, color: { name, abbreviation },
     *             transmission } }
     *
     * Note: PlateToVIN nests vehicle data under a "vin" key in the response.
     * The color field is an object with name and abbreviation sub-fields.
     *
     * @inheritDoc
     */

    public function lookup(string $plate, string $state, string $apiKey, callable $logger): ?array
    {
        if (empty($apiKey)) {
            $logger($this->getName(), self::BASE_URL, 0, false, 'Missing API key', null, 0);
            return null;
        }

        $url = self::BASE_URL;
        $payload = json_encode(['plate' => $plate, 'state' => $state]);

        $startMs = hrtime(true);

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => self::TIMEOUT,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $payload,
            CURLOPT_HTTPHEADER     => [
                'Authorization: ' . $apiKey,  // PlateToVIN: no "Bearer" prefix
                'Content-Type: application/json',
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

        // PlateToVIN nests vehicle data under "vin" key
        $vinData = $data['vin'] ?? $data;
        if (empty($vinData['vin'])) {
            $logger($this->getName(), $url, $httpStatus, false, 'Empty or invalid response', $elapsedMs, 0);
            return null;
        }

        $logger($this->getName(), $url, $httpStatus, true, null, $elapsedMs, $this->getCostCents());

        $colorName = null;
        if (isset($vinData['color'])) {
            $colorName = is_array($vinData['color'])
                ? ($vinData['color']['name'] ?? null)
                : $vinData['color'];
        }

        return [
            'vin'        => $vinData['vin'] ?? null,
            'year'       => isset($vinData['year']) ? (int) $vinData['year'] : null,
            'make'       => $vinData['make'] ?? null,
            'model'      => $vinData['model'] ?? null,
            'trim_level' => $vinData['trim'] ?? null,
            'engine'     => $vinData['engine'] ?? null,
            'drive_type' => $vinData['driveType'] ?? null,
            'color'      => $colorName,
            'body_style' => $vinData['style'] ?? null,
        ];
    }
}
