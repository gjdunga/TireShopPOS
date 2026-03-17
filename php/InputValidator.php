<?php
/**
 * ============================================================================
 * InputValidator: Schema-aware input length and type validation.
 * ============================================================================
 *
 * Validates user input against database column constraints before hitting
 * the DB. Catches oversized strings, invalid types, and required fields
 * at the PHP layer with clear error messages instead of MySQL truncation
 * or cryptic SQLSTATE errors.
 *
 * Usage:
 *   InputValidator::check('customers', $data);             // throws on violation
 *   InputValidator::check('customers', $data, ['first_name', 'last_name']); // required fields
 *   $errors = InputValidator::validate('customers', $data); // returns error array
 *
 * DunganSoft Technologies, March 2026
 * ============================================================================
 */

class InputValidator
{
    /**
     * VARCHAR length constraints by table.
     * Source: sql/tire_pos_schema_full.sql + sql/migrations/*.sql
     * Only includes tables that accept user input via API routes.
     */
    private const LENGTHS = [
        'appointments' => [
            'customer_name' => 120, 'customer_phone' => 20, 'service_requested' => 255,
        ],
        'customers' => [
            'first_name' => 60, 'last_name' => 60, 'phone_primary' => 20, 'phone_secondary' => 20,
            'email' => 120, 'address_line1' => 120, 'address_line2' => 120, 'city' => 60,
            'zip' => 10, 'tax_exempt_id' => 40,
        ],
        'vehicles' => [
            'make' => 40, 'model' => 60, 'trim_level' => 40, 'vin' => 17,
            'license_plate' => 15, 'color' => 30, 'lug_pattern' => 20, 'oem_tire_size' => 30,
        ],
        'tires' => [
            'model_name' => 80, 'dot_tin_raw' => 20, 'bin_shelf' => 2,
            'dot_plant_code' => 4, 'dot_size_code' => 4, 'dot_option_code' => 4,
        ],
        'work_orders' => [
            'wo_number' => 20,
        ],
        'work_order_positions' => [
            'condition_notes' => 255,
        ],
        'users' => [
            'username' => 40, 'display_name' => 80, 'email' => 120, 'phone' => 20,
        ],
        'vendors' => [
            'vendor_name' => 120, 'contact_name' => 80, 'phone' => 20, 'email' => 120,
            'address' => 255, 'account_number' => 60, 'payment_terms' => 30,
        ],
        'purchase_orders' => [
            'po_number' => 20, 'vendor_confirmation' => 60,
        ],
        'po_line_items' => [
            'description' => 255, 'notes' => 255,
        ],
        'wheels' => [
            'brand' => 80, 'model' => 80, 'bolt_pattern' => 20, 'finish' => 60, 'bin_location' => 20,
        ],
        'wheel_fitments' => [
            'make' => 40, 'model' => 60, 'trim_level' => 40, 'notes' => 255,
        ],
        'warranty_policies' => [
            'policy_code' => 20, 'policy_name' => 120,
        ],
        'warranty_claims' => [
            'denial_reason' => 255,
        ],
        'custom_fields' => [
            'field_name' => 60, 'field_label' => 120,
        ],
        'api_keys' => [
            'label' => 120,
        ],
        'notification_log' => [
            'notification_type' => 40, 'subject' => 255,
        ],
        'marketplace_listings' => [
            'platform' => 40, 'title' => 255, 'external_id' => 120, 'external_url' => 500,
        ],
        'marketplace_orders' => [
            'platform' => 40, 'external_order_id' => 120, 'buyer_name' => 120,
            'buyer_email' => 120, 'buyer_phone' => 30,
        ],
        'directory_listings' => [
            'directory_name' => 80, 'listing_url' => 500,
        ],
        'b2b_network_inventory' => [
            'description' => 255,
        ],
        'discount_groups' => [
            'group_code' => 20, 'group_name' => 80,
        ],
        'coupons' => [
            'coupon_code' => 30, 'coupon_name' => 120,
        ],
        'tire_disposal_log' => [
            'hauler_name' => 120, 'manifest_number' => 60, 'notes' => 255,
        ],
        'tire_photos' => [
            'caption' => 255,
        ],
        'waivers' => [
            'customer_signature' => 255,
        ],
        'service_catalog' => [
            'service_code' => 20, 'service_name' => 80,
        ],
        'webhook_endpoints' => [
            'url' => 500, 'secret' => 120, 'label' => 120,
        ],
        'work_order_line_items' => [
            'description' => 255, 'warranty_terms' => 65535,
        ],
        'appointments_public' => [
            'customer_name' => 120, 'customer_phone' => 20, 'service_requested' => 255,
        ],
    ];

    /**
     * Validate input and throw on first violation.
     *
     * @param string   $table    Table name (key in LENGTHS).
     * @param array    $data     Associative array of field => value.
     * @param string[] $required Fields that must be present and non-empty.
     * @throws \InvalidArgumentException On validation failure.
     */
    public static function check(string $table, array $data, array $required = []): void
    {
        $errors = self::validate($table, $data, $required);
        if (!empty($errors)) {
            throw new \InvalidArgumentException(implode(' ', $errors));
        }
    }

    /**
     * Validate input and return array of error strings (empty = valid).
     *
     * @param string   $table    Table name (key in LENGTHS).
     * @param array    $data     Associative array of field => value.
     * @param string[] $required Fields that must be present and non-empty.
     * @return string[] Error messages.
     */
    public static function validate(string $table, array $data, array $required = []): array
    {
        $errors = [];
        $constraints = self::LENGTHS[$table] ?? [];

        // Check required fields
        foreach ($required as $field) {
            if (!array_key_exists($field, $data) || trim((string) ($data[$field] ?? '')) === '') {
                $label = self::humanize($field);
                $errors[] = "{$label} is required.";
            }
        }

        // Check string lengths
        foreach ($data as $field => $value) {
            if ($value === null || !is_string($value)) {
                continue;
            }

            $maxLen = $constraints[$field] ?? null;
            if ($maxLen === null) {
                continue; // Not a constrained VARCHAR column
            }

            $actualLen = function_exists('mb_strlen') ? mb_strlen($value, 'UTF-8') : strlen($value);
            if ($actualLen > $maxLen) {
                $label = self::humanize($field);
                $errors[] = "{$label} exceeds maximum length ({$actualLen}/{$maxLen} characters).";
            }
        }

        return $errors;
    }

    /**
     * Get the max length for a specific table.column.
     * Returns null if not tracked.
     */
    public static function maxLength(string $table, string $column): ?int
    {
        return self::LENGTHS[$table][$column] ?? null;
    }

    /**
     * Get all constraints for a table.
     */
    public static function constraints(string $table): array
    {
        return self::LENGTHS[$table] ?? [];
    }

    /**
     * Convert field_name to "Field Name" for error messages.
     */
    private static function humanize(string $field): string
    {
        return ucwords(str_replace(['_', 'id'], [' ', 'ID'], $field));
    }
}
