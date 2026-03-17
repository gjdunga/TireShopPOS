<?php
/**
 * ============================================================================
 * Tire Shop POS: Vehicle Lookup Service
 * DunganSoft Technologies, March 2026
 * Schema Version: 2.4 (extends v2.3 with plate_lookup_cache, plate_lookup_log,
 *                       lkp_torque_specs)
 * Target: PHP 8.1+, MySQL 8.x / MariaDB 10.6+
 * ============================================================================
 *
 * Standalone service class for the Instant Vehicle Lookup feature.
 * Handles the four-stage lookup pipeline:
 *   1. Cache check (plate_lookup_cache, 90-day TTL)
 *   2. Plate provider API (configurable: Auto.dev, PlateToVIN, VehicleDatabases)
 *   3. NHTSA VPIC API (free, enrichment only)
 *   4. Torque spec matching (local, three-tier fallback)
 *
 * Provider selection is stored in shop_settings (plate_provider key).
 * Default provider: Auto.dev (1,000 free calls/month).
 * See php/PlateProviders/ for provider implementations.
 *
 * Public methods:
 *   lookupByPlate(plate, state, userId)  -- full pipeline
 *   lookupByVin(vin)                     -- NHTSA decode only
 *   lookupTorqueSpec(make, model, year)  -- three-tier torque match
 *   saveTorqueSpec(...)                  -- self-learning: tech-entered specs
 *   refreshCache(plate, state)           -- force cache expiry for a plate
 *   getUnverifiedSpecs(limit)            -- admin review queue
 *   verifySpec(specId, verifiedBy)       -- promote user-entered spec
 *
 * Dependencies:
 *   - tire_pos_helpers.php (getDB(), auditLog(), logActivity())
 *   - php/PlateProviders/ (provider implementations)
 *   - ext-curl (HTTP calls to providers and NHTSA)
 *   - ext-json (response parsing)
 *
 * IMPORTANT: Plate provider and API key are configured via Settings > Vehicle Lookup.
 * No .env fallback. The database (shop_settings) is the single source of truth.
 * IMPORTANT: All monetary tracking uses integer cents (cost_cents column).
 * ============================================================================
 */

require_once __DIR__ . '/tire_pos_helpers.php';

class VehicleLookupService
{
    // ========================================================================
    // Configuration
    // ========================================================================

    /** NHTSA VPIC API base URL */
    private const NHTSA_API_URL = 'https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues';

    /** Cache TTL in days */
    private const CACHE_TTL_DAYS = 90;

    /** HTTP timeout for NHTSA (seconds) */
    private const NHTSA_API_TIMEOUT = 15;

    private PDO $db;
    private PlateProviderInterface $plateProvider;
    private string $apiKey;

    public function __construct(?string $apiKey = null, ?PlateProviderInterface $provider = null)
    {
        $this->db = getDB();

        // Load provider from settings or use injected one
        require_once __DIR__ . '/PlateProviders/ProviderFactory.php';
        $this->plateProvider = $provider ?? PlateProviderFactory::create();
        $this->apiKey = $apiKey
            ?? PlateProviderFactory::getConfiguredApiKey();
    }

    // ========================================================================
    // 1. FULL PIPELINE: lookupByPlate
    // ========================================================================

    /**
     * Main entry point. Executes the four-stage lookup pipeline:
     *   Stage 1: Cache check
     *   Stage 2: PlateToVIN API
     *   Stage 3: NHTSA VPIC enrichment
     *   Stage 4: Torque spec match
     *
     * Returns associative array with keys:
     *   vehicle  -- year, make, model, trim, vin, body_style, engine, drive_type, color
     *   torque   -- spec match result (or null if no match)
     *   source   -- 'cache' or 'api'
     *   cache_id -- plate_lookup_cache.cache_id (for linking)
     *
     * Returns null on complete failure (API down + no cache).
     */
    public function lookupByPlate(string $plate, string $state, ?int $userId = null): ?array
    {
        $plate = strtoupper(trim($plate));
        $state = strtoupper(trim($state));

        if (strlen($plate) < 2 || strlen($state) !== 2) {
            return null;
        }

        // Stage 1: Cache check
        $cached = $this->getCachedLookup($plate, $state);
        if ($cached !== null) {
            logActivity($userId ?? 0, 'plate_lookup', 'vehicle', null, "Cache hit: {$plate} {$state}");

            $torque = $this->lookupTorqueSpec(
                $cached['make'] ?? '',
                $cached['model'] ?? '',
                $cached['year'] ?? 0
            );

            return [
                'vehicle'  => $cached,
                'torque'   => $torque,
                'source'   => 'cache',
                'cache_id' => $cached['cache_id'],
            ];
        }

        // Stage 2: Plate provider API (configurable via settings)
        $providerName = $this->plateProvider->getName();
        $lastError = null;
        $lastHttpStatus = 0;
        $loggerFn = function (string $provider, string $url, int $httpStatus,
                              bool $success, ?string $error, ?int $ms, int $costCents)
                    use ($plate, $state, $userId, &$lastError, &$lastHttpStatus) {
            $lastError = $error;
            $lastHttpStatus = $httpStatus;
            $this->logApiCall($plate, $state, $provider, $url,
                $httpStatus, $success, $error, $ms, $userId, $costCents);
        };

        $plateResult = $this->plateProvider->lookup($plate, $state, $this->apiKey, $loggerFn);
        if ($plateResult === null) {
            // API failed; return structured error instead of bare null
            return [
                'error' => true,
                'provider' => $providerName,
                'http_status' => $lastHttpStatus,
                'message' => $this->describeProviderError($providerName, $lastHttpStatus, $lastError),
            ];
        }

        // Stage 3: NHTSA VPIC enrichment (non-fatal if it fails)
        $nhtsaData = null;
        if (!empty($plateResult['vin'])) {
            $nhtsaData = $this->callNhtsaVpic($plateResult['vin'], $userId);
        }

        // Merge: plate provider is primary, NHTSA enriches
        $vehicle = $this->mergeVehicleData($plateResult, $nhtsaData);

        // Cache the result
        $cacheId = $this->cacheResult($plate, $state, $vehicle);

        // Stage 4: Torque spec match
        $torque = $this->lookupTorqueSpec(
            $vehicle['make'] ?? '',
            $vehicle['model'] ?? '',
            $vehicle['year'] ?? 0
        );

        logActivity($userId ?? 0, 'plate_lookup', 'vehicle', null, "API lookup: {$plate} {$state}");

        return [
            'vehicle'  => $vehicle,
            'torque'   => $torque,
            'source'   => 'api',
            'cache_id' => $cacheId,
        ];
    }

    // ========================================================================
    // 2. VIN-ONLY LOOKUP: lookupByVin
    // ========================================================================

    /**
     * Decode a VIN via NHTSA VPIC (free, no PlateToVIN call).
     * Used when the tech enters the VIN manually.
     *
     * Returns vehicle data array or null on failure.
     */
    public function lookupByVin(string $vin, ?int $userId = null): ?array
    {
        $vin = strtoupper(trim($vin));

        // Validate VIN format first
        $validation = validateVin($vin);
        if (!$validation['valid']) {
            return null;
        }

        $nhtsaData = $this->callNhtsaVpic($vin, $userId);
        if ($nhtsaData === null) {
            return null;
        }

        return [
            'vin'        => $vin,
            'year'       => $nhtsaData['year'] ?? null,
            'make'       => $nhtsaData['make'] ?? null,
            'model'      => $nhtsaData['model'] ?? null,
            'trim_level' => $nhtsaData['trim_level'] ?? null,
            'body_style' => $nhtsaData['body_style'] ?? null,
            'engine'     => $nhtsaData['engine'] ?? null,
            'drive_type' => $nhtsaData['drive_type'] ?? null,
        ];
    }

    // ========================================================================
    // 3. TORQUE SPEC MATCHING: lookupTorqueSpec
    // ========================================================================

    /**
     * Three-tier torque spec lookup:
     *   Priority 1: Exact make + model + year
     *   Priority 2: Partial model match + year (substring)
     *   Priority 3: Fallback category for make + year ("All Other...")
     *
     * Returns associative array:
     *   spec_id, torque_ft_lbs_min, torque_ft_lbs_max, lug_size_mm,
     *   lug_count, notes, source, is_verified, match_level ('exact',
     *   'partial', 'fallback'), confidence ('high', 'medium', 'low')
     *
     * Returns null if no match at any tier.
     */
    public function lookupTorqueSpec(string $make, string $model, int $year): ?array
    {
        $make = $this->normalizeMake($make);
        $model = trim($model);

        if (empty($make) || $year < 1900) {
            return null;
        }

        // Tier 1: Exact match (make + model + year in range)
        $sql = "SELECT * FROM lkp_torque_specs
                WHERE make = ? AND model = ?
                  AND year_start <= ? AND year_end >= ?
                  AND model NOT LIKE 'All Other%' AND model NOT LIKE 'All %'
                ORDER BY is_verified DESC, year_start DESC
                LIMIT 1";
        $stmt = $this->db->prepare($sql);
        $stmt->execute([$make, $model, $year, $year]);
        $row = $stmt->fetch();

        if ($row) {
            return $this->formatTorqueResult($row, 'exact', 'high');
        }

        // Tier 2: Partial model match (model name is a substring match)
        // Example: "Civic" matches "Civic Type R"
        $sql = "SELECT * FROM lkp_torque_specs
                WHERE make = ?
                  AND (model LIKE CONCAT('%', ?, '%') OR ? LIKE CONCAT('%', model, '%'))
                  AND year_start <= ? AND year_end >= ?
                  AND model NOT LIKE 'All Other%' AND model NOT LIKE 'All %'
                ORDER BY is_verified DESC, CHAR_LENGTH(model) DESC
                LIMIT 1";
        $stmt = $this->db->prepare($sql);
        $stmt->execute([$make, $model, $model, $year, $year]);
        $row = $stmt->fetch();

        if ($row) {
            return $this->formatTorqueResult($row, 'partial', 'medium');
        }

        // Tier 3: Fallback category ("All Other Car Models", "All Other Light Truck...", etc.)
        $sql = "SELECT * FROM lkp_torque_specs
                WHERE make = ?
                  AND (model LIKE 'All Other%' OR model LIKE 'All %')
                  AND year_start <= ? AND year_end >= ?
                ORDER BY year_start DESC
                LIMIT 1";
        $stmt = $this->db->prepare($sql);
        $stmt->execute([$make, $year, $year]);
        $row = $stmt->fetch();

        if ($row) {
            return $this->formatTorqueResult($row, 'fallback', 'low');
        }

        return null;
    }

    // ========================================================================
    // 4. SELF-LEARNING: saveTorqueSpec
    // ========================================================================

    /**
     * Save a tech-entered torque spec for a vehicle not in the database.
     * Stored with is_verified = 0 and source = 'User-entered'.
     * Admin can later promote via verifySpec().
     *
     * Deduplicates: if an exact make+model+year_start+year_end row already
     * exists, updates the existing row instead of inserting a duplicate.
     */
    public function saveTorqueSpec(
        string $make,
        string $model,
        int $yearStart,
        int $yearEnd,
        int $torqueMin,
        int $torqueMax,
        ?string $lugSize,
        ?int $lugCount,
        ?string $notes,
        int $enteredBy
    ): int {
        $make = $this->normalizeMake($make);
        $model = trim($model);

        if ($torqueMax < $torqueMin) {
            $torqueMax = $torqueMin;
        }
        if ($yearEnd < $yearStart) {
            $yearEnd = $yearStart;
        }

        // Check for existing row
        $sql = "SELECT spec_id FROM lkp_torque_specs
                WHERE make = ? AND model = ? AND year_start = ? AND year_end = ?
                LIMIT 1";
        $stmt = $this->db->prepare($sql);
        $stmt->execute([$make, $model, $yearStart, $yearEnd]);
        $existing = $stmt->fetchColumn();

        if ($existing) {
            $sql = "UPDATE lkp_torque_specs SET
                        torque_ft_lbs_min = ?, torque_ft_lbs_max = ?,
                        lug_size_mm = ?, lug_count = ?, notes = ?,
                        entered_by = ?, is_verified = 0,
                        source = 'User-entered'
                    WHERE spec_id = ?";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([
                $torqueMin, $torqueMax, $lugSize, $lugCount, $notes,
                $enteredBy, $existing
            ]);

            auditLog('lkp_torque_specs', (int) $existing, 'UPDATE', 'torque_ft_lbs_min',
                null, (string) $torqueMin, $enteredBy);

            return (int) $existing;
        }

        $sql = "INSERT INTO lkp_torque_specs
                    (make, model, year_start, year_end, torque_ft_lbs_min, torque_ft_lbs_max,
                     lug_size_mm, lug_count, notes, source, is_verified, entered_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'User-entered', 0, ?)";
        $stmt = $this->db->prepare($sql);
        $stmt->execute([
            $make, $model, $yearStart, $yearEnd,
            $torqueMin, $torqueMax, $lugSize, $lugCount, $notes,
            $enteredBy
        ]);

        $specId = (int) $this->db->lastInsertId();

        auditLog('lkp_torque_specs', $specId, 'INSERT', null, null, null, $enteredBy);

        return $specId;
    }

    // ========================================================================
    // 5. ADMIN: Spec verification and review
    // ========================================================================

    /**
     * Get unverified (user-entered) torque specs for admin review.
     */
    public function getUnverifiedSpecs(int $limit = 50): array
    {
        $sql = "SELECT ts.*, u.display_name AS entered_by_name
                FROM lkp_torque_specs ts
                LEFT JOIN users u ON ts.entered_by = u.user_id
                WHERE ts.is_verified = 0
                ORDER BY ts.created_at DESC
                LIMIT ?";
        $stmt = $this->db->prepare($sql);
        $stmt->execute([$limit]);
        return $stmt->fetchAll();
    }

    /**
     * Promote a user-entered spec to verified status.
     */
    public function verifySpec(int $specId, int $verifiedBy): bool
    {
        $sql = "UPDATE lkp_torque_specs
                SET is_verified = 1, verified_by = ?, verified_at = NOW()
                WHERE spec_id = ? AND is_verified = 0";
        $stmt = $this->db->prepare($sql);
        $stmt->execute([$verifiedBy, $specId]);

        if ($stmt->rowCount() > 0) {
            auditLog('lkp_torque_specs', $specId, 'UPDATE', 'is_verified', '0', '1', $verifiedBy);
            return true;
        }
        return false;
    }

    // ========================================================================
    // 6. CACHE MANAGEMENT
    // ========================================================================

    /**
     * Force-expire a cached plate lookup (manual refresh button).
     * Sets expires_at to now, so the next lookup triggers a fresh API call.
     */
    public function refreshCache(string $plate, string $state): bool
    {
        $plate = strtoupper(trim($plate));
        $state = strtoupper(trim($state));

        $sql = "UPDATE plate_lookup_cache
                SET expires_at = NOW()
                WHERE plate_number = ? AND plate_state = ?";
        $stmt = $this->db->prepare($sql);
        $stmt->execute([$plate, $state]);
        return $stmt->rowCount() > 0;
    }

    /**
     * Purge expired cache entries. Run from cron (daily recommended).
     * Returns number of rows deleted.
     */
    public function purgeExpiredCache(): int
    {
        $sql = "DELETE FROM plate_lookup_cache WHERE expires_at < NOW()";
        return $this->db->exec($sql);
    }

    /**
     * Get cache statistics for the admin dashboard.
     */
    public function getCacheStats(): array
    {
        $sql = "SELECT
                    COUNT(*) AS total_entries,
                    SUM(CASE WHEN expires_at > NOW() THEN 1 ELSE 0 END) AS active_entries,
                    SUM(CASE WHEN expires_at <= NOW() THEN 1 ELSE 0 END) AS expired_entries,
                    MIN(cached_at) AS oldest_entry,
                    MAX(cached_at) AS newest_entry
                FROM plate_lookup_cache";
        return $this->db->query($sql)->fetch();
    }

    // ========================================================================
    // 7. COST REPORTING
    // ========================================================================

    /**
     * Monthly API cost summary (wraps v_plate_lookup_monthly_cost view).
     */
    public function getMonthlyCostReport(?int $year = null, ?int $month = null): array
    {
        if ($year && $month) {
            $monthStr = sprintf('%04d-%02d', $year, $month);
            $sql = "SELECT * FROM v_plate_lookup_monthly_cost WHERE month = ?";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$monthStr]);
            return $stmt->fetchAll();
        }

        return $this->db->query(
            "SELECT * FROM v_plate_lookup_monthly_cost ORDER BY month DESC"
        )->fetchAll();
    }

    /**
     * Dashboard card data: current month totals + cache hit rate.
     */
    public function getDashboardStats(): array
    {
        $monthStr = date('Y-m');

        // API cost this month
        $sql = "SELECT
                    COALESCE(SUM(cost_cents), 0) / 100.0 AS cost_usd,
                    COUNT(*) AS api_calls,
                    COALESCE(AVG(response_ms), 0) AS avg_response_ms,
                    SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS successful,
                    SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS failed
                FROM plate_lookup_log
                WHERE DATE_FORMAT(created_at, '%Y-%m') = ?";
        $stmt = $this->db->prepare($sql);
        $stmt->execute([$monthStr]);
        $apiStats = $stmt->fetch();

        // Cache stats
        $cacheStats = $this->getCacheStats();

        return [
            'month'             => $monthStr,
            'total_cost_usd'    => $apiStats['cost_usd'],
            'total_api_calls'   => (int) $apiStats['api_calls'],
            'avg_response_ms'   => round((float) $apiStats['avg_response_ms']),
            'successful_calls'  => (int) $apiStats['successful'],
            'failed_calls'      => (int) $apiStats['failed'],
            'cache_active'      => (int) ($cacheStats['active_entries'] ?? 0),
            'cache_expired'     => (int) ($cacheStats['expired_entries'] ?? 0),
        ];
    }

    // ========================================================================
    // PRIVATE: API Calls
    // ========================================================================

    // Plate provider call is now delegated to PlateProviderInterface::lookup()
    // via $this->plateProvider in lookupByPlate(). See php/PlateProviders/.

    /**
     * Call NHTSA VPIC API to decode a VIN. Free, no auth required.
     * Non-fatal: returns null on failure (system continues with plate provider data).
     */
    private function callNhtsaVpic(string $vin, ?int $userId): ?array
    {
        $url = self::NHTSA_API_URL . '/' . urlencode($vin) . '?format=json';

        $startMs = hrtime(true);

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => self::NHTSA_API_TIMEOUT,
            CURLOPT_HTTPHEADER     => ['Accept: application/json'],
        ]);

        $response = curl_exec($ch);
        $httpStatus = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        $elapsedMs = (int) ((hrtime(true) - $startMs) / 1_000_000);

        if ($response === false || $httpStatus !== 200) {
            // NHTSA failure is non-fatal; log with cost = 0
            $this->logApiCall('', '', 'NHTSA', $url,
                $httpStatus, false, "VIN decode failed: {$vin}", $elapsedMs, $userId, 0);
            return null;
        }

        $data = json_decode($response, true);
        $results = $data['Results'][0] ?? null;
        if (!$results) {
            return null;
        }

        $this->logApiCall('', '', 'NHTSA', $url,
            $httpStatus, true, null, $elapsedMs, $userId, 0);

        return [
            'year'       => !empty($results['ModelYear']) ? (int) $results['ModelYear'] : null,
            'make'       => $results['Make'] ?? null,
            'model'      => $results['Model'] ?? null,
            'trim_level' => $results['Trim'] ?? null,
            'body_style' => $results['BodyClass'] ?? null,
            'engine'     => $this->buildEngineString($results),
            'drive_type' => $results['DriveType'] ?? null,
            'gvwr'       => $results['GVWR'] ?? null,
            'fuel_type'  => $results['FuelTypePrimary'] ?? null,
        ];
    }

    // ========================================================================
    // PRIVATE: Data Processing
    // ========================================================================

    /**
     * Merge plate provider and NHTSA data. Plate provider is authoritative for
     * identity fields (VIN, year, make, model, color). NHTSA enriches
     * with engine details, body style, drive type, and GVWR.
     */
    private function mergeVehicleData(array $plate, ?array $nhtsa): array
    {
        $merged = $plate;

        if ($nhtsa !== null) {
            // NHTSA enriches; does not override plate provider identity fields
            $merged['body_style'] = $nhtsa['body_style'] ?? $plate['body_style'] ?? null;
            $merged['engine']     = $nhtsa['engine'] ?? $plate['engine'] ?? null;
            $merged['drive_type'] = $nhtsa['drive_type'] ?? $plate['drive_type'] ?? null;
            $merged['gvwr']       = $nhtsa['gvwr'] ?? null;
            $merged['fuel_type']  = $nhtsa['fuel_type'] ?? null;

            // Use NHTSA trim if plate provider did not provide one
            if (empty($merged['trim_level']) && !empty($nhtsa['trim_level'])) {
                $merged['trim_level'] = $nhtsa['trim_level'];
            }
        }

        return $merged;
    }

    /**
     * Build engine description string from NHTSA fields.
     * Example output: "2.0L I4 DOHC 16V"
     */
    private function buildEngineString(array $nhtsa): ?string
    {
        $parts = [];

        if (!empty($nhtsa['DisplacementL'])) {
            $parts[] = round((float) $nhtsa['DisplacementL'], 1) . 'L';
        }
        if (!empty($nhtsa['EngineCylinders'])) {
            $config = $nhtsa['EngineConfiguration'] ?? '';
            $prefix = match (strtolower($config)) {
                'v-shaped'   => 'V',
                'in-line'    => 'I',
                'flat'       => 'H',
                'rotary'     => 'R',
                default      => '',
            };
            $parts[] = $prefix . $nhtsa['EngineCylinders'];
        }
        if (!empty($nhtsa['ValveTrainDesign'])) {
            $parts[] = strtoupper($nhtsa['ValveTrainDesign']);
        }
        if (!empty($nhtsa['EngineHP'])) {
            $parts[] = $nhtsa['EngineHP'] . 'hp';
        }

        return $parts ? implode(' ', $parts) : null;
    }

    /**
     * Normalize make name to match lkp_torque_specs entries.
     * Handles common variations: "MERCEDES-BENZ" vs "Mercedes-Benz",
     * "CHEVROLET" vs "Chevrolet", "BMW" stays "BMW", etc.
     */
    private function normalizeMake(string $make): string
    {
        $make = trim($make);
        if (empty($make)) return '';

        // Known exact mappings (API returns vary)
        $map = [
            'MERCEDES BENZ' => 'Mercedes-Benz',
            'MERCEDES-BENZ' => 'Mercedes-Benz',
            'LAND ROVER'    => 'Land Rover',
            'ALFA ROMEO'    => 'Alfa Romeo',
            'VOLKSWAGEN'    => 'Volkswagen',
        ];

        $upper = strtoupper($make);
        if (isset($map[$upper])) {
            return $map[$upper];
        }

        // Three-letter or shorter all-caps brands stay uppercase (BMW, GMC, RAM, KIA)
        if (strlen($make) <= 3) {
            // Check if it matches a known make; otherwise title-case
            $knownShort = ['BMW', 'GMC', 'Ram', 'Kia'];
            foreach ($knownShort as $known) {
                if (strcasecmp($make, $known) === 0) return $known;
            }
        }

        // Default: title case
        return ucwords(strtolower($make));
    }

    /**
     * Format a torque spec row into the standard return structure.
     */
    private function formatTorqueResult(array $row, string $matchLevel, string $confidence): array
    {
        return [
            'spec_id'           => (int) $row['spec_id'],
            'make'              => $row['make'],
            'model'             => $row['model'],
            'year_start'        => (int) $row['year_start'],
            'year_end'          => (int) $row['year_end'],
            'torque_ft_lbs_min' => (int) $row['torque_ft_lbs_min'],
            'torque_ft_lbs_max' => (int) $row['torque_ft_lbs_max'],
            'lug_size_mm'       => $row['lug_size_mm'],
            'lug_count'         => $row['lug_count'] ? (int) $row['lug_count'] : null,
            'notes'             => $row['notes'],
            'source'            => $row['source'],
            'is_verified'       => (bool) $row['is_verified'],
            'match_level'       => $matchLevel,
            'confidence'        => $confidence,
        ];
    }

    // ========================================================================
    // PRIVATE: Cache Operations
    // ========================================================================

    /**
     * Check cache for an unexpired plate lookup.
     * Returns cached vehicle data or null.
     */
    private function getCachedLookup(string $plate, string $state): ?array
    {
        $sql = "SELECT * FROM plate_lookup_cache
                WHERE plate_number = ? AND plate_state = ?
                  AND expires_at > NOW()
                LIMIT 1";
        $stmt = $this->db->prepare($sql);
        $stmt->execute([$plate, $state]);
        $row = $stmt->fetch();

        if (!$row) return null;

        return [
            'cache_id'   => (int) $row['cache_id'],
            'vin'        => $row['vin'],
            'year'       => $row['year'] ? (int) $row['year'] : null,
            'make'       => $row['make'],
            'model'      => $row['model'],
            'trim_level' => $row['trim_level'],
            'body_style' => $row['body_style'],
            'engine'     => $row['engine'],
            'drive_type' => $row['drive_type'],
            'color'      => $row['color'],
        ];
    }

    /**
     * Store a lookup result in the cache. Uses INSERT ... ON DUPLICATE KEY UPDATE
     * to handle re-lookups for the same plate (e.g., after manual refresh).
     */
    private function cacheResult(string $plate, string $state, array $vehicle): int
    {
        $expiresAt = (new DateTime())->modify('+' . self::CACHE_TTL_DAYS . ' days')
                                      ->format('Y-m-d H:i:s');

        $providerName = $this->plateProvider->getName();

        $sql = "INSERT INTO plate_lookup_cache
                    (plate_number, plate_state, vin, year, make, model, trim_level,
                     body_style, engine, drive_type, color, api_provider,
                     api_response, cached_at, expires_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)
                ON DUPLICATE KEY UPDATE
                    vin = VALUES(vin), year = VALUES(year), make = VALUES(make),
                    model = VALUES(model), trim_level = VALUES(trim_level),
                    body_style = VALUES(body_style), engine = VALUES(engine),
                    drive_type = VALUES(drive_type), color = VALUES(color),
                    api_response = VALUES(api_response),
                    cached_at = NOW(), expires_at = VALUES(expires_at)";

        $stmt = $this->db->prepare($sql);
        $stmt->execute([
            $plate, $state,
            $vehicle['vin'] ?? null,
            $vehicle['year'] ?? null,
            $vehicle['make'] ?? null,
            $vehicle['model'] ?? null,
            $vehicle['trim_level'] ?? null,
            $vehicle['body_style'] ?? null,
            $vehicle['engine'] ?? null,
            $vehicle['drive_type'] ?? null,
            $vehicle['color'] ?? null,
            $providerName,
            json_encode($vehicle),
            $expiresAt,
        ]);

        return (int) $this->db->lastInsertId();
    }

    // ========================================================================
    // PRIVATE: API Logging
    // ========================================================================

    /**
     * Translate a provider HTTP error into a human-readable message.
     */
    private function describeProviderError(string $provider, int $httpStatus, ?string $rawError): string
    {
        return match (true) {
            $httpStatus === 0     => "{$provider}: could not connect. Check server internet access.",
            $httpStatus === 401   => "{$provider}: API key is invalid or expired. Update it in Settings > Vehicle Lookup.",
            $httpStatus === 402   => "{$provider}: payment required. The plate lookup feature requires a paid plan. Check your {$provider} account.",
            $httpStatus === 403   => "{$provider}: access forbidden. Your API key may not have plate lookup permissions.",
            $httpStatus === 404   => "{$provider}: plate not found in their database.",
            $httpStatus === 429   => "{$provider}: rate limit exceeded. Wait a moment and try again.",
            $httpStatus >= 500    => "{$provider}: server error (HTTP {$httpStatus}). The service may be down.",
            default               => "{$provider}: lookup failed (HTTP {$httpStatus}). " . ($rawError ?: ''),
        };
    }

    /**
     * Log every API call to plate_lookup_log for cost tracking and auditing.
     */
    private function logApiCall(
        string $plate,
        string $state,
        string $provider,
        string $endpoint,
        int $httpStatus,
        bool $success,
        ?string $errorMessage,
        ?int $responseMs,
        ?int $userId,
        ?int $costCents = null
    ): void {
        // Default cost: providers pass their own, NHTSA = 0
        if ($costCents === null) {
            $costCents = 0;
        }

        $sql = "INSERT INTO plate_lookup_log
                    (plate_number, plate_state, api_provider, api_endpoint,
                     http_status, success, cost_cents, response_ms,
                     error_message, user_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
        $stmt = $this->db->prepare($sql);
        $stmt->execute([
            $plate, $state, $provider, $endpoint,
            $httpStatus ?: null, $success ? 1 : 0, $costCents, $responseMs,
            $errorMessage, $userId,
        ]);
    }
}
