<?php
// ============================================================================
// TireShopPOS: Plate Provider Factory
// ============================================================================
//
// Reads plate_provider and plate_provider_api_key from shop_settings,
// instantiates the selected provider, and exposes metadata for the
// settings UI.
//
// Usage:
//   $factory = new PlateProviderFactory();
//   $provider = $factory->getProvider();        // PlateProviderInterface
//   $apiKey   = $factory->getApiKey();          // string
//   $meta     = PlateProviderFactory::catalog(); // all providers with metadata
//
// DunganSoft Technologies, March 2026
// ============================================================================

require_once __DIR__ . '/PlateProviderInterface.php';
require_once __DIR__ . '/AutoDevProvider.php';
require_once __DIR__ . '/PlateToVinProvider.php';
require_once __DIR__ . '/VehicleDatabasesProvider.php';

class PlateProviderFactory
{
    /**
     * All supported providers with display metadata for the settings UI.
     * Keyed by slug.
     */
    public static function catalog(): array
    {
        return [
            'autodev' => [
                'slug'        => 'autodev',
                'name'        => 'Auto.dev',
                'url'         => 'https://auto.dev',
                'docs_url'    => 'https://docs.auto.dev/v2/products/plate-to-vin',
                'pricing'     => '1,000 free/month, usage-based after',
                'cost_cents'  => 0,
                'auth_type'   => 'Bearer token',
                'auth_header' => 'Authorization: Bearer {key}',
                'fields'      => [
                    ['key' => 'api_key', 'label' => 'API Key', 'type' => 'password', 'required' => true],
                ],
            ],
            'platetovin' => [
                'slug'        => 'platetovin',
                'name'        => 'PlateToVIN',
                'url'         => 'https://platetovin.com',
                'docs_url'    => 'https://platetovin.com/docs/index.html',
                'pricing'     => '$0.05 per lookup',
                'cost_cents'  => 5,
                'auth_type'   => 'API key header',
                'auth_header' => 'Authorization: {key}',
                'fields'      => [
                    ['key' => 'api_key', 'label' => 'API Key', 'type' => 'password', 'required' => true],
                ],
            ],
            'vehicledatabases' => [
                'slug'        => 'vehicledatabases',
                'name'        => 'VehicleDatabases',
                'url'         => 'https://vehicledatabases.com',
                'docs_url'    => 'https://vehicledatabases.com/license-plate-api',
                'pricing'     => 'Tiered subscription plans',
                'cost_cents'  => 10,
                'auth_type'   => 'x-AuthKey header',
                'auth_header' => 'x-AuthKey: {key}',
                'fields'      => [
                    ['key' => 'api_key', 'label' => 'API Key', 'type' => 'password', 'required' => true],
                ],
            ],
        ];
    }

    /**
     * Instantiate the configured provider.
     * Falls back to AutoDevProvider if setting is missing or invalid.
     */
    public static function create(?string $slug = null): PlateProviderInterface
    {
        $slug = $slug ?: self::getConfiguredSlug();

        return match ($slug) {
            'platetovin'       => new PlateToVinProvider(),
            'vehicledatabases' => new VehicleDatabasesProvider(),
            default            => new AutoDevProvider(),
        };
    }

    /**
     * Read the configured provider slug from shop_settings.
     */
    public static function getConfiguredSlug(): string
    {
        try {
            $row = \App\Core\Database::queryOne(
                "SELECT setting_value FROM shop_settings WHERE setting_key = 'plate_provider'",
                []
            );
            return $row ? ($row['setting_value'] ?: 'autodev') : 'autodev';
        } catch (\Throwable $e) {
            return 'autodev';
        }
    }

    /**
     * Read the stored API key for the configured provider.
     */
    public static function getConfiguredApiKey(): string
    {
        try {
            $row = \App\Core\Database::queryOne(
                "SELECT setting_value FROM shop_settings WHERE setting_key = 'plate_provider_api_key'",
                []
            );
            return $row ? ($row['setting_value'] ?: '') : '';
        } catch (\Throwable $e) {
            // Fall back to env var for backward compatibility
            return getenv('PLATETOVIN_API_KEY') ?: '';
        }
    }

    /**
     * Save provider config to shop_settings.
     */
    public static function saveConfig(string $slug, string $apiKey, int $userId): void
    {
        $catalog = self::catalog();
        if (!isset($catalog[$slug])) {
            throw new \InvalidArgumentException("Unknown provider: {$slug}");
        }

        $upsert = "INSERT INTO shop_settings (setting_key, setting_value, setting_type, category, label, updated_by)
                    VALUES (?, ?, 'text', 'vehicle_lookup', ?, ?)
                    ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by)";

        \App\Core\Database::execute($upsert, ['plate_provider', $slug, 'Plate Lookup Provider', $userId]);
        \App\Core\Database::execute($upsert, ['plate_provider_api_key', $apiKey, 'Plate Provider API Key', $userId]);

        auditLog('shop_settings', null, 'UPDATE', 'plate_provider', null, $slug, $userId);
    }
}
