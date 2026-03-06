-- ============================================================================
-- Migration 003: Online Presence (Phase 3)
-- Adds 8 tables: shop_settings, website_config, warranty_policies,
-- warranty_claims, wheels, wheel_fitments, custom_fields, custom_field_values
--
-- Safe to run against existing v2.4 schema. All CREATE IF NOT EXISTS.
-- No existing columns modified.
--
-- DunganSoft Technologies, March 2026
-- ============================================================================

-- 1. Shop Settings (generic key-value config)
CREATE TABLE IF NOT EXISTS shop_settings (
    setting_id      INT AUTO_INCREMENT PRIMARY KEY,
    setting_key     VARCHAR(60) NOT NULL UNIQUE,
    setting_value   TEXT DEFAULT NULL,
    setting_type    ENUM('text','number','boolean','json','color','url') NOT NULL DEFAULT 'text',
    category        VARCHAR(40) NOT NULL DEFAULT 'general',
    label           VARCHAR(120) NOT NULL,
    description     TEXT DEFAULT NULL,
    is_public       TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Visible on public storefront',
    updated_by      INT DEFAULT NULL,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_ss_user FOREIGN KEY (updated_by) REFERENCES users(user_id),
    INDEX idx_ss_category (category),
    INDEX idx_ss_public (is_public)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed shop settings
INSERT IGNORE INTO shop_settings (setting_key, setting_value, setting_type, category, label, description, is_public) VALUES
('shop_name',           'Tire Shop',            'text',    'info',      'Shop Name',              'Business name displayed everywhere',           1),
('shop_phone',          '(719) 555-0100',       'text',    'info',      'Phone Number',           'Primary phone number',                         1),
('shop_email',          '',                      'text',    'info',      'Email Address',          'Public contact email',                         1),
('shop_address_line1',  '123 Main Street',       'text',    'info',      'Address Line 1',         NULL,                                           1),
('shop_address_line2',  '',                      'text',    'info',      'Address Line 2',         NULL,                                           1),
('shop_city',           'Canon City',            'text',    'info',      'City',                   NULL,                                           1),
('shop_state',          'CO',                    'text',    'info',      'State',                  NULL,                                           1),
('shop_zip',            '81212',                 'text',    'info',      'ZIP Code',               NULL,                                           1),
('shop_lat',            '38.4411',               'text',    'info',      'Latitude',               'For map embed',                                0),
('shop_lng',            '-105.2422',             'text',    'info',      'Longitude',              'For map embed',                                0),
('shop_hours_json',     '{"mon":"8:00-17:00","tue":"8:00-17:00","wed":"8:00-17:00","thu":"8:00-17:00","fri":"8:00-17:00","sat":"9:00-14:00","sun":"Closed"}',
                                                 'json',    'info',      'Business Hours',         'JSON object with day keys',                    1),
('shop_tagline',        'Quality Tires, Fair Prices', 'text', 'info',   'Tagline',                'Short slogan for storefront header',            1),
('logo_url',            '',                      'url',     'branding',  'Logo URL',               'Path to logo image',                           1),
('accent_color',        '#C9202F',               'color',   'branding',  'Accent Color',           'Primary brand color for storefront',            1),
('tax_rate',            '0.0790',                'number',  'finance',   'Sales Tax Rate',         'Decimal (e.g. 0.0790 = 7.90%)',                0),
('appointment_slot_min','60',                    'number',  'scheduling','Appointment Slot (min)', 'Default appointment duration in minutes',       0),
('appointment_max_slot','3',                     'number',  'scheduling','Max Per Slot',           'Maximum simultaneous appointments per time slot',0),
('website_enabled',     '0',                     'boolean', 'website',   'Enable Public Website',  'Master toggle for public storefront',           0),
('website_inventory_public','1',                 'boolean', 'website',   'Show Inventory Online',  'Display tire inventory on public site',         0),
('website_fitment_enabled', '1',                 'boolean', 'website',   'Enable Fitment Search',  'Allow fitment search on public site',           0),
('website_appointment_enabled','1',              'boolean', 'website',   'Online Appointments',    'Allow appointment booking on public site',      0),
('website_show_prices', '1',                     'boolean', 'website',   'Show Prices',            'Display prices on public inventory',            0),
('website_show_tread',  '1',                     'boolean', 'website',   'Show Tread Depth',       'Display tread depth on public inventory',       0);


-- 2. Website Config (storefront appearance and content)
CREATE TABLE IF NOT EXISTS website_config (
    config_id       INT AUTO_INCREMENT PRIMARY KEY,
    config_key      VARCHAR(60) NOT NULL UNIQUE,
    config_value    TEXT DEFAULT NULL,
    config_type     ENUM('text','boolean','json','color','html') NOT NULL DEFAULT 'text',
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO website_config (config_key, config_value, config_type) VALUES
('hero_title',           'Your Trusted Tire Shop',                       'text'),
('hero_subtitle',        'Quality new and used tires at fair prices.',   'text'),
('hero_image_url',       '',                                             'text'),
('about_html',           '<p>Locally owned tire shop in Canon City, Colorado. We offer a full range of new and used tires, mounting, balancing, and repair services.</p>', 'html'),
('footer_html',          '',                                             'html'),
('meta_title',           'Tire Shop | Canon City, CO',                  'text'),
('meta_description',     'Quality new and used tires in Canon City, Colorado. Mount, balance, repair, and alignment services.', 'text'),
('google_analytics_id',  '',                                             'text'),
('featured_tire_ids',    '[]',                                           'json'),
('announcement_html',    '',                                             'html'),
('announcement_active',  '0',                                            'boolean');


-- 3. Warranty Policies
CREATE TABLE IF NOT EXISTS warranty_policies (
    policy_id           INT AUTO_INCREMENT PRIMARY KEY,
    policy_name         VARCHAR(120) NOT NULL,
    policy_code         VARCHAR(20) NOT NULL UNIQUE,
    coverage_months     SMALLINT UNSIGNED NOT NULL DEFAULT 12,
    coverage_miles      INT UNSIGNED DEFAULT NULL,
    price               DECIMAL(8,2) NOT NULL DEFAULT 0.00,
    is_per_tire         TINYINT(1) NOT NULL DEFAULT 1,
    terms_text          TEXT NOT NULL,
    exclusions_text     TEXT DEFAULT NULL,
    max_claim_amount    DECIMAL(10,2) DEFAULT NULL,
    deductible          DECIMAL(8,2) NOT NULL DEFAULT 0.00,
    is_active           TINYINT(1) NOT NULL DEFAULT 1,
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Default road hazard policy
INSERT IGNORE INTO warranty_policies (policy_name, policy_code, coverage_months, coverage_miles, price, is_per_tire, terms_text, exclusions_text, max_claim_amount, deductible) VALUES
('Road Hazard Standard', 'RH_STD', 12, 12000, 15.00, 1,
 'This Road Hazard Warranty covers the purchased tire(s) against damage caused by road hazards including potholes, nails, glass, and debris encountered during normal driving on maintained roads. Coverage begins on the date of purchase and extends for the coverage period or mileage limit, whichever comes first. If a covered tire becomes unserviceable due to a road hazard, the shop will repair or replace the tire at no charge up to the maximum claim amount, less any applicable deductible.',
 'Exclusions: cosmetic damage, sidewall cuts from curbing, damage from off-road use, racing, overloading, improper inflation, vandalism, theft, fire, or collision. Tires with less than 2/32" remaining tread depth at time of claim. Tires that have been repaired outside this shop. Commercial use vehicles unless commercial warranty was purchased.',
 150.00, 0.00),
('Road Hazard Premium', 'RH_PREM', 24, 24000, 25.00, 1,
 'This Premium Road Hazard Warranty provides extended coverage for the purchased tire(s) against road hazard damage for the full coverage period. All terms of the Standard Road Hazard Warranty apply, with extended duration and higher claim limits. Free rotation service included for the warranty period.',
 'Same exclusions as Standard policy. Additionally, premium coverage is not available for tires over 6 years old at time of purchase.',
 250.00, 0.00);


-- 4. Warranty Claims
CREATE TABLE IF NOT EXISTS warranty_claims (
    claim_id            INT AUTO_INCREMENT PRIMARY KEY,
    invoice_id          INT NOT NULL COMMENT 'Original purchase invoice',
    line_id             INT NOT NULL COMMENT 'The warranty line item on original invoice',
    customer_id         INT NOT NULL,
    policy_id           INT NOT NULL,
    tire_id             INT DEFAULT NULL COMMENT 'The tire that failed',
    claim_date          DATE NOT NULL,
    failure_description TEXT NOT NULL,
    mileage_at_failure  INT UNSIGNED DEFAULT NULL,
    claim_amount        DECIMAL(10,2) NOT NULL,
    status              ENUM('filed','reviewing','approved','denied','paid') NOT NULL DEFAULT 'filed',
    reviewed_by         INT DEFAULT NULL,
    reviewed_at         DATETIME DEFAULT NULL,
    denial_reason       VARCHAR(255) DEFAULT NULL,
    paid_amount         DECIMAL(10,2) DEFAULT NULL,
    paid_at             DATETIME DEFAULT NULL,
    paid_by             INT DEFAULT NULL,
    notes               TEXT DEFAULT NULL,
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_wc_invoice    FOREIGN KEY (invoice_id)  REFERENCES invoices(invoice_id),
    CONSTRAINT fk_wc_line       FOREIGN KEY (line_id)     REFERENCES invoice_line_items(line_id),
    CONSTRAINT fk_wc_customer   FOREIGN KEY (customer_id) REFERENCES customers(customer_id),
    CONSTRAINT fk_wc_policy     FOREIGN KEY (policy_id)   REFERENCES warranty_policies(policy_id),
    CONSTRAINT fk_wc_tire       FOREIGN KEY (tire_id)     REFERENCES tires(tire_id),
    CONSTRAINT fk_wc_reviewer   FOREIGN KEY (reviewed_by) REFERENCES users(user_id),
    CONSTRAINT fk_wc_payer      FOREIGN KEY (paid_by)     REFERENCES users(user_id),
    INDEX idx_wc_status (status),
    INDEX idx_wc_customer (customer_id),
    INDEX idx_wc_invoice (invoice_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 5. Wheels (OEM and aftermarket inventory)
CREATE TABLE IF NOT EXISTS wheels (
    wheel_id        INT AUTO_INCREMENT PRIMARY KEY,
    brand           VARCHAR(80) DEFAULT NULL,
    model           VARCHAR(80) DEFAULT NULL,
    diameter        DECIMAL(4,1) NOT NULL COMMENT 'Inches',
    width           DECIMAL(4,1) DEFAULT NULL COMMENT 'Inches',
    bolt_pattern    VARCHAR(20) DEFAULT NULL COMMENT 'e.g. 5x114.3',
    offset_mm       SMALLINT DEFAULT NULL,
    center_bore     DECIMAL(5,2) DEFAULT NULL COMMENT 'mm',
    material        ENUM('steel','alloy','forged','carbon','unknown') NOT NULL DEFAULT 'unknown',
    finish          VARCHAR(60) DEFAULT NULL,
    `condition`     ENUM('new','used') NOT NULL DEFAULT 'used',
    retail_price    DECIMAL(8,2) DEFAULT NULL,
    cost            DECIMAL(8,2) DEFAULT NULL,
    quantity_on_hand SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    bin_location    VARCHAR(20) DEFAULT NULL,
    notes           TEXT DEFAULT NULL,
    is_active       TINYINT(1) NOT NULL DEFAULT 1,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_wh_bolt (bolt_pattern),
    INDEX idx_wh_diam (diameter),
    INDEX idx_wh_brand (brand)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 6. Wheel Fitments (maps wheels to vehicles)
CREATE TABLE IF NOT EXISTS wheel_fitments (
    fitment_id      INT AUTO_INCREMENT PRIMARY KEY,
    wheel_id        INT NOT NULL,
    make            VARCHAR(40) NOT NULL,
    model           VARCHAR(60) NOT NULL,
    year_start      SMALLINT UNSIGNED NOT NULL,
    year_end        SMALLINT UNSIGNED NOT NULL,
    trim_level      VARCHAR(40) DEFAULT NULL,
    is_oem          TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Factory wheel vs aftermarket fit',
    notes           VARCHAR(255) DEFAULT NULL,

    CONSTRAINT fk_wf_wheel FOREIGN KEY (wheel_id) REFERENCES wheels(wheel_id) ON DELETE CASCADE,
    INDEX idx_wf_vehicle (make, model, year_start, year_end)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 7. Custom Fields (user-defined)
CREATE TABLE IF NOT EXISTS custom_fields (
    field_id        INT AUTO_INCREMENT PRIMARY KEY,
    entity_type     ENUM('tire','customer','vehicle','work_order') NOT NULL,
    field_name      VARCHAR(60) NOT NULL COMMENT 'Internal key, snake_case',
    field_label     VARCHAR(120) NOT NULL COMMENT 'Display label',
    field_type      ENUM('text','number','boolean','date','select') NOT NULL DEFAULT 'text',
    select_options  JSON DEFAULT NULL COMMENT 'For select type: ["Option A","Option B"]',
    is_required     TINYINT(1) NOT NULL DEFAULT 0,
    sort_order      SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    is_active       TINYINT(1) NOT NULL DEFAULT 1,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE INDEX idx_cf_entity_name (entity_type, field_name),
    INDEX idx_cf_entity (entity_type, is_active, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 8. Custom Field Values
CREATE TABLE IF NOT EXISTS custom_field_values (
    value_id        INT AUTO_INCREMENT PRIMARY KEY,
    field_id        INT NOT NULL,
    entity_id       INT NOT NULL COMMENT 'PK of the parent entity (tire_id, customer_id, etc.)',
    field_value     TEXT DEFAULT NULL,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_cfv_field FOREIGN KEY (field_id) REFERENCES custom_fields(field_id),
    UNIQUE INDEX idx_cfv_unique (field_id, entity_id),
    INDEX idx_cfv_entity (entity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================================
-- API key table for public API / embed widget (P3f, created now for schema completeness)
-- ============================================================================
CREATE TABLE IF NOT EXISTS api_keys (
    key_id          INT AUTO_INCREMENT PRIMARY KEY,
    key_hash        VARCHAR(64) NOT NULL UNIQUE COMMENT 'SHA-256 of the API key',
    key_prefix      VARCHAR(8) NOT NULL COMMENT 'First 8 chars for identification',
    label           VARCHAR(120) NOT NULL,
    permissions     JSON DEFAULT NULL COMMENT 'Array of allowed scopes, null = all public',
    rate_limit      INT UNSIGNED NOT NULL DEFAULT 1000 COMMENT 'Requests per hour',
    is_active       TINYINT(1) NOT NULL DEFAULT 1,
    last_used_at    DATETIME DEFAULT NULL,
    request_count   BIGINT UNSIGNED NOT NULL DEFAULT 0,
    created_by      INT NOT NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_ak_user FOREIGN KEY (created_by) REFERENCES users(user_id),
    INDEX idx_ak_prefix (key_prefix),
    INDEX idx_ak_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
