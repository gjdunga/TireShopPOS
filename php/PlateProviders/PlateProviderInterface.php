<?php
// ============================================================================
// TireShopPOS: Plate Provider Interface
// ============================================================================
//
// Contract for all plate-to-VIN providers. Each provider converts a US
// license plate + state into vehicle identity data (VIN, year, make, model).
//
// Providers:
//   AutoDevProvider          auto.dev (default, 1,000 free/month)
//   PlateToVinProvider       platetovin.com ($0.05/call)
//   VehicleDatabasesProvider vehicledatabases.com (tiered plans)
//
// DunganSoft Technologies, March 2026
// ============================================================================

interface PlateProviderInterface
{
    /**
     * Provider display name (e.g., "Auto.dev", "PlateToVIN").
     */
    public function getName(): string;

    /**
     * Slug used in settings storage (e.g., "autodev", "platetovin").
     */
    public function getSlug(): string;

    /**
     * Cost per API call in cents (0 = free tier, 5 = $0.05, etc.).
     */
    public function getCostCents(): int;

    /**
     * Convert a plate + state to vehicle data.
     *
     * Returns normalized array on success:
     *   [
     *     'vin'        => string|null,
     *     'year'       => int|null,
     *     'make'       => string|null,
     *     'model'      => string|null,
     *     'trim_level' => string|null,
     *     'engine'     => string|null,
     *     'drive_type' => string|null,
     *     'color'      => string|null,
     *     'body_style' => string|null,
     *   ]
     *
     * Returns null on failure (API error, no result, missing key).
     * All providers normalize their response to this shape.
     *
     * @param string $plate     License plate number (uppercase, no spaces)
     * @param string $state     Two-letter state code (e.g., "CO")
     * @param string $apiKey    Provider API key
     * @param callable $logger  function(string $provider, string $url, int $httpStatus,
     *                            bool $success, ?string $error, ?int $ms, int $costCents)
     */
    public function lookup(string $plate, string $state, string $apiKey, callable $logger): ?array;
}
