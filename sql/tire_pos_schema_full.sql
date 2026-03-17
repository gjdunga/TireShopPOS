-- ============================================================================
-- Tire Shop POS System: Consolidated Database Schema v1.0.1
-- Target: MySQL 8.0+ / MariaDB 10.6+
-- Charset: utf8mb4 throughout
-- Generated for DunganSoft Technologies
-- Date: March 2026
-- ============================================================================
-- Base table count: 44 tables + 14 views (pre-migration).
-- After all migrations: 66 tables, 9 views.
--
-- Migration 009 drops 7 legacy tables (invoices, payments, cash drawers, etc.)
-- and replaces them with the work order financial model (deposit, line items,
-- tax calculation). This base schema still contains the legacy DDL for
-- backward compatibility; migration 009 cleans it up.
-- ============================================================================

SET NAMES utf8mb4;
SET CHARACTER_SET_CLIENT = utf8mb4;

-- ============================================================================
-- DOMAIN 1: INVENTORY LOOKUP TABLES (12 tables)
-- ============================================================================

-- -- Lookup: Brands --------------------------------------------------------

CREATE TABLE IF NOT EXISTS lkp_brands (
    brand_id    INT AUTO_INCREMENT PRIMARY KEY,
    brand_name  VARCHAR(80) NOT NULL UNIQUE,
    is_active   TINYINT(1) NOT NULL DEFAULT 1,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO lkp_brands (brand_name) VALUES
('Achilles'),('Advanta'),('Americus'),('Arroyo'),('Atturo'),
('BFGoodrich'),('Bridgestone'),('Continental'),('Cooper'),('Crosswind'),
('Dunlop'),('Falken'),('Federal'),('Firestone'),('Fuzion'),
('General'),('Gladiator'),('Goodyear'),('GT Radial'),('Hankook'),
('Ironman'),('Kelly'),('Kenda'),('Kumho'),('Laufenn'),
('Lexani'),('Lionhart'),('Mastercraft'),('Maxxis'),('Milestar'),
('Mickey Thompson'),('Michelin'),('Motomaster'),('Nexen'),('Nitto'),
('Nokian'),('Ohtsu'),('Patriot'),('Pirelli'),('Primewell'),
('Sailun'),('Sentury'),('Sumitomo'),('Thunderer'),('Toyo'),
('Travelstar'),('Uniroyal'),('Vredestein'),('Westlake'),('Yokohama'),
('Zeetex'),('Other'),('Unknown');

-- -- Lookup: Tire Types ----------------------------------------------------

CREATE TABLE IF NOT EXISTS lkp_tire_types (
    type_id     INT AUTO_INCREMENT PRIMARY KEY,
    type_code   CHAR(2) NOT NULL UNIQUE,
    type_label  VARCHAR(40) NOT NULL,
    is_active   TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO lkp_tire_types (type_code, type_label) VALUES
('ST', 'Special Trailer'),
('LT', 'Light Truck'),
('PP', 'Passenger'),
('AT', 'All Terrain'),
('MT', 'Mud Terrain'),
('HT', 'Highway Terrain'),
('MO', 'Motorcycle'),
('TT', 'Temporary / Spare'),
('XX', 'Other');

-- -- Lookup: Construction Types --------------------------------------------

CREATE TABLE IF NOT EXISTS lkp_construction_types (
    construction_id INT AUTO_INCREMENT PRIMARY KEY,
    code            CHAR(1) NOT NULL UNIQUE,
    label           VARCHAR(30) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO lkp_construction_types (code, label) VALUES
('R', 'Radial'),
('B', 'Belted Bias'),
('D', 'Diagonal Bias');

-- -- Lookup: Speed Ratings -------------------------------------------------
-- NOTE: H falls between U and V in official ordering (not alphabetical)
-- ZR is an umbrella covering W and Y; stored here for reference

CREATE TABLE IF NOT EXISTS lkp_speed_ratings (
    speed_id    INT AUTO_INCREMENT PRIMARY KEY,
    rating_code VARCHAR(4) NOT NULL UNIQUE,
    max_mph     INT NOT NULL,
    max_kmh     INT NOT NULL,
    description VARCHAR(60) DEFAULT NULL,
    is_active   TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO lkp_speed_ratings (rating_code, max_mph, max_kmh, description) VALUES
('B',   31,  50,  NULL),
('C',   35,  60,  NULL),
('D',   40,  65,  NULL),
('E',   43,  70,  NULL),
('F',   50,  80,  NULL),
('G',   56,  90,  NULL),
('J',   62,  100, NULL),
('K',   68,  110, NULL),
('L',   75,  120, 'Light truck / SUV'),
('M',   81,  130, 'Temporary spare'),
('N',   87,  140, NULL),
('P',   93,  150, NULL),
('Q',   99,  160, 'Winter tires'),
('R',   106, 170, 'Heavy duty LT'),
('S',   112, 180, 'Family sedans'),
('T',   118, 190, 'Family sedans, minivans'),
('U',   124, 200, NULL),
('H',   130, 210, 'Sport sedans (historical placement)'),
('V',   149, 240, 'Sports cars'),
('ZR',  149, 240, 'Performance umbrella (covers W and Y)'),
('W',   168, 270, 'Exotic sports cars'),
('Y',   186, 300, 'Exotic sports cars'),
('(Y)', 186, 300, 'Above 186 mph');

-- -- Lookup: Load Indices --------------------------------------------------
-- Consumer and light truck range (70 through 150)

CREATE TABLE IF NOT EXISTS lkp_load_indices (
    load_id      INT AUTO_INCREMENT PRIMARY KEY,
    load_index   INT NOT NULL UNIQUE,
    max_load_lbs INT NOT NULL,
    max_load_kg  INT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO lkp_load_indices (load_index, max_load_lbs, max_load_kg) VALUES
(70,740,335),(71,760,345),(72,785,355),(73,805,365),(74,825,375),
(75,855,387),(76,880,400),(77,910,412),(78,935,425),(79,965,437),
(80,990,450),(81,1020,462),(82,1050,475),(83,1070,487),(84,1100,500),
(85,1140,515),(86,1170,530),(87,1200,545),(88,1230,560),(89,1280,580),
(90,1320,600),(91,1360,615),(92,1390,630),(93,1430,650),(94,1480,670),
(95,1520,690),(96,1570,710),(97,1610,730),(98,1650,750),(99,1710,775),
(100,1760,800),(101,1820,825),(102,1870,850),(103,1930,875),(104,1980,900),
(105,2040,925),(106,2090,950),(107,2150,975),(108,2200,1000),(109,2270,1030),
(110,2340,1060),(111,2400,1090),(112,2470,1120),(113,2540,1150),(114,2600,1180),
(115,2680,1215),(116,2760,1250),(117,2830,1285),(118,2910,1320),(119,3000,1360),
(120,3080,1400),(121,3200,1450),(122,3300,1500),(123,3420,1550),(124,3520,1600),
(125,3640,1650),(126,3740,1700),(127,3860,1750),(128,3960,1800),(129,4080,1850),
(130,4180,1900),(131,4300,1950),(132,4400,2000),(133,4540,2060),(134,4680,2120),
(135,4800,2180),(136,4940,2240),(137,5080,2300),(138,5200,2360),(139,5360,2430),
(140,5520,2500),(141,5680,2575),(142,5840,2650),(143,6000,2725),(144,6150,2800),
(145,6400,2900),(146,6600,3000),(147,6800,3075),(148,6950,3150),(149,7150,3250),
(150,7400,3350);

-- -- Lookup: UTQG Traction Grades ------------------------------------------

CREATE TABLE IF NOT EXISTS lkp_traction_grades (
    traction_id INT AUTO_INCREMENT PRIMARY KEY,
    grade_code  VARCHAR(2) NOT NULL UNIQUE,
    description VARCHAR(60) DEFAULT NULL,
    is_active   TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO lkp_traction_grades (grade_code, description) VALUES
('AA', 'Best wet braking'),
('A',  'Good wet braking'),
('B',  'Acceptable wet braking'),
('C',  'Marginal wet braking');

-- -- Lookup: UTQG Temperature Grades ---------------------------------------

CREATE TABLE IF NOT EXISTS lkp_temperature_grades (
    temperature_id INT AUTO_INCREMENT PRIMARY KEY,
    grade_code     CHAR(1) NOT NULL UNIQUE,
    description    VARCHAR(60) DEFAULT NULL,
    is_active      TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO lkp_temperature_grades (grade_code, description) VALUES
('A', 'Best heat dissipation'),
('B', 'Good heat dissipation'),
('C', 'Acceptable heat dissipation');

-- -- Lookup: Weather Symbols -----------------------------------------------

CREATE TABLE IF NOT EXISTS lkp_weather_symbols (
    weather_id  INT AUTO_INCREMENT PRIMARY KEY,
    symbol_code VARCHAR(10) NOT NULL UNIQUE,
    label       VARCHAR(60) NOT NULL,
    is_active   TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO lkp_weather_symbols (symbol_code, label) VALUES
('M+S',   'Mud and Snow'),
('3PMSF', 'Three Peak Mountain Snowflake (severe snow)'),
('NONE',  'No weather certification');

-- -- Lookup: Cosmetic Codes ------------------------------------------------

CREATE TABLE IF NOT EXISTS lkp_cosmetic_codes (
    cosmetic_id INT AUTO_INCREMENT PRIMARY KEY,
    code        VARCHAR(4) NOT NULL UNIQUE,
    label       VARCHAR(40) NOT NULL,
    is_active   TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO lkp_cosmetic_codes (code, label) VALUES
('OWL',  'Outlined White Letters'),
('RWL',  'Raised White Letters'),
('BSW',  'Black Sidewall'),
('BLK',  'Blackwall'),
('NONE', 'No cosmetic marking');

-- -- Lookup: Load / Construction Type --------------------------------------

CREATE TABLE IF NOT EXISTS lkp_load_construction (
    load_constr_id INT AUTO_INCREMENT PRIMARY KEY,
    code           VARCHAR(6) NOT NULL UNIQUE,
    label          VARCHAR(30) NOT NULL,
    is_active      TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO lkp_load_construction (code, label) VALUES
('XL',     'Extra Load'),
('REIN',   'Reinforced'),
('NORMAL', 'Normal Construction');

-- -- Lookup: Acquisition Sources -------------------------------------------

CREATE TABLE IF NOT EXISTS lkp_acquisition_sources (
    source_id    INT AUTO_INCREMENT PRIMARY KEY,
    source_name  VARCHAR(120) NOT NULL,
    source_notes TEXT DEFAULT NULL,
    is_active    TINYINT(1) NOT NULL DEFAULT 1,
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- DOMAIN 2: ACCESS CONTROL (5 tables)
-- ============================================================================

CREATE TABLE IF NOT EXISTS roles (
    role_id     INT AUTO_INCREMENT PRIMARY KEY,
    role_name   VARCHAR(30) NOT NULL UNIQUE,
    description VARCHAR(120) DEFAULT NULL,
    is_active   TINYINT(1) NOT NULL DEFAULT 1,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO roles (role_name, description) VALUES
('tire_tech', 'Tire technician: inventory search, work orders, basic POS'),
('manager',   'Shop manager: full POS, inventory management, reporting'),
('owner',     'Shop owner: unrestricted access, configuration, user management');

CREATE TABLE IF NOT EXISTS users (
    user_id             INT AUTO_INCREMENT PRIMARY KEY,
    username            VARCHAR(40) NOT NULL UNIQUE,
    password_hash       VARCHAR(255) NOT NULL,
    display_name        VARCHAR(80) NOT NULL,
    email               VARCHAR(120) DEFAULT NULL,
    phone               VARCHAR(20) DEFAULT NULL,
    role_id             INT NOT NULL,
    is_active           TINYINT(1) NOT NULL DEFAULT 1,
    force_password_change TINYINT(1) NOT NULL DEFAULT 0,
    password_changed_at DATETIME DEFAULT NULL,
    failed_login_count  TINYINT UNSIGNED NOT NULL DEFAULT 0,
    locked_until        DATETIME DEFAULT NULL,
    last_login_at       DATETIME DEFAULT NULL,
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                            ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_user_role FOREIGN KEY (role_id) REFERENCES roles(role_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS password_history (
    history_id    INT AUTO_INCREMENT PRIMARY KEY,
    user_id       INT NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_pwdhist_user FOREIGN KEY (user_id) REFERENCES users(user_id),
    INDEX idx_pwdhist_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Default admin user: username 'admin', password 'admin'
-- force_password_change = 1: must set a real password on first login
-- role_id = 3 (owner): full access
-- password_changed_at is NULL so isPasswordExpired() also returns true
INSERT INTO users (username, password_hash, display_name, role_id, is_active, force_password_change)
VALUES (
    'admin',
    '$2y$12$Gvm5xtbc8X5LpIx.phZUUOUJTmWHqJ1UaprV7nA2oSqFNFmG4Lk.K',
    'Administrator',
    3,
    1,
    1
);

CREATE TABLE IF NOT EXISTS permissions (
    permission_id   INT AUTO_INCREMENT PRIMARY KEY,
    permission_key  VARCHAR(60) NOT NULL UNIQUE,
    description     VARCHAR(120) DEFAULT NULL,
    min_role        VARCHAR(30) DEFAULT NULL COMMENT 'Minimum role name for quick reference'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- v2.0 permissions
INSERT INTO permissions (permission_key, description, min_role) VALUES
('INVENTORY_VIEW',      'Search and view tire inventory',           'tire_tech'),
('INVENTORY_ADD',       'Add new tires to inventory',               'manager'),
('INVENTORY_EDIT',      'Edit tire details and pricing',            'manager'),
('INVENTORY_WRITE_OFF', 'Write off damaged or unsellable tires',    'manager'),
('CUSTOMER_MANAGE',     'Create and edit customer records',         'tire_tech'),
('REPORT_VIEW',         'View reports and dashboards',              'manager'),
('USER_MANAGE',         'Create/edit/deactivate user accounts',     'owner'),
('CONFIG_MANAGE',       'Edit system configuration',                'owner'),
('AUDIT_VIEW',          'View audit logs',                          'owner');

-- v2.3 permissions
INSERT INTO permissions (permission_key, description, min_role) VALUES
('WORK_ORDER_CREATE',   'Create work orders and intake forms',      'tire_tech'),
('WORK_ORDER_ASSIGN',   'Assign technicians to work orders',        'manager'),
('VEHICLE_MANAGE',      'Create and edit vehicle records',          'tire_tech'),
('PO_CREATE',           'Create purchase orders to vendors',        'manager'),
('PO_RECEIVE',          'Receive inventory against purchase orders', 'tire_tech'),
('WAIVER_CREATE',       'Create and manage customer waivers',       'tire_tech'),
('APPOINTMENT_MANAGE',  'Create and manage appointments',           'tire_tech'),
('PHOTO_UPLOAD',        'Upload photos to tire/work order records', 'tire_tech');

CREATE TABLE IF NOT EXISTS role_permissions (
    role_id       INT NOT NULL,
    permission_id INT NOT NULL,
    PRIMARY KEY (role_id, permission_id),
    CONSTRAINT fk_rp_role FOREIGN KEY (role_id) REFERENCES roles(role_id),
    CONSTRAINT fk_rp_perm FOREIGN KEY (permission_id) REFERENCES permissions(permission_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Assign all permissions to owner (role_id 3)
INSERT INTO role_permissions (role_id, permission_id)
SELECT 3, permission_id FROM permissions;

-- Assign tech-level and manager-level permissions to manager (role_id 2)
INSERT INTO role_permissions (role_id, permission_id)
SELECT 2, permission_id FROM permissions
WHERE min_role IN ('tire_tech', 'manager');

-- Assign tech-level permissions to tire_tech (role_id 1)
INSERT INTO role_permissions (role_id, permission_id)
SELECT 1, permission_id FROM permissions
WHERE min_role = 'tire_tech';

-- ============================================================================
-- DOMAIN 3: CUSTOMERS (1 table)
-- ============================================================================

CREATE TABLE IF NOT EXISTS customers (
    customer_id     INT AUTO_INCREMENT PRIMARY KEY,
    first_name      VARCHAR(60) NOT NULL,
    last_name       VARCHAR(60) NOT NULL,
    phone_primary   VARCHAR(20) DEFAULT NULL,
    phone_secondary VARCHAR(20) DEFAULT NULL,
    email           VARCHAR(120) DEFAULT NULL,
    address_line1   VARCHAR(120) DEFAULT NULL,
    address_line2   VARCHAR(120) DEFAULT NULL,
    city            VARCHAR(60) DEFAULT NULL,
    state           CHAR(2) DEFAULT NULL,
    zip             VARCHAR(10) DEFAULT NULL,
    is_tax_exempt   TINYINT(1) NOT NULL DEFAULT 0,
    tax_exempt_id   VARCHAR(40) DEFAULT NULL,
    notes           TEXT DEFAULT NULL,
    is_active       TINYINT(1) NOT NULL DEFAULT 1,
    created_by      INT DEFAULT NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                        ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_cust_created_by FOREIGN KEY (created_by) REFERENCES users(user_id),
    INDEX idx_cust_name (last_name, first_name),
    INDEX idx_cust_phone (phone_primary)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Default walk-in customer
INSERT INTO customers (first_name, last_name, notes)
VALUES ('Walk-In', 'Customer', 'Default record for quick cash sales');

-- ============================================================================
-- DOMAIN 4: VEHICLES (2 tables) [v2.3]
-- ============================================================================

CREATE TABLE IF NOT EXISTS vehicles (
    vehicle_id      INT AUTO_INCREMENT PRIMARY KEY,
    year            SMALLINT UNSIGNED DEFAULT NULL,
    make            VARCHAR(40) DEFAULT NULL,
    model           VARCHAR(60) DEFAULT NULL,
    trim_level      VARCHAR(40) DEFAULT NULL,
    vin             VARCHAR(17) DEFAULT NULL,
    license_plate   VARCHAR(15) DEFAULT NULL,
    license_state   CHAR(2) DEFAULT NULL,
    color           VARCHAR(30) DEFAULT NULL,
    drivetrain      ENUM('2WD','4WD','AWD','FWD','RWD') DEFAULT NULL,
    lug_count       TINYINT UNSIGNED DEFAULT NULL,
    lug_pattern     VARCHAR(20) DEFAULT NULL COMMENT 'e.g., 5x114.3',
    torque_spec_ftlbs SMALLINT UNSIGNED DEFAULT NULL COMMENT 'OEM lug nut torque in ft-lbs',
    oem_tire_size   VARCHAR(30) DEFAULT NULL COMMENT 'e.g., 265/70R17',
    notes           TEXT DEFAULT NULL COMMENT 'Lift kits, wheel spacers, aftermarket wheels',
    is_active       TINYINT(1) NOT NULL DEFAULT 1,
    created_by      INT DEFAULT NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                        ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_veh_created_by FOREIGN KEY (created_by) REFERENCES users(user_id),
    INDEX idx_veh_vin (vin),
    INDEX idx_veh_plate (license_plate, license_state),
    INDEX idx_veh_ymm (year, make, model)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS customer_vehicles (
    customer_id   INT NOT NULL,
    vehicle_id    INT NOT NULL,
    is_primary    TINYINT(1) NOT NULL DEFAULT 0,
    relationship  VARCHAR(30) NOT NULL DEFAULT 'owner' COMMENT 'owner, driver, fleet_manager',
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (customer_id, vehicle_id),
    CONSTRAINT fk_cv_customer FOREIGN KEY (customer_id) REFERENCES customers(customer_id),
    CONSTRAINT fk_cv_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles(vehicle_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- DOMAIN 5: VENDORS AND PROCUREMENT (3 tables) [v2.3]
-- ============================================================================

CREATE TABLE IF NOT EXISTS vendors (
    vendor_id       INT AUTO_INCREMENT PRIMARY KEY,
    vendor_name     VARCHAR(120) NOT NULL,
    contact_name    VARCHAR(80) DEFAULT NULL,
    phone           VARCHAR(20) DEFAULT NULL,
    email           VARCHAR(120) DEFAULT NULL,
    address         VARCHAR(255) DEFAULT NULL,
    account_number  VARCHAR(60) DEFAULT NULL COMMENT 'Shop account with vendor',
    payment_terms   VARCHAR(30) DEFAULT 'COD' COMMENT 'Net 30, COD, Prepaid',
    notes           TEXT DEFAULT NULL,
    is_active       TINYINT(1) NOT NULL DEFAULT 1,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- purchase_orders and po_line_items created after invoices (FK dependency)

-- ============================================================================
-- DOMAIN 6: PRIMARY INVENTORY TABLE (1 table)
-- ============================================================================

CREATE TABLE IF NOT EXISTS tires (
    tire_id             INT AUTO_INCREMENT PRIMARY KEY,
    `condition`         ENUM('N','U') NOT NULL COMMENT 'New or Used',
    cost                DECIMAL(8,2) DEFAULT NULL COMMENT 'Purchase cost, nullable',
    retail_price        DECIMAL(8,2) NOT NULL COMMENT 'Selling price',

    -- Classification
    brand_id            INT NOT NULL,
    tire_type_id        INT NOT NULL,
    model_name          VARCHAR(80) DEFAULT NULL COMMENT 'e.g., Wrangler Duratrac',

    -- Size (parsed, never stored as formatted string)
    size_format         ENUM('metric','flotation') NOT NULL DEFAULT 'metric',
    width_mm            SMALLINT NOT NULL COMMENT 'Metric: e.g., 215. Flotation: overall diameter x10',
    aspect_ratio        SMALLINT NOT NULL COMMENT 'Metric: e.g., 65. Flotation: width x10',
    construction_id     INT NOT NULL,
    wheel_diameter      DECIMAL(4,1) NOT NULL COMMENT 'Inches, e.g., 15 or 16.5',

    -- Ratings
    load_index_id       INT DEFAULT NULL COMMENT 'Single wheel rating',
    load_index_dual_id  INT DEFAULT NULL COMMENT 'Dual wheel rating (LT tires)',
    speed_rating_id     INT DEFAULT NULL,
    has_zr_designation  TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'ZR on sidewall',

    -- DOT / TIN
    dot_tin_raw         VARCHAR(20) DEFAULT NULL COMMENT 'Full TIN as printed',
    dot_plant_code      VARCHAR(4) DEFAULT NULL,
    dot_size_code       VARCHAR(4) DEFAULT NULL,
    dot_option_code     VARCHAR(4) DEFAULT NULL,
    dot_mfg_week        TINYINT UNSIGNED DEFAULT NULL,
    dot_mfg_year        SMALLINT UNSIGNED DEFAULT NULL,
    dot_is_pre2000      TINYINT(1) NOT NULL DEFAULT 0,

    -- UTQG
    utqg_treadwear      SMALLINT UNSIGNED DEFAULT NULL COMMENT 'e.g., 400',
    utqg_traction_id    INT DEFAULT NULL,
    utqg_temperature_id INT DEFAULT NULL,

    -- Markings
    weather_symbol_id   INT DEFAULT NULL,
    cosmetic_code_id    INT DEFAULT NULL,
    load_constr_id      INT DEFAULT NULL,

    -- Installation flags
    is_directional      TINYINT(1) NOT NULL DEFAULT 0,
    is_asymmetrical     TINYINT(1) NOT NULL DEFAULT 0,
    is_runflat          TINYINT(1) NOT NULL DEFAULT 0,
    max_psi             SMALLINT UNSIGNED DEFAULT NULL,

    -- Quality
    tread_depth_32nds   TINYINT UNSIGNED DEFAULT NULL COMMENT '32nds of an inch',

    -- Location
    bin_facility        CHAR(1) NOT NULL COMMENT 'R=Ranch, S=Shop',
    bin_shelf           VARCHAR(2) NOT NULL COMMENT 'A-Z or AA-ZZ',
    bin_level           SMALLINT UNSIGNED NOT NULL COMMENT 'Shelf level number',

    -- Acquisition
    source_id           INT DEFAULT NULL,

    -- v2.3 FKs
    vehicle_id          INT DEFAULT NULL COMMENT 'Vehicle tire is installed on (after sale)',
    vendor_id           INT DEFAULT NULL COMMENT 'Vendor tire was purchased from',
    po_line_id          INT DEFAULT NULL COMMENT 'PO line item tire was received against',

    -- Status and metadata
    status              ENUM('available','sold','hold','damaged','returned','written_off')
                            NOT NULL DEFAULT 'available',
    notes               TEXT DEFAULT NULL,
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                            ON UPDATE CURRENT_TIMESTAMP,
    created_by          INT DEFAULT NULL,

    -- Foreign Keys
    CONSTRAINT fk_tire_brand        FOREIGN KEY (brand_id) REFERENCES lkp_brands(brand_id),
    CONSTRAINT fk_tire_type         FOREIGN KEY (tire_type_id) REFERENCES lkp_tire_types(type_id),
    CONSTRAINT fk_tire_construction FOREIGN KEY (construction_id) REFERENCES lkp_construction_types(construction_id),
    CONSTRAINT fk_tire_load         FOREIGN KEY (load_index_id) REFERENCES lkp_load_indices(load_id),
    CONSTRAINT fk_tire_load_dual    FOREIGN KEY (load_index_dual_id) REFERENCES lkp_load_indices(load_id),
    CONSTRAINT fk_tire_speed        FOREIGN KEY (speed_rating_id) REFERENCES lkp_speed_ratings(speed_id),
    CONSTRAINT fk_tire_traction     FOREIGN KEY (utqg_traction_id) REFERENCES lkp_traction_grades(traction_id),
    CONSTRAINT fk_tire_temperature  FOREIGN KEY (utqg_temperature_id) REFERENCES lkp_temperature_grades(temperature_id),
    CONSTRAINT fk_tire_weather      FOREIGN KEY (weather_symbol_id) REFERENCES lkp_weather_symbols(weather_id),
    CONSTRAINT fk_tire_cosmetic     FOREIGN KEY (cosmetic_code_id) REFERENCES lkp_cosmetic_codes(cosmetic_id),
    CONSTRAINT fk_tire_load_constr  FOREIGN KEY (load_constr_id) REFERENCES lkp_load_construction(load_constr_id),
    CONSTRAINT fk_tire_source       FOREIGN KEY (source_id) REFERENCES lkp_acquisition_sources(source_id),
    CONSTRAINT fk_tire_vehicle      FOREIGN KEY (vehicle_id) REFERENCES vehicles(vehicle_id),
    CONSTRAINT fk_tire_vendor       FOREIGN KEY (vendor_id) REFERENCES vendors(vendor_id),
    CONSTRAINT fk_tire_created_by   FOREIGN KEY (created_by) REFERENCES users(user_id),
    -- po_line_id FK added after po_line_items table creation

    -- Check Constraints
    CONSTRAINT chk_bin_facility    CHECK (bin_facility IN ('R','S')),
    CONSTRAINT chk_retail_positive CHECK (retail_price > 0),
    CONSTRAINT chk_cost_positive   CHECK (cost IS NULL OR cost >= 0),
    CONSTRAINT chk_dot_week        CHECK (dot_mfg_week IS NULL OR (dot_mfg_week BETWEEN 1 AND 53)),
    CONSTRAINT chk_tread_depth     CHECK (tread_depth_32nds IS NULL OR (tread_depth_32nds BETWEEN 0 AND 32)),

    -- Indexes
    INDEX idx_tire_size     (width_mm, aspect_ratio, wheel_diameter),
    INDEX idx_brand_type    (brand_id, tire_type_id),
    INDEX idx_bin_location  (bin_facility, bin_shelf, bin_level),
    INDEX idx_status        (status),
    INDEX idx_dot_age       (dot_mfg_year, dot_mfg_week),
    INDEX idx_price_range   (retail_price),
    INDEX idx_source        (source_id),
    INDEX idx_tire_vehicle  (vehicle_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- DOMAIN 7: SERVICES AND PARTS CATALOG (2 tables)
-- ============================================================================

CREATE TABLE IF NOT EXISTS service_catalog (
    service_id      INT AUTO_INCREMENT PRIMARY KEY,
    service_code    VARCHAR(20) NOT NULL UNIQUE,
    service_name    VARCHAR(80) NOT NULL,
    default_labor   DECIMAL(8,2) NOT NULL COMMENT 'Default labor charge',
    is_per_tire     TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=per tire, 0=flat rate',
    is_active       TINYINT(1) NOT NULL DEFAULT 1,
    display_order   SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO service_catalog (service_code, service_name, default_labor, is_per_tire, display_order) VALUES
('MNT_BAL',   'Mount and Balance',              25.00, 1, 10),
('MNT_ONLY',  'Mount Only',                     15.00, 1, 20),
('BAL_ONLY',  'Balance Only',                   15.00, 1, 30),
('DISMOUNT',  'Dismount',                       10.00, 1, 40),
('RPR_PLUG',  'Tire Repair, Plug',              15.00, 1, 50),
('RPR_PATCH', 'Tire Repair, Patch (internal)',   25.00, 1, 60),
('RPR_COMBO', 'Tire Repair, Plug/Patch Combo',  30.00, 1, 70),
('BEAD_SEAL', 'Bead Seal',                      10.00, 1, 80),
('FLAT_RPR',  'Flat Repair (with inspection)',   20.00, 1, 90),
('ROTATION',  'Tire Rotation',                  30.00, 0, 100),
('TPMS_RST',  'TPMS Sensor Reset',             15.00, 0, 110),
('TPMS_RPL',  'TPMS Sensor Replacement',        25.00, 1, 120),
('NITROGEN',  'Nitrogen Fill',                   8.00, 1, 130),
('VALVE_RPL', 'Valve Stem Replacement',          5.00, 1, 140),
('ALIGN_CHK', 'Alignment Check',                40.00, 0, 150),
('RD_HAZ',    'Road Hazard Warranty',           15.00, 1, 160),
('DISPOSAL',  'Tire Disposal',                   3.00, 1, 170);

CREATE TABLE IF NOT EXISTS service_parts (
    part_id         INT AUTO_INCREMENT PRIMARY KEY,
    service_id      INT NOT NULL,
    part_name       VARCHAR(60) NOT NULL,
    default_cost    DECIMAL(8,2) NOT NULL,
    is_taxable      TINYINT(1) NOT NULL DEFAULT 1,
    is_active       TINYINT(1) NOT NULL DEFAULT 1,

    CONSTRAINT fk_sp_service FOREIGN KEY (service_id) REFERENCES service_catalog(service_id),
    INDEX idx_sp_service (service_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO service_parts (service_id, part_name, default_cost, is_taxable) VALUES
((SELECT service_id FROM service_catalog WHERE service_code='MNT_BAL'),  'Wheel weights', 3.50, 1),
((SELECT service_id FROM service_catalog WHERE service_code='MNT_BAL'),  'Valve stem',    2.50, 1),
((SELECT service_id FROM service_catalog WHERE service_code='MNT_ONLY'), 'Valve stem',    2.50, 1),
((SELECT service_id FROM service_catalog WHERE service_code='BAL_ONLY'), 'Wheel weights', 3.50, 1),
((SELECT service_id FROM service_catalog WHERE service_code='RPR_PLUG'), 'Plug kit',      2.00, 1),
((SELECT service_id FROM service_catalog WHERE service_code='RPR_PATCH'),'Radial patch',  3.00, 1);

-- ============================================================================
-- DOMAIN 10: PURCHASE ORDERS (2 tables, created after invoices) [v2.3]
-- ============================================================================

CREATE TABLE IF NOT EXISTS purchase_orders (
    po_id               INT AUTO_INCREMENT PRIMARY KEY,
    po_number           VARCHAR(20) NOT NULL UNIQUE COMMENT 'PO-000001 format',
    vendor_id           INT NOT NULL,
    order_date          DATE NOT NULL,
    expected_delivery   DATE DEFAULT NULL,
    actual_delivery     DATE DEFAULT NULL,
    subtotal            DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    shipping_cost       DECIMAL(8,2) NOT NULL DEFAULT 0.00,
    status              ENUM('draft','submitted','confirmed','partial','received','cancelled')
                            NOT NULL DEFAULT 'draft',
    vendor_confirmation VARCHAR(60) DEFAULT NULL COMMENT 'Vendor order number',
    notes               TEXT DEFAULT NULL,
    created_by          INT NOT NULL,
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                            ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_po_vendor     FOREIGN KEY (vendor_id) REFERENCES vendors(vendor_id),
    CONSTRAINT fk_po_created_by FOREIGN KEY (created_by) REFERENCES users(user_id),
    INDEX idx_po_vendor (vendor_id),
    INDEX idx_po_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS po_line_items (
    po_line_id      INT AUTO_INCREMENT PRIMARY KEY,
    po_id           INT NOT NULL,
    description     VARCHAR(255) NOT NULL COMMENT 'Tire spec being ordered',
    quantity_ordered    SMALLINT UNSIGNED NOT NULL,
    quantity_received   SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    unit_cost       DECIMAL(8,2) NOT NULL COMMENT 'Wholesale cost',
    line_total      DECIMAL(10,2) NOT NULL COMMENT 'qty_ordered * unit_cost',
    tire_id         INT DEFAULT NULL COMMENT 'Linked when tire received into inventory',
    notes           VARCHAR(255) DEFAULT NULL,

    CONSTRAINT fk_poli_po   FOREIGN KEY (po_id) REFERENCES purchase_orders(po_id),
    CONSTRAINT fk_poli_tire FOREIGN KEY (tire_id) REFERENCES tires(tire_id),
    INDEX idx_poli_po (po_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Now add the deferred FK from tires to po_line_items
ALTER TABLE tires
    ADD CONSTRAINT fk_tire_po_line FOREIGN KEY (po_line_id) REFERENCES po_line_items(po_line_id);

-- ============================================================================
-- DOMAIN 11: WORK ORDERS (2 tables) [v2.3]
-- ============================================================================

CREATE TABLE IF NOT EXISTS work_orders (
    work_order_id       INT AUTO_INCREMENT PRIMARY KEY,
    wo_number           VARCHAR(20) NOT NULL UNIQUE COMMENT 'WO-000001 format',
    customer_id         INT NOT NULL,
    vehicle_id          INT DEFAULT NULL,

    mileage_in          INT UNSIGNED DEFAULT NULL,
    mileage_out         INT UNSIGNED DEFAULT NULL,
    assigned_tech_id    INT DEFAULT NULL,

    customer_complaint  TEXT DEFAULT NULL,
    tech_diagnosis      TEXT DEFAULT NULL,
    special_notes       TEXT DEFAULT NULL COMMENT 'Lift kit, aftermarket wheels, rush, etc.',

    -- Torque tracking (LIABILITY)
    torque_spec_used    SMALLINT UNSIGNED DEFAULT NULL COMMENT 'Actual ft-lbs applied',
    torque_verified_by  INT DEFAULT NULL,
    torque_verified_at  DATETIME DEFAULT NULL,
    retorque_due_date   DATE DEFAULT NULL,
    retorque_due_miles  INT UNSIGNED DEFAULT NULL,
    retorque_completed  TINYINT(1) NOT NULL DEFAULT 0,
    retorque_completed_at DATETIME DEFAULT NULL,
    retorque_completed_by INT DEFAULT NULL,

    status              ENUM('intake','in_progress','quality_check','complete','cancelled')
                            NOT NULL DEFAULT 'intake',
    intake_at           DATETIME DEFAULT NULL,
    started_at          DATETIME DEFAULT NULL,
    completed_at        DATETIME DEFAULT NULL,
    released_at         DATETIME DEFAULT NULL,

    created_by          INT NOT NULL,
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                            ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_wo_customer    FOREIGN KEY (customer_id) REFERENCES customers(customer_id),
    CONSTRAINT fk_wo_vehicle     FOREIGN KEY (vehicle_id) REFERENCES vehicles(vehicle_id),
    CONSTRAINT fk_wo_tech        FOREIGN KEY (assigned_tech_id) REFERENCES users(user_id),
    CONSTRAINT fk_wo_torque_by   FOREIGN KEY (torque_verified_by) REFERENCES users(user_id),
    CONSTRAINT fk_wo_retorque_by FOREIGN KEY (retorque_completed_by) REFERENCES users(user_id),
    CONSTRAINT fk_wo_created_by  FOREIGN KEY (created_by) REFERENCES users(user_id),
    INDEX idx_wo_customer (customer_id),
    INDEX idx_wo_vehicle (vehicle_id),
    INDEX idx_wo_status (status),
    INDEX idx_wo_date (created_at)

CREATE TABLE IF NOT EXISTS work_order_positions (
    position_id         INT AUTO_INCREMENT PRIMARY KEY,
    work_order_id       INT NOT NULL,
    position_code       ENUM('LF','RF','LR','RR','SPARE','LRI','RRI','LFI','RFI') NOT NULL,
    action_requested    ENUM('none','install','repair','inspect','rotate_to','dismount')
                            NOT NULL DEFAULT 'none',
    rotate_to_position  ENUM('LF','RF','LR','RR','SPARE','LRI','RRI','LFI','RFI') DEFAULT NULL,
    tire_id_existing    INT DEFAULT NULL COMMENT 'Tire currently on vehicle at this position',
    tire_id_new         INT DEFAULT NULL COMMENT 'Tire from inventory to install',
    tread_depth_in      TINYINT UNSIGNED DEFAULT NULL COMMENT '32nds at intake',
    tread_depth_out     TINYINT UNSIGNED DEFAULT NULL COMMENT '32nds at release',
    psi_in              TINYINT UNSIGNED DEFAULT NULL,
    psi_out             TINYINT UNSIGNED DEFAULT NULL,
    condition_notes     VARCHAR(255) DEFAULT NULL,
    condition_grade     ENUM('good','fair','poor','unsafe','not_inspected') DEFAULT 'not_inspected',
    is_completed        TINYINT(1) NOT NULL DEFAULT 0,
    completed_by        INT DEFAULT NULL,
    completed_at        DATETIME DEFAULT NULL,

    CONSTRAINT fk_wop_wo         FOREIGN KEY (work_order_id) REFERENCES work_orders(work_order_id),
    CONSTRAINT fk_wop_existing   FOREIGN KEY (tire_id_existing) REFERENCES tires(tire_id),
    CONSTRAINT fk_wop_new        FOREIGN KEY (tire_id_new) REFERENCES tires(tire_id),
    CONSTRAINT fk_wop_completed  FOREIGN KEY (completed_by) REFERENCES users(user_id),
    INDEX idx_wop_wo (work_order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- DOMAIN 12: WAIVERS (1 table) [v2.3]
-- ============================================================================

CREATE TABLE IF NOT EXISTS waivers (
    waiver_id       INT AUTO_INCREMENT PRIMARY KEY,
    waiver_type     ENUM('aged_tire','used_tire','repair_limit','custom') NOT NULL,
    work_order_id   INT DEFAULT NULL,
    customer_id     INT NOT NULL,
    tire_id         INT DEFAULT NULL,
    waiver_text     TEXT NOT NULL COMMENT 'Frozen copy of template at creation time',
    customer_signature VARCHAR(255) DEFAULT NULL COMMENT 'File path or VERBAL',
    signed_at       DATETIME DEFAULT NULL,
    witnessed_by    INT DEFAULT NULL,
    notes           TEXT DEFAULT NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_waiver_wo       FOREIGN KEY (work_order_id) REFERENCES work_orders(work_order_id),
    CONSTRAINT fk_waiver_customer FOREIGN KEY (customer_id) REFERENCES customers(customer_id),
    CONSTRAINT fk_waiver_tire     FOREIGN KEY (tire_id) REFERENCES tires(tire_id),
    CONSTRAINT fk_waiver_witness  FOREIGN KEY (witnessed_by) REFERENCES users(user_id),
    INDEX idx_waiver_customer (customer_id),
    INDEX idx_waiver_wo (work_order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- DOMAIN 13: PHOTOS (1 table) [v2.3]
-- ============================================================================

CREATE TABLE IF NOT EXISTS tire_photos (
    photo_id        INT AUTO_INCREMENT PRIMARY KEY,
    photo_path      VARCHAR(255) NOT NULL COMMENT 'Filesystem path, never BLOB',
    photo_type      ENUM('tread','sidewall','dot_code','damage','receipt','waiver','other') NOT NULL,
    tire_id         INT DEFAULT NULL,
    work_order_id   INT DEFAULT NULL,
    position_code   ENUM('LF','RF','LR','RR','SPARE','LRI','RRI','LFI','RFI') DEFAULT NULL,
    caption         VARCHAR(255) DEFAULT NULL,
    uploaded_by     INT NOT NULL,
    uploaded_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_photo_tire FOREIGN KEY (tire_id) REFERENCES tires(tire_id),
    CONSTRAINT fk_photo_wo   FOREIGN KEY (work_order_id) REFERENCES work_orders(work_order_id),
    CONSTRAINT fk_photo_user FOREIGN KEY (uploaded_by) REFERENCES users(user_id),
    INDEX idx_photo_tire (tire_id),
    INDEX idx_photo_wo (work_order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================


-- ============================================================================
-- DOMAIN 15: APPOINTMENTS (1 table) [v2.3]
-- ============================================================================

CREATE TABLE IF NOT EXISTS appointments (
    appointment_id  INT AUTO_INCREMENT PRIMARY KEY,
    customer_id     INT DEFAULT NULL,
    vehicle_id      INT DEFAULT NULL,
    appointment_date DATE NOT NULL,
    appointment_time TIME NOT NULL,
    est_duration_min SMALLINT UNSIGNED NOT NULL DEFAULT 60,
    service_requested VARCHAR(255) DEFAULT NULL,
    tire_count      TINYINT UNSIGNED DEFAULT NULL,
    customer_name   VARCHAR(120) DEFAULT NULL COMMENT 'For walk-in bookings',
    customer_phone  VARCHAR(20) DEFAULT NULL,
    status          ENUM('scheduled','confirmed','checked_in','no_show','cancelled')
                        NOT NULL DEFAULT 'scheduled',
    work_order_id   INT DEFAULT NULL COMMENT 'Linked when customer arrives',
    notes           TEXT DEFAULT NULL,
    created_by      INT DEFAULT NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_appt_customer FOREIGN KEY (customer_id) REFERENCES customers(customer_id),
    CONSTRAINT fk_appt_vehicle  FOREIGN KEY (vehicle_id) REFERENCES vehicles(vehicle_id),
    CONSTRAINT fk_appt_wo       FOREIGN KEY (work_order_id) REFERENCES work_orders(work_order_id),
    CONSTRAINT fk_appt_user     FOREIGN KEY (created_by) REFERENCES users(user_id),
    INDEX idx_appt_date (appointment_date, appointment_time),
    INDEX idx_appt_customer (customer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- DOMAIN 16: FEES AND COMPLIANCE (2 tables)
-- ============================================================================

CREATE TABLE IF NOT EXISTS fee_configuration (
    fee_id          INT AUTO_INCREMENT PRIMARY KEY,
    fee_key         VARCHAR(40) NOT NULL UNIQUE,
    fee_label       VARCHAR(80) NOT NULL,
    fee_amount      DECIMAL(8,2) NOT NULL DEFAULT 0.00,
    is_per_tire     TINYINT(1) NOT NULL DEFAULT 1,
    applies_to      ENUM('new_only','used_only','all','none') NOT NULL DEFAULT 'new_only',
    is_taxable      TINYINT(1) NOT NULL DEFAULT 0,
    statutory_text  TEXT DEFAULT NULL COMMENT 'Required disclosure or waiver template',
    effective_date  DATE NOT NULL,
    is_active       TINYINT(1) NOT NULL DEFAULT 1,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Colorado tire fees effective 2026-01-01
INSERT INTO fee_configuration (fee_key, fee_label, fee_amount, is_per_tire, applies_to, is_taxable, statutory_text, effective_date) VALUES
('CO_WASTE_TIRE_ENT', 'CO Waste Tire Enterprise Fee', 2.00, 1, 'new_only', 0,
 'Colorado Waste Tire Enterprise Fee imposed per C.R.S. 25-17-202. This fee funds waste tire cleanup and recycling programs.',
 '2026-01-01'),
('CO_WASTE_TIRE_ADM', 'CO Waste Tire Administration Fee', 0.50, 1, 'new_only', 0,
 'Colorado Waste Tire Administration Fee imposed per C.R.S. 25-17-202.',
 '2026-01-01'),
('TIRE_DISPOSAL', 'Tire Disposal Fee', 3.00, 1, 'all', 0,
 'Fee for proper disposal of replaced tires per CDPHE waste tire regulations.',
 '2026-01-01');

-- Waiver templates (v2.3)
INSERT INTO fee_configuration (fee_key, fee_label, fee_amount, applies_to, statutory_text, effective_date) VALUES
('WAIVER_AGED_TIRE', 'Aged Tire Acknowledgment', 0.00, 'none',
 'I acknowledge that the tire(s) identified on this work order were manufactured more than six (6) years ago. Tire manufacturers recommend replacement regardless of tread depth due to rubber degradation over time. I accept all risks associated with the continued use of aged tire(s) and release the shop from liability related to tire age.',
 '2026-01-01'),
('WAIVER_USED_TIRE', 'Used Tire Acknowledgment', 0.00, 'none',
 'I acknowledge that the tire(s) purchased are used, previously mounted and driven. Tread depth and condition have been disclosed. These tires are sold as-is with no warranty unless a separate road hazard warranty has been purchased.',
 '2026-01-01'),
('WAIVER_REPAIR_LIMIT', 'Repair Limit Acknowledgment', 0.00, 'none',
 'I acknowledge that the tire repair performed is in an area outside the standard repairable zone as defined by USTMA guidelines (shoulder or sidewall area). This repair carries a higher risk of failure than a standard tread area repair. Limited warranty applies.',
 '2026-01-01');

CREATE TABLE IF NOT EXISTS tire_disposal_log (
    disposal_id     INT AUTO_INCREMENT PRIMARY KEY,
    tire_id         INT DEFAULT NULL,
    work_order_id   INT DEFAULT NULL,
    disposal_date   DATE NOT NULL,
    quantity        SMALLINT UNSIGNED NOT NULL DEFAULT 1,
    hauler_name     VARCHAR(120) DEFAULT NULL,
    manifest_number VARCHAR(60) DEFAULT NULL,
    notes           VARCHAR(255) DEFAULT NULL,
    logged_by       INT NOT NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_disp_tire    FOREIGN KEY (tire_id) REFERENCES tires(tire_id),
    CONSTRAINT fk_disp_wo      FOREIGN KEY (work_order_id) REFERENCES work_orders(work_order_id),
    CONSTRAINT fk_disp_user    FOREIGN KEY (logged_by) REFERENCES users(user_id),
    INDEX idx_disp_date (disposal_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- DOMAIN 17: AUDIT (2 tables)
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_log (
    log_id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    table_name      VARCHAR(60) NOT NULL,
    record_id       INT DEFAULT NULL,
    action          ENUM('INSERT','UPDATE','DELETE','STATUS_CHANGE','LOGIN','LOGOUT','FAILED_LOGIN')
                        NOT NULL,
    field_changed   VARCHAR(60) DEFAULT NULL,
    old_value       TEXT DEFAULT NULL,
    new_value       TEXT DEFAULT NULL,
    changed_by      INT DEFAULT NULL,
    changed_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ip_address      VARCHAR(45) DEFAULT NULL,

    CONSTRAINT fk_audit_user FOREIGN KEY (changed_by) REFERENCES users(user_id),
    INDEX idx_audit_table (table_name, record_id),
    INDEX idx_audit_date (changed_at),
    INDEX idx_audit_user (changed_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_activity_log (
    activity_id     BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id         INT NOT NULL,
    activity_type   VARCHAR(40) NOT NULL COMMENT 'search, view, create, update, delete, login, etc.',
    entity_type     VARCHAR(40) DEFAULT NULL COMMENT 'tire, invoice, customer, etc.',
    entity_id       INT DEFAULT NULL,
    details         VARCHAR(255) DEFAULT NULL,
    ip_address      VARCHAR(45) DEFAULT NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_ual_user FOREIGN KEY (user_id) REFERENCES users(user_id),
    INDEX idx_ual_user (user_id),
    INDEX idx_ual_date (created_at),
    INDEX idx_ual_type (activity_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- VIEWS (13 total)
-- ============================================================================


-- ============================================================================
-- DOMAIN: SESSIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS sessions (
    session_id      INT AUTO_INCREMENT PRIMARY KEY,
    user_id         INT NOT NULL,
    token           VARCHAR(64) NOT NULL UNIQUE,
    ip_address      VARCHAR(45) DEFAULT NULL,
    user_agent      VARCHAR(255) DEFAULT NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at      DATETIME NOT NULL,
    last_active_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_session_user FOREIGN KEY (user_id) REFERENCES users(user_id),
    INDEX idx_session_token (token),
    INDEX idx_session_user (user_id),
    INDEX idx_session_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================================
-- DOMAIN: SHOP SETTINGS AND WEBSITE CONFIG
-- ============================================================================

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
    updated_at      DATETIME DEFAULT NULL,

    INDEX idx_ss_category (category),
    INDEX idx_ss_public (is_public)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS website_config (
    config_id       INT AUTO_INCREMENT PRIMARY KEY,
    config_key      VARCHAR(60) NOT NULL UNIQUE,
    config_value    TEXT DEFAULT NULL,
    config_type     ENUM('text','html','color','image_url','boolean','json') NOT NULL DEFAULT 'text',
    label           VARCHAR(120) NOT NULL,
    description     TEXT DEFAULT NULL,
    updated_at      DATETIME DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================================
-- DOMAIN: WARRANTIES
-- ============================================================================

CREATE TABLE IF NOT EXISTS warranty_policies (
    policy_id           INT AUTO_INCREMENT PRIMARY KEY,
    policy_name         VARCHAR(80) NOT NULL,
    policy_code         VARCHAR(20) NOT NULL UNIQUE,
    coverage_months     INT UNSIGNED DEFAULT NULL,
    coverage_miles      INT UNSIGNED DEFAULT NULL,
    coverage_tread_depth_32nds TINYINT UNSIGNED DEFAULT NULL,
    pro_rata            TINYINT(1) NOT NULL DEFAULT 0,
    terms_text          TEXT NOT NULL,
    is_active           TINYINT(1) NOT NULL DEFAULT 1,
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS warranty_claims (
    claim_id            INT AUTO_INCREMENT PRIMARY KEY,
    work_order_id       INT DEFAULT NULL COMMENT 'Original purchase work order',
    position_id         INT DEFAULT NULL COMMENT 'Position on original WO',
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

    CONSTRAINT fk_wc_wo       FOREIGN KEY (work_order_id) REFERENCES work_orders(work_order_id),
    CONSTRAINT fk_wc_position FOREIGN KEY (position_id) REFERENCES work_order_positions(position_id),
    CONSTRAINT fk_wc_customer FOREIGN KEY (customer_id) REFERENCES customers(customer_id),
    CONSTRAINT fk_wc_policy   FOREIGN KEY (policy_id) REFERENCES warranty_policies(policy_id),
    CONSTRAINT fk_wc_tire     FOREIGN KEY (tire_id) REFERENCES tires(tire_id),
    INDEX idx_wc_wo (work_order_id),
    INDEX idx_wc_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================================
-- DOMAIN: WHEELS AND FITMENT
-- ============================================================================

CREATE TABLE IF NOT EXISTS wheels (
    wheel_id        INT AUTO_INCREMENT PRIMARY KEY,
    brand           VARCHAR(80) DEFAULT NULL,
    model           VARCHAR(80) DEFAULT NULL,
    diameter        DECIMAL(4,1) NOT NULL COMMENT 'Inches',
    width           DECIMAL(4,1) DEFAULT NULL COMMENT 'Inches',
    bolt_pattern    VARCHAR(20) DEFAULT NULL COMMENT 'e.g. 5x114.3',
    offset_mm       SMALLINT DEFAULT NULL,
    center_bore_mm  DECIMAL(5,1) DEFAULT NULL,
    material        ENUM('alloy','steel','carbon_fiber','forged','other') DEFAULT 'alloy',
    finish          VARCHAR(40) DEFAULT NULL,
    `condition`     ENUM('new','like_new','good','fair','poor') NOT NULL DEFAULT 'new',
    retail_price    DECIMAL(8,2) DEFAULT NULL,
    cost            DECIMAL(8,2) DEFAULT NULL,
    quantity        SMALLINT UNSIGNED NOT NULL DEFAULT 1,
    bin_location    VARCHAR(30) DEFAULT NULL,
    notes           TEXT DEFAULT NULL,
    is_active       TINYINT(1) NOT NULL DEFAULT 1,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wheel_fitments (
    fitment_id      INT AUTO_INCREMENT PRIMARY KEY,
    wheel_id        INT NOT NULL,
    year_from       SMALLINT UNSIGNED DEFAULT NULL,
    year_to         SMALLINT UNSIGNED DEFAULT NULL,
    make            VARCHAR(40) NOT NULL,
    model           VARCHAR(40) NOT NULL,
    trim_level      VARCHAR(40) DEFAULT NULL,
    notes           VARCHAR(255) DEFAULT NULL,

    CONSTRAINT fk_wf_wheel FOREIGN KEY (wheel_id) REFERENCES wheels(wheel_id),
    INDEX idx_wf_wheel (wheel_id),
    INDEX idx_wf_vehicle (make, model)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================================
-- DOMAIN: CUSTOM FIELDS
-- ============================================================================

CREATE TABLE IF NOT EXISTS custom_fields (
    field_id        INT AUTO_INCREMENT PRIMARY KEY,
    field_name      VARCHAR(60) NOT NULL UNIQUE,
    field_label     VARCHAR(80) NOT NULL,
    field_type      ENUM('text','number','date','boolean','select') NOT NULL DEFAULT 'text',
    entity_type     VARCHAR(30) NOT NULL COMMENT 'tire, customer, vehicle, work_order',
    select_options  JSON DEFAULT NULL COMMENT 'For select type: ["opt1","opt2"]',
    is_required     TINYINT(1) NOT NULL DEFAULT 0,
    is_active       TINYINT(1) NOT NULL DEFAULT 1,
    display_order   SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS custom_field_values (
    value_id        INT AUTO_INCREMENT PRIMARY KEY,
    field_id        INT NOT NULL,
    entity_type     VARCHAR(30) NOT NULL,
    entity_id       INT NOT NULL,
    field_value     TEXT DEFAULT NULL,

    CONSTRAINT fk_cfv_field FOREIGN KEY (field_id) REFERENCES custom_fields(field_id),
    UNIQUE INDEX idx_cfv_unique (field_id, entity_type, entity_id),
    INDEX idx_cfv_entity (entity_type, entity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================================
-- DOMAIN: API KEYS
-- ============================================================================

CREATE TABLE IF NOT EXISTS api_keys (
    key_id          INT AUTO_INCREMENT PRIMARY KEY,
    key_hash        VARCHAR(64) NOT NULL UNIQUE COMMENT 'SHA-256 of the API key',
    key_prefix      VARCHAR(8) NOT NULL COMMENT 'First 8 chars for identification',
    label           VARCHAR(120) NOT NULL,
    permissions     JSON DEFAULT NULL,
    rate_limit      INT UNSIGNED NOT NULL DEFAULT 1000 COMMENT 'Requests per hour',
    is_active       TINYINT(1) NOT NULL DEFAULT 1,
    last_used_at    DATETIME DEFAULT NULL,
    request_count   BIGINT UNSIGNED NOT NULL DEFAULT 0,
    created_by      INT NOT NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_ak_user FOREIGN KEY (created_by) REFERENCES users(user_id),
    INDEX idx_ak_hash (key_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================================
-- DOMAIN: NOTIFICATIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS notification_log (
    notification_id     INT AUTO_INCREMENT PRIMARY KEY,
    customer_id         INT DEFAULT NULL,
    notification_type   VARCHAR(40) NOT NULL COMMENT 'appointment_reminder, wo_complete, etc.',
    channel             ENUM('email','sms','internal') NOT NULL DEFAULT 'email',
    recipient           VARCHAR(255) DEFAULT NULL COMMENT 'Email or phone',
    subject             VARCHAR(255) DEFAULT NULL,
    body                TEXT NOT NULL,
    status              ENUM('pending','sent','failed') NOT NULL DEFAULT 'pending',
    sent_at             DATETIME DEFAULT NULL,
    error_message       VARCHAR(255) DEFAULT NULL,
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_nl_customer FOREIGN KEY (customer_id) REFERENCES customers(customer_id),
    INDEX idx_nl_status (status),
    INDEX idx_nl_customer (customer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================================
-- DOMAIN: CUSTOMER ENGAGEMENT (Discounts, Coupons, Storage)
-- ============================================================================

CREATE TABLE IF NOT EXISTS discount_groups (
    group_id        INT AUTO_INCREMENT PRIMARY KEY,
    group_name      VARCHAR(80) NOT NULL,
    group_code      VARCHAR(20) NOT NULL UNIQUE,
    discount_type   ENUM('percentage','fixed_per_tire','fixed_per_invoice') NOT NULL DEFAULT 'percentage',
    discount_value  DECIMAL(8,2) NOT NULL DEFAULT 0.00,
    applies_to      ENUM('tires','labor','parts','all') NOT NULL DEFAULT 'all',
    auto_apply      TINYINT(1) NOT NULL DEFAULT 1,
    min_purchase    DECIMAL(10,2) DEFAULT NULL,
    is_active       TINYINT(1) NOT NULL DEFAULT 1,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS customer_discount_groups (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    customer_id     INT NOT NULL,
    group_id        INT NOT NULL,
    added_by        INT NOT NULL,
    added_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at      DATE DEFAULT NULL,

    CONSTRAINT fk_cdg_customer FOREIGN KEY (customer_id) REFERENCES customers(customer_id),
    CONSTRAINT fk_cdg_group    FOREIGN KEY (group_id) REFERENCES discount_groups(group_id),
    CONSTRAINT fk_cdg_user     FOREIGN KEY (added_by) REFERENCES users(user_id),
    UNIQUE INDEX idx_cdg_unique (customer_id, group_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS coupons (
    coupon_id       INT AUTO_INCREMENT PRIMARY KEY,
    coupon_code     VARCHAR(30) NOT NULL UNIQUE,
    coupon_name     VARCHAR(120) NOT NULL,
    coupon_type     ENUM('store','manufacturer') NOT NULL DEFAULT 'store',
    discount_type   ENUM('percentage','fixed','buy_x_get_y') NOT NULL DEFAULT 'percentage',
    discount_value  DECIMAL(8,2) NOT NULL,
    buy_qty         SMALLINT UNSIGNED DEFAULT NULL,
    get_qty         SMALLINT UNSIGNED DEFAULT NULL,
    applies_to      ENUM('tires','labor','parts','all') NOT NULL DEFAULT 'all',
    min_purchase    DECIMAL(10,2) DEFAULT NULL,
    max_discount    DECIMAL(10,2) DEFAULT NULL,
    max_uses        INT UNSIGNED DEFAULT NULL,
    max_uses_per_customer INT UNSIGNED DEFAULT NULL,
    valid_from      DATE DEFAULT NULL,
    valid_until     DATE DEFAULT NULL,
    is_active       TINYINT(1) NOT NULL DEFAULT 1,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS coupon_usage (
    usage_id        INT AUTO_INCREMENT PRIMARY KEY,
    coupon_id       INT NOT NULL,
    work_order_id   INT NOT NULL,
    customer_id     INT DEFAULT NULL,
    discount_applied DECIMAL(10,2) NOT NULL,
    used_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_cu_coupon   FOREIGN KEY (coupon_id) REFERENCES coupons(coupon_id),
    CONSTRAINT fk_cu_wo       FOREIGN KEY (work_order_id) REFERENCES work_orders(work_order_id),
    CONSTRAINT fk_cu_customer FOREIGN KEY (customer_id) REFERENCES customers(customer_id),
    INDEX idx_cu_coupon (coupon_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tire_storage (
    storage_id      INT AUTO_INCREMENT PRIMARY KEY,
    customer_id     INT NOT NULL,
    tire_id         INT DEFAULT NULL,
    description     VARCHAR(255) NOT NULL DEFAULT 'Seasonal tire storage',
    quantity        TINYINT UNSIGNED NOT NULL DEFAULT 4,
    location_code   VARCHAR(30) DEFAULT NULL,
    stored_at       DATE NOT NULL,
    expected_pickup DATE DEFAULT NULL,
    picked_up_at    DATE DEFAULT NULL,
    monthly_rate    DECIMAL(8,2) NOT NULL DEFAULT 0.00,
    notes           TEXT DEFAULT NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_ts_customer FOREIGN KEY (customer_id) REFERENCES customers(customer_id),
    CONSTRAINT fk_ts_tire     FOREIGN KEY (tire_id) REFERENCES tires(tire_id),
    INDEX idx_ts_customer (customer_id),
    INDEX idx_ts_active (picked_up_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS storage_billing (
    billing_id      INT AUTO_INCREMENT PRIMARY KEY,
    storage_id      INT NOT NULL,
    billing_month   DATE NOT NULL,
    amount          DECIMAL(8,2) NOT NULL,
    work_order_id   INT DEFAULT NULL COMMENT 'Linked to work order when billed',
    status          ENUM('pending','invoiced','waived') NOT NULL DEFAULT 'pending',
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_sb_storage FOREIGN KEY (storage_id) REFERENCES tire_storage(storage_id),
    CONSTRAINT fk_sb_wo      FOREIGN KEY (work_order_id) REFERENCES work_orders(work_order_id),
    INDEX idx_sb_storage (storage_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================================
-- DOMAIN: MARKETPLACE AND INTEGRATIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS integration_credentials (
    cred_id         INT AUTO_INCREMENT PRIMARY KEY,
    integration     VARCHAR(30) NOT NULL COMMENT 'atd, tire_hub, facebook, etc.',
    cred_key        VARCHAR(60) NOT NULL,
    cred_value      TEXT NOT NULL COMMENT 'Encrypted at rest in production',
    environment     ENUM('sandbox','production') NOT NULL DEFAULT 'sandbox',
    is_active       TINYINT(1) NOT NULL DEFAULT 1,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE INDEX idx_ic_unique (integration, cred_key, environment)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS integration_sync_log (
    sync_id         INT AUTO_INCREMENT PRIMARY KEY,
    integration     VARCHAR(30) NOT NULL,
    operation       VARCHAR(40) NOT NULL,
    direction       ENUM('inbound','outbound') NOT NULL,
    status          ENUM('success','error','partial') NOT NULL,
    record_count    VARCHAR(60) DEFAULT NULL,
    http_status     SMALLINT DEFAULT NULL,
    error_message   TEXT DEFAULT NULL,
    request_body    TEXT DEFAULT NULL,
    response_body   TEXT DEFAULT NULL,
    remote_id       VARCHAR(120) DEFAULT NULL,
    duration_ms     INT DEFAULT NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_isl_integration (integration, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS marketplace_listings (
    listing_id      INT AUTO_INCREMENT PRIMARY KEY,
    platform        VARCHAR(30) NOT NULL,
    tire_id         INT DEFAULT NULL,
    wheel_id        INT DEFAULT NULL,
    external_id     VARCHAR(120) DEFAULT NULL,
    title           VARCHAR(255) NOT NULL,
    description     TEXT DEFAULT NULL,
    price           DECIMAL(8,2) DEFAULT NULL,
    status          ENUM('draft','active','sold','expired','removed') NOT NULL DEFAULT 'draft',
    listed_at       DATETIME DEFAULT NULL,
    expires_at      DATETIME DEFAULT NULL,
    views_count     INT UNSIGNED DEFAULT 0,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_ml_tire  FOREIGN KEY (tire_id) REFERENCES tires(tire_id),
    INDEX idx_ml_platform (platform, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS marketplace_orders (
    order_id        INT AUTO_INCREMENT PRIMARY KEY,
    platform        VARCHAR(30) NOT NULL,
    external_order_id VARCHAR(120) DEFAULT NULL UNIQUE,
    buyer_name      VARCHAR(120) DEFAULT NULL,
    buyer_email     VARCHAR(120) DEFAULT NULL,
    buyer_phone     VARCHAR(20) DEFAULT NULL,
    buyer_address   TEXT DEFAULT NULL,
    order_total     DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    platform_fees   DECIMAL(8,2) NOT NULL DEFAULT 0.00,
    shipping_cost   DECIMAL(8,2) NOT NULL DEFAULT 0.00,
    status          ENUM('pending','confirmed','shipped','delivered','cancelled','returned') NOT NULL DEFAULT 'pending',
    ordered_at      DATETIME DEFAULT NULL,
    notes           TEXT DEFAULT NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_mo_platform (platform, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS marketplace_order_items (
    item_id         INT AUTO_INCREMENT PRIMARY KEY,
    order_id        INT NOT NULL,
    listing_id      INT DEFAULT NULL,
    tire_id         INT DEFAULT NULL,
    wheel_id        INT DEFAULT NULL,
    description     VARCHAR(255) NOT NULL,
    quantity        SMALLINT UNSIGNED NOT NULL DEFAULT 1,
    unit_price      DECIMAL(8,2) NOT NULL,
    line_total      DECIMAL(10,2) NOT NULL,

    CONSTRAINT fk_moi_order FOREIGN KEY (order_id) REFERENCES marketplace_orders(order_id),
    INDEX idx_moi_order (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS b2b_network_inventory (
    b2b_id          INT AUTO_INCREMENT PRIMARY KEY,
    tire_id         INT DEFAULT NULL,
    wheel_id        INT DEFAULT NULL,
    price_wholesale DECIMAL(8,2) DEFAULT NULL,
    min_order_qty   SMALLINT UNSIGNED NOT NULL DEFAULT 1,
    is_active       TINYINT(1) NOT NULL DEFAULT 1,
    added_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_b2b_tire FOREIGN KEY (tire_id) REFERENCES tires(tire_id),
    INDEX idx_b2b_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS directory_listings (
    directory_id    INT AUTO_INCREMENT PRIMARY KEY,
    directory_name  VARCHAR(80) NOT NULL,
    listing_url     VARCHAR(500) DEFAULT NULL,
    status          ENUM('active','pending','inactive') NOT NULL DEFAULT 'pending',
    last_verified   DATE DEFAULT NULL,
    notes           TEXT DEFAULT NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================================
-- DOMAIN: SCHEMA VERSION TRACKING
-- ============================================================================

CREATE TABLE IF NOT EXISTS schema_version (
    id              INT PRIMARY KEY DEFAULT 1,
    version         VARCHAR(20) NOT NULL DEFAULT '1.2.0',
    installed_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_migration  VARCHAR(60) DEFAULT NULL,

    CONSTRAINT single_row CHECK (id = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO schema_version (id, version) VALUES (1, '1.2.0')
ON DUPLICATE KEY UPDATE version = '1.2.0';

CREATE TABLE IF NOT EXISTS schema_migrations (
    migration_id    INT AUTO_INCREMENT PRIMARY KEY,
    filename        VARCHAR(120) NOT NULL UNIQUE,
    applied_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    checksum        VARCHAR(64) DEFAULT NULL,
    success         TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================================
-- DOMAIN: WORK ORDER LINE ITEMS
-- ============================================================================

CREATE TABLE IF NOT EXISTS work_order_line_items (
    line_id         INT AUTO_INCREMENT PRIMARY KEY,
    work_order_id   INT NOT NULL,
    line_type       ENUM('labor','part','fee','warranty','disposal','other') NOT NULL,
    description     VARCHAR(255) NOT NULL,
    quantity        DECIMAL(6,2) NOT NULL DEFAULT 1.00,
    unit_price      DECIMAL(8,2) NOT NULL DEFAULT 0.00,
    line_total      DECIMAL(10,2) NOT NULL DEFAULT 0.00
        COMMENT 'quantity * unit_price',
    is_taxable      TINYINT(1) NOT NULL DEFAULT 0
        COMMENT '1 = taxable (materials, parts). 0 = labor, fees (CO rules)',
    service_id      INT DEFAULT NULL COMMENT 'Links to service_catalog if labor',
    fee_config_id   INT DEFAULT NULL COMMENT 'Links to fee_configuration if fee',
    tire_id         INT DEFAULT NULL COMMENT 'Links to tire if part/warranty',
    warranty_policy_id INT DEFAULT NULL,
    warranty_expires_at DATE DEFAULT NULL,
    warranty_terms  TEXT DEFAULT NULL,
    display_order   SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_woli_wo       FOREIGN KEY (work_order_id) REFERENCES work_orders(work_order_id),
    CONSTRAINT fk_woli_service  FOREIGN KEY (service_id) REFERENCES service_catalog(service_id),
    CONSTRAINT fk_woli_fee      FOREIGN KEY (fee_config_id) REFERENCES fee_configuration(fee_id),
    CONSTRAINT fk_woli_tire     FOREIGN KEY (tire_id) REFERENCES tires(tire_id),
    CONSTRAINT fk_woli_policy   FOREIGN KEY (warranty_policy_id) REFERENCES warranty_policies(policy_id),
    INDEX idx_woli_wo (work_order_id),
    INDEX idx_woli_type (line_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================================
-- DOMAIN: RATE LIMITING
-- ============================================================================

CREATE TABLE IF NOT EXISTS rate_limit_hits (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    scope_key       VARCHAR(80) NOT NULL COMMENT 'user:123 or ip:1.2.3.4 or apikey:5',
    hit_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX idx_rlh_scope (scope_key, hit_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Auto-cleanup event (runs if event_scheduler is ON)
CREATE EVENT IF NOT EXISTS cleanup_rate_limit_hits
ON SCHEDULE EVERY 1 HOUR
DO DELETE FROM rate_limit_hits WHERE hit_at < DATE_SUB(NOW(), INTERVAL 2 HOUR);


-- ============================================================================
-- DOMAIN: WEBHOOKS
-- ============================================================================

CREATE TABLE IF NOT EXISTS webhook_endpoints (
    endpoint_id     INT AUTO_INCREMENT PRIMARY KEY,
    url             VARCHAR(500) NOT NULL,
    secret          VARCHAR(120) NOT NULL COMMENT 'HMAC-SHA256 signing secret',
    label           VARCHAR(120) DEFAULT NULL,
    events          JSON NOT NULL COMMENT '["WO_CREATE","WO_COMPLETE",...] or ["*"]',
    is_active       TINYINT(1) NOT NULL DEFAULT 1,
    created_by      INT DEFAULT NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_whe_user FOREIGN KEY (created_by) REFERENCES users(user_id),
    INDEX idx_whe_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS webhook_deliveries (
    delivery_id     BIGINT AUTO_INCREMENT PRIMARY KEY,
    endpoint_id     INT NOT NULL,
    event_type      VARCHAR(40) NOT NULL,
    payload         JSON NOT NULL,
    status          ENUM('pending','sent','failed') NOT NULL DEFAULT 'pending',
    response_code   SMALLINT DEFAULT NULL,
    response_body   TEXT DEFAULT NULL,
    attempts        TINYINT NOT NULL DEFAULT 0,
    max_attempts    TINYINT NOT NULL DEFAULT 3,
    next_retry_at   DATETIME DEFAULT NULL,
    error_message   VARCHAR(255) DEFAULT NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at    DATETIME DEFAULT NULL,

    CONSTRAINT fk_whd_endpoint FOREIGN KEY (endpoint_id) REFERENCES webhook_endpoints(endpoint_id) ON DELETE CASCADE,
    INDEX idx_whd_status (status, next_retry_at),
    INDEX idx_whd_endpoint (endpoint_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS webhook_inbound_log (
    inbound_id      BIGINT AUTO_INCREMENT PRIMARY KEY,
    provider        VARCHAR(40) NOT NULL,
    event_type      VARCHAR(60) DEFAULT NULL,
    payload         JSON NOT NULL,
    headers         JSON DEFAULT NULL,
    signature_valid TINYINT(1) DEFAULT NULL,
    processed       TINYINT(1) NOT NULL DEFAULT 0,
    process_result  VARCHAR(255) DEFAULT NULL,
    remote_ip       VARCHAR(45) DEFAULT NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_whi_provider (provider, created_at),
    INDEX idx_whi_processed (processed)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- v1: Full tire inventory with all lookups resolved
CREATE OR REPLACE VIEW v_tire_inventory AS
SELECT
    t.tire_id, t.`condition`, t.cost, t.retail_price,
    b.brand_name, t.model_name,
    tt.type_code, tt.type_label AS tire_type_label,
    t.size_format, t.width_mm, t.aspect_ratio,
    ct.code AS construction, t.wheel_diameter,
    CASE
        WHEN t.size_format = 'metric' THEN CONCAT(t.width_mm, '/', t.aspect_ratio, ct.code, t.wheel_diameter)
        ELSE CONCAT(t.width_mm/10, 'x', t.aspect_ratio/10, ct.code, t.wheel_diameter)
    END AS size_display,
    li.load_index, li.max_load_lbs, li.max_load_kg,
    lid.load_index AS dual_load_index,
    sr.rating_code AS speed_rating, sr.max_mph AS speed_max_mph,
    t.has_zr_designation,
    t.dot_tin_raw, t.dot_plant_code, t.dot_mfg_week, t.dot_mfg_year, t.dot_is_pre2000,
    t.utqg_treadwear,
    tg.grade_code AS traction_grade, tpg.grade_code AS temperature_grade,
    ws.symbol_code AS weather_symbol, cc.code AS cosmetic_code, lc.code AS load_construction,
    t.is_directional, t.is_asymmetrical, t.is_runflat, t.max_psi,
    t.tread_depth_32nds,
    CONCAT(t.bin_facility, t.bin_shelf, t.bin_level) AS bin_display,
    t.bin_facility, t.bin_shelf, t.bin_level,
    aq.source_name AS acquired_from,
    t.status, t.notes, t.created_at, t.updated_at, t.created_by,
    CASE
        WHEN t.dot_mfg_year IS NOT NULL AND t.dot_mfg_week IS NOT NULL THEN
            ROUND(DATEDIFF(CURDATE(),
                STR_TO_DATE(CONCAT(t.dot_mfg_year, ' ', t.dot_mfg_week, ' 1'), '%X %V %w')
            ) / 365.25, 1)
        ELSE NULL
    END AS tire_age_years,
    CASE
        WHEN t.dot_mfg_year IS NOT NULL AND t.dot_mfg_week IS NOT NULL
            AND DATEDIFF(CURDATE(),
                STR_TO_DATE(CONCAT(t.dot_mfg_year, ' ', t.dot_mfg_week, ' 1'), '%X %V %w')
            ) / 365.25 > 6
        THEN 1 ELSE 0
    END AS age_warning
FROM tires t
LEFT JOIN lkp_brands b               ON t.brand_id = b.brand_id
LEFT JOIN lkp_tire_types tt           ON t.tire_type_id = tt.type_id
LEFT JOIN lkp_construction_types ct   ON t.construction_id = ct.construction_id
LEFT JOIN lkp_load_indices li         ON t.load_index_id = li.load_id
LEFT JOIN lkp_load_indices lid        ON t.load_index_dual_id = lid.load_id
LEFT JOIN lkp_speed_ratings sr        ON t.speed_rating_id = sr.speed_id
LEFT JOIN lkp_traction_grades tg      ON t.utqg_traction_id = tg.traction_id
LEFT JOIN lkp_temperature_grades tpg  ON t.utqg_temperature_id = tpg.temperature_id
LEFT JOIN lkp_weather_symbols ws      ON t.weather_symbol_id = ws.weather_id
LEFT JOIN lkp_cosmetic_codes cc       ON t.cosmetic_code_id = cc.cosmetic_id
LEFT JOIN lkp_load_construction lc    ON t.load_constr_id = lc.load_constr_id
LEFT JOIN lkp_acquisition_sources aq  ON t.source_id = aq.source_id;

-- v4: Fee reporting (quarterly, uses work_order_line_items)
CREATE OR REPLACE VIEW v_quarterly_fee_report AS
SELECT YEAR(wo.created_at) AS sale_year,
       QUARTER(wo.created_at) AS sale_quarter,
       fc.fee_key, fc.fee_label,
       COUNT(woli.line_id) AS fee_count,
       COALESCE(SUM(woli.line_total), 0) AS fee_total
FROM work_order_line_items woli
JOIN fee_configuration fc ON woli.fee_config_id = fc.fee_id
JOIN work_orders wo ON woli.work_order_id = wo.work_order_id
WHERE woli.line_type = 'fee'
GROUP BY sale_year, sale_quarter, fc.fee_key, fc.fee_label;

-- v7: Service usage report (uses work_order_line_items)
CREATE OR REPLACE VIEW v_service_usage AS
SELECT sc.service_id, sc.service_code, sc.service_name,
       COUNT(woli.line_id) AS usage_count,
       COALESCE(SUM(woli.line_total), 0) AS total_revenue
FROM service_catalog sc
LEFT JOIN work_order_line_items woli ON sc.service_id = woli.service_id
GROUP BY sc.service_id, sc.service_code, sc.service_name;

-- v8: Open work orders [v2.3]
CREATE OR REPLACE VIEW v_work_orders_open AS
SELECT
    wo.work_order_id, wo.wo_number, wo.status,
    c.first_name, c.last_name, c.phone_primary,
    v.year, v.make, v.model, v.color, v.license_plate,
    u.display_name AS assigned_tech,
    wo.customer_complaint, wo.special_notes,
    TIMESTAMPDIFF(MINUTE, wo.intake_at, NOW()) AS minutes_in_shop,
    wo.intake_at, wo.created_at
FROM work_orders wo
JOIN customers c ON wo.customer_id = c.customer_id
LEFT JOIN vehicles v ON wo.vehicle_id = v.vehicle_id
LEFT JOIN users u ON wo.assigned_tech_id = u.user_id
WHERE wo.status NOT IN ('complete', 'cancelled')
ORDER BY
    FIELD(wo.status, 'intake', 'in_progress', 'quality_check'),
    wo.intake_at ASC;

-- v9: Re-torque due list [v2.3]
CREATE OR REPLACE VIEW v_retorque_due AS
SELECT
    wo.work_order_id, wo.wo_number,
    c.first_name, c.last_name, c.phone_primary, c.phone_secondary,
    v.year, v.make, v.model, v.license_plate,
    wo.retorque_due_date, wo.retorque_due_miles,
    DATEDIFF(CURDATE(), wo.retorque_due_date) AS days_overdue,
    wo.torque_spec_used, wo.completed_at AS service_date
FROM work_orders wo
JOIN customers c ON wo.customer_id = c.customer_id
LEFT JOIN vehicles v ON wo.vehicle_id = v.vehicle_id
WHERE wo.retorque_due_date IS NOT NULL
  AND wo.retorque_completed = 0
  AND wo.status = 'complete'
  AND wo.retorque_due_date <= CURDATE()
ORDER BY wo.retorque_due_date ASC;

-- v10: Vehicle service history
CREATE OR REPLACE VIEW v_vehicle_history AS
SELECT v.vehicle_id, v.vin, v.year, v.make, v.model,
       wo.work_order_id, wo.wo_number, wo.status AS wo_status,
       wo.customer_complaint, wo.completed_at, wo.total_estimate,
       c.customer_id, c.first_name, c.last_name
FROM vehicles v
LEFT JOIN work_orders wo ON v.vehicle_id = wo.vehicle_id
LEFT JOIN customers c ON wo.customer_id = c.customer_id
ORDER BY wo.created_at DESC;

-- v11: Today's appointments [v2.3]
CREATE OR REPLACE VIEW v_appointments_today AS
SELECT
    a.appointment_id, a.appointment_time, a.est_duration_min,
    a.service_requested, a.tire_count, a.status,
    COALESCE(CONCAT(c.first_name, ' ', c.last_name), a.customer_name) AS customer_display,
    COALESCE(c.phone_primary, a.customer_phone) AS phone,
    v.year, v.make, v.model, v.license_plate,
    a.work_order_id, a.notes
FROM appointments a
LEFT JOIN customers c ON a.customer_id = c.customer_id
LEFT JOIN vehicles v ON a.vehicle_id = v.vehicle_id

-- v13: Open purchase orders
CREATE OR REPLACE VIEW v_purchase_orders_open AS
SELECT po.po_id, po.po_number, po.status,
       v.vendor_name, v.contact_name,
       po.order_date, po.expected_delivery,
       (SELECT COUNT(*) FROM po_line_items pli WHERE pli.po_id = po.po_id) AS line_count,
       (SELECT COALESCE(SUM(pli.quantity_ordered * pli.unit_cost), 0) FROM po_line_items pli WHERE pli.po_id = po.po_id) AS total_cost
FROM purchase_orders po
JOIN vendors v ON po.vendor_id = v.vendor_id
WHERE po.status IN ('draft', 'submitted', 'partial');

-- ============================================================================
-- END OF BASE SCHEMA (v2.3: 41 tables, 13 views)
-- ============================================================================


-- ============================================================================
-- DOMAIN 18: VEHICLE LOOKUP (3 tables, 1 view) [v2.4]
-- ============================================================================
-- Adds: lkp_torque_specs, plate_lookup_cache, plate_lookup_log
-- View: v_plate_lookup_monthly_cost
-- Seed data: 410 rows, 34 makes, 1995 to 2021 model years
-- Source: Halderman "Lug Nut Torque Values" compiled from OEM service manuals
-- ============================================================================

CREATE TABLE IF NOT EXISTS lkp_torque_specs (
    spec_id         INT AUTO_INCREMENT PRIMARY KEY,
    make            VARCHAR(50)     NOT NULL,
    model           VARCHAR(100)    NOT NULL,
    year_start      SMALLINT UNSIGNED NOT NULL,
    year_end        SMALLINT UNSIGNED NOT NULL,
    torque_ft_lbs_min SMALLINT UNSIGNED NOT NULL,
    torque_ft_lbs_max SMALLINT UNSIGNED NOT NULL,
    lug_size_mm     VARCHAR(10)     DEFAULT NULL COMMENT 'Lug nut size (mm or fractional inch)',
    lug_count       TINYINT UNSIGNED DEFAULT NULL COMMENT 'Number of lugs per wheel',
    notes           VARCHAR(255)    DEFAULT NULL COMMENT 'Exceptions: wheel type, trim, nut color, etc.',
    source          VARCHAR(100)    DEFAULT 'Halderman 1995-2021' COMMENT 'Data source reference',
    is_verified     TINYINT(1)      NOT NULL DEFAULT 1 COMMENT '1=from published source, 0=user-entered',
    entered_by      INT             DEFAULT NULL COMMENT 'User who entered this spec (NULL for seed data)',
    verified_by     INT             DEFAULT NULL COMMENT 'User who verified a user-entered spec',
    verified_at     DATETIME        DEFAULT NULL COMMENT 'When the spec was verified',
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_torque_entered_by  FOREIGN KEY (entered_by) REFERENCES users(user_id),
    CONSTRAINT fk_torque_verified_by FOREIGN KEY (verified_by) REFERENCES users(user_id),
    INDEX idx_torque_make_model (make, model),
    INDEX idx_torque_year_range (year_start, year_end),
    INDEX idx_torque_unverified (is_verified, entered_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- TABLE: plate_lookup_cache
-- =============================================================================
-- Caches license plate API responses to avoid duplicate API calls for the same
-- plate. Cache entries expire after 90 days (plates can be transferred).
-- =============================================================================

CREATE TABLE IF NOT EXISTS plate_lookup_cache (
    cache_id        INT AUTO_INCREMENT PRIMARY KEY,
    plate_number    VARCHAR(15)     NOT NULL,
    plate_state     CHAR(2)         NOT NULL,
    vin             VARCHAR(17)     DEFAULT NULL,
    year            SMALLINT UNSIGNED DEFAULT NULL,
    make            VARCHAR(50)     DEFAULT NULL,
    model           VARCHAR(100)    DEFAULT NULL,
    trim_level      VARCHAR(100)    DEFAULT NULL,
    body_style      VARCHAR(50)     DEFAULT NULL,
    engine          VARCHAR(100)    DEFAULT NULL,
    drive_type      VARCHAR(20)     DEFAULT NULL,
    color           VARCHAR(30)     DEFAULT NULL,
    api_provider    VARCHAR(50)     NOT NULL DEFAULT 'PlateToVIN',
    api_response    JSON            DEFAULT NULL COMMENT 'Full API response for reference',
    cached_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at      DATETIME        NOT NULL,

    UNIQUE INDEX idx_plate_state (plate_number, plate_state),
    INDEX idx_cache_expiry (expires_at),
    INDEX idx_cache_vin (vin)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- TABLE: plate_lookup_log
-- =============================================================================
-- Tracks every API call for cost monitoring and usage auditing.
-- PlateToVIN charges $0.05 per call; this table enables monthly cost reports.
-- =============================================================================

CREATE TABLE IF NOT EXISTS plate_lookup_log (
    log_id          INT AUTO_INCREMENT PRIMARY KEY,
    plate_number    VARCHAR(15)     NOT NULL,
    plate_state     CHAR(2)         NOT NULL,
    api_provider    VARCHAR(50)     NOT NULL,
    api_endpoint    VARCHAR(255)    NOT NULL,
    http_status     SMALLINT UNSIGNED DEFAULT NULL,
    success         TINYINT(1)      NOT NULL DEFAULT 0,
    cost_cents      SMALLINT UNSIGNED NOT NULL DEFAULT 5 COMMENT 'Cost per call in cents',
    response_ms     INT UNSIGNED    DEFAULT NULL COMMENT 'API response time in milliseconds',
    error_message   VARCHAR(255)    DEFAULT NULL,
    user_id         INT             DEFAULT NULL,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_lookup_log_date (created_at),
    INDEX idx_lookup_log_user (user_id),
    CONSTRAINT fk_lookup_log_user FOREIGN KEY (user_id) REFERENCES users(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- VIEW: v_plate_lookup_monthly_cost
-- =============================================================================
-- Monthly cost report for API usage.
-- =============================================================================

CREATE OR REPLACE VIEW v_plate_lookup_monthly_cost AS
SELECT
    DATE_FORMAT(created_at, '%Y-%m') AS month,
    api_provider,
    COUNT(*)                         AS total_calls,
    SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS successful_calls,
    SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS failed_calls,
    SUM(cost_cents) / 100.0          AS total_cost_usd,
    AVG(response_ms)                 AS avg_response_ms
FROM plate_lookup_log
GROUP BY DATE_FORMAT(created_at, '%Y-%m'), api_provider;


-- =============================================================================
-- SEED DATA: lkp_torque_specs
-- =============================================================================
-- Parsed from Halderman "Lug Nut Torque Values 1995-2021"
-- 410 rows, 34 makes, model years 1995 through 2021
-- Format: (make, model, year_start, year_end, torque_min, torque_max, lug_size, lug_count, notes, source)
-- =============================================================================

INSERT INTO lkp_torque_specs (make, model, year_start, year_end, torque_ft_lbs_min, torque_ft_lbs_max, lug_size_mm, notes) VALUES

-- ===== ACURA =====
('Acura', 'MDX', 2007, 2013, 94, 94, '19', NULL),
('Acura', 'NSX', 2017, 2021, 125, 125, NULL, NULL),
('Acura', 'RL', 2005, 2020, 94, 94, '19', 'Includes RLX'),
('Acura', 'SLX', 1996, 1999, 87, 87, '19', NULL),
('Acura', 'TL', 2009, 2014, 94, 94, '19', NULL),
('Acura', 'TLX', 2021, 2021, 94, 94, NULL, NULL),
('Acura', 'ZDX', 2007, 2013, 94, 94, '19', NULL),
('Acura', 'All Other Car Models', 1995, 2021, 80, 80, '19', NULL),
('Acura', 'All Other Light Truck/SUV/Van', 2001, 2021, 80, 80, NULL, NULL),

-- ===== ALFA ROMEO =====
('Alfa Romeo', 'Giulia', 2017, 2021, 89, 89, NULL, NULL),
('Alfa Romeo', 'Stelvio', 2018, 2021, 89, 89, NULL, NULL),
('Alfa Romeo', 'All Other Car Models', 1995, 2020, 72, 72, NULL, NULL),

-- ===== AUDI =====
('Audi', 'All Models', 1995, 1997, 81, 81, '17', NULL),
('Audi', 'Cabriolet', 1995, 1998, 81, 81, '17', NULL),
('Audi', 'E-Tron Quattro', 2019, 2021, 120, 120, NULL, NULL),
('Audi', 'e-tron Sportback', 2020, 2021, 120, 120, NULL, NULL),
('Audi', 'Q7', 2007, 2021, 118, 118, '19', NULL),
('Audi', 'Q8', 2007, 2021, 118, 118, NULL, 'Includes RS Q8, SQ7, SQ8'),
('Audi', 'All Other Car Models', 1998, 2021, 89, 89, '17', NULL),
('Audi', 'All Other Light Truck/SUV/Van', 2009, 2021, 103, 103, NULL, NULL),

-- ===== BMW =====
('BMW', '2 Series', 2014, 2021, 103, 103, '17', NULL),
('BMW', '3 Series', 2012, 2021, 103, 103, '17', 'Sedan and Sports Wagon'),
('BMW', '4 Series', 2014, 2021, 103, 103, '17', NULL),
('BMW', '5 Series', 2011, 2021, 103, 103, '17', 'Includes 6 Series'),
('BMW', '7 Series', 2002, 2021, 103, 103, '17', 'Includes 8 Series'),
('BMW', 'i3', 2014, 2021, 103, 103, NULL, 'Includes i3s, i8'),
('BMW', 'X1', 2012, 2015, 88, 88, '17', NULL),
('BMW', 'Z4', 2019, 2021, 103, 103, NULL, NULL),
('BMW', 'All Other Car Models', 1995, 2016, 88, 88, '17', NULL),
('BMW', 'All Other Light Truck/SUV/Van', 2000, 2021, 103, 103, NULL, NULL),

-- ===== BUICK =====
('Buick', 'Enclave', 2008, 2021, 140, 140, NULL, NULL),
('Buick', 'Envision', 2019, 2021, 140, 140, NULL, NULL),
('Buick', 'LaCrosse', 2010, 2016, 110, 110, '22', NULL),
('Buick', 'Regal', 2011, 2017, 110, 110, '22', NULL),
('Buick', 'All Other Models', 1995, 2021, 100, 100, '19', NULL),

-- ===== CADILLAC =====
('Cadillac', 'ATS-V/CTS', 2017, 2019, 140, 140, NULL, NULL),
('Cadillac', 'Catera', 1997, 2001, 80, 80, '17', NULL),
('Cadillac', 'CT5', 2020, 2021, 140, 140, NULL, NULL),
('Cadillac', 'CT6', 2016, 2020, 110, 110, NULL, NULL),
('Cadillac', 'CTS', 2008, 2012, 140, 140, '22', NULL),
('Cadillac', 'CTS', 2013, 2015, 110, 110, '22', NULL),
('Cadillac', 'Deville H.D. Special', 1997, 1999, 140, 140, NULL, NULL),
('Cadillac', 'SRX', 2004, 2009, 100, 100, NULL, NULL),
('Cadillac', 'SRX', 2010, 2013, 110, 110, NULL, NULL),
('Cadillac', 'XTS', 2013, 2019, 110, 110, '22', NULL),
('Cadillac', 'All Other Light Truck/SUV/Van', 1999, 2021, 140, 140, NULL, NULL),
('Cadillac', 'All Other Car Models', 1995, 2021, 100, 100, '19', NULL),

-- ===== CHEVROLET =====
('Chevrolet', 'Avalanche', 2002, 2013, 140, 140, NULL, NULL),
('Chevrolet', 'Aveo', 2004, 2010, 81, 81, '19', 'Includes Aveo5'),
('Chevrolet', 'Blazer', 1995, 1997, 95, 95, NULL, NULL),
('Chevrolet', 'Blazer', 1998, 2005, 100, 100, NULL, NULL),
('Chevrolet', 'Blazer', 2019, 2021, 140, 140, NULL, NULL),
('Chevrolet', 'Camaro', 2010, 2011, 140, 140, '22', NULL),
('Chevrolet', 'Camaro', 2013, 2015, 110, 110, '22', NULL),
('Chevrolet', 'Camaro', 2016, 2021, 140, 140, NULL, NULL),
('Chevrolet', 'Colorado', 2004, 2012, 100, 100, NULL, NULL),
('Chevrolet', 'Colorado', 2015, 2021, 140, 140, NULL, NULL),
('Chevrolet', 'Corvette', 2020, 2021, 140, 140, NULL, NULL),
('Chevrolet', 'Equinox', 2002, 2009, 100, 100, NULL, NULL),
('Chevrolet', 'Equinox', 2010, 2017, 140, 140, NULL, NULL),
('Chevrolet', 'Equinox', 2018, 2021, 100, 100, NULL, NULL),
('Chevrolet', 'Express', 1996, 2021, 140, 140, NULL, NULL),
('Chevrolet', 'Impala', 2014, 2020, 110, 110, '19', NULL),
('Chevrolet', 'Malibu', 2013, 2015, 110, 110, '22', NULL),
('Chevrolet', 'Metro', 1995, 2001, 45, 45, '17', NULL),
('Chevrolet', 'Prizm', 1995, 2002, 76, 76, '21', NULL),
('Chevrolet', 'Silverado', 1999, 2021, 140, 140, NULL, NULL),
('Chevrolet', 'Suburban', 1996, 2021, 140, 140, NULL, NULL),
('Chevrolet', 'Tahoe', 1996, 2021, 140, 140, NULL, NULL),
('Chevrolet', 'Trailblazer', 2002, 2021, 100, 100, NULL, NULL),
('Chevrolet', 'Traverse', 2007, 2021, 140, 140, NULL, NULL),
('Chevrolet', 'Trax', 2013, 2021, 100, 100, NULL, NULL),
('Chevrolet', 'All Other Car Models', 1995, 2021, 100, 100, '19', NULL),

-- ===== CHRYSLER =====
('Chrysler', 'Crossfire', 2004, 2008, 81, 81, '17', NULL),
('Chrysler', '300', 2011, 2013, 110, 110, NULL, NULL),
('Chrysler', '300', 2014, 2021, 130, 130, '21', NULL),
('Chrysler', 'Aspen', 2007, 2009, 135, 135, NULL, NULL),
('Chrysler', 'All SUV/Van/Truck', 2012, 2021, 100, 100, NULL, NULL),
('Chrysler', 'All Other Light Truck/SUV/Van', 1995, 2011, 95, 95, NULL, NULL),
('Chrysler', 'All Other Car Models', 1995, 2017, 100, 100, NULL, NULL),

-- ===== DODGE =====
('Dodge', 'Avenger', 1995, 1998, 85, 100, '19', NULL),
('Dodge', 'Avenger', 2008, 2014, 100, 100, NULL, NULL),
('Dodge', 'Caliber', 2007, 2012, 100, 100, NULL, NULL),
('Dodge', 'Caravan', 1995, 2011, 95, 95, NULL, 'Includes Grand Caravan'),
('Dodge', 'Challenger', 2008, 2010, 100, 100, NULL, NULL),
('Dodge', 'Challenger', 2011, 2013, 110, 110, NULL, NULL),
('Dodge', 'Challenger', 2014, 2021, 130, 130, NULL, NULL),
('Dodge', 'Challenger SRT', 2015, 2021, 111, 111, NULL, NULL),
('Dodge', 'Charger', 2006, 2010, 100, 100, NULL, NULL),
('Dodge', 'Charger', 2011, 2013, 110, 110, NULL, NULL),
('Dodge', 'Charger', 2014, 2021, 130, 130, NULL, NULL),
('Dodge', 'Charger SRT', 2015, 2021, 111, 111, NULL, NULL),
('Dodge', 'Dakota', 1995, 2004, 85, 115, NULL, NULL),
('Dodge', 'Dakota', 2005, 2010, 135, 135, NULL, NULL),
('Dodge', 'Dart', 2013, 2016, 100, 100, NULL, NULL),
('Dodge', 'Durango', 1998, 2003, 85, 115, NULL, NULL),
('Dodge', 'Durango', 2004, 2009, 135, 135, NULL, NULL),
('Dodge', 'Durango', 2011, 2013, 110, 110, NULL, NULL),
('Dodge', 'Durango', 2014, 2021, 130, 130, NULL, NULL),
('Dodge', 'Grand Caravan', 2012, 2020, 100, 100, NULL, NULL),
('Dodge', 'Journey', 2009, 2013, 95, 95, NULL, NULL),
('Dodge', 'Journey', 2014, 2020, 100, 100, NULL, NULL),
('Dodge', 'Magnum', 2005, 2008, 100, 100, NULL, NULL),
('Dodge', 'Neon', 1995, 2005, 85, 115, NULL, NULL),
('Dodge', 'Nitro', 2007, 2011, 95, 95, NULL, NULL),
('Dodge', 'Ram 1500', 1995, 2001, 80, 110, NULL, NULL),
('Dodge', 'Ram 1500', 2002, 2008, 135, 135, NULL, NULL),
('Dodge', 'Ram 1500', 2009, 2010, 130, 130, NULL, NULL),
('Dodge', 'Ram 2500', 1995, 2001, 120, 150, NULL, NULL),
('Dodge', 'Ram 2500', 2002, 2010, 135, 135, NULL, NULL),
('Dodge', 'Ram 3500', 1995, 2001, 130, 160, NULL, NULL),
('Dodge', 'Ram 3500', 2003, 2010, 135, 135, NULL, NULL),
('Dodge', 'Ram 3500 DRW', 2003, 2010, 145, 145, NULL, 'Dual rear wheels'),
('Dodge', 'Viper', 1995, 2014, 80, 100, NULL, NULL),
('Dodge', 'Viper', 2015, 2017, 107, 107, NULL, NULL),

-- ===== FIAT =====
('Fiat', '124 Spider', 2017, 2020, 94, 94, NULL, NULL),
('Fiat', '500', 2012, 2019, 75, 75, '19', NULL),
('Fiat', '500 Steel Wheels', 2012, 2013, 63, 63, '19', 'Steel wheels only'),
('Fiat', '500 Steel Wheels', 2014, 2016, 66, 66, '19', 'Steel wheels only'),
('Fiat', '500L', 2014, 2020, 89, 89, '19', NULL),
('Fiat', '500X', 2016, 2021, 89, 89, NULL, NULL),

-- ===== FORD =====
('Ford', 'Bronco Sport', 2021, 2021, 100, 100, NULL, NULL),
('Ford', 'C-Max', 2013, 2018, 100, 100, '19', NULL),
('Ford', 'Crown Victoria', 1995, 2003, 85, 105, NULL, NULL),
('Ford', 'Crown Victoria', 2004, 2011, 100, 100, NULL, NULL),
('Ford', 'E-150', 1995, 2006, 100, 100, '19', NULL),
('Ford', 'E-150', 2007, 2014, 140, 150, NULL, NULL),
('Ford', 'E-250', 1995, 2007, 140, 140, NULL, NULL),
('Ford', 'E-250', 2008, 2014, 140, 150, NULL, NULL),
('Ford', 'E-350', 1995, 2007, 140, 140, NULL, NULL),
('Ford', 'E-350', 2008, 2014, 140, 150, NULL, NULL),
('Ford', 'EcoSport', 2018, 2021, 100, 100, NULL, NULL),
('Ford', 'Edge', 2007, 2014, 100, 100, NULL, NULL),
('Ford', 'Edge', 2015, 2021, 162, 162, NULL, NULL),
('Ford', 'Escape', 2001, 2021, 100, 100, NULL, NULL),
('Ford', 'Escort', 1995, 2003, 65, 87, '21', NULL),
('Ford', 'Excursion', 2000, 2005, 165, 165, NULL, NULL),
('Ford', 'Expedition 19mm', 1997, 2000, 100, 100, '19', '19mm hex lug'),
('Ford', 'Expedition 21mm', 2000, 2021, 150, 150, '21', '21mm hex lug'),
('Ford', 'Explorer', 1995, 2019, 100, 100, NULL, NULL),
('Ford', 'Explorer', 2020, 2021, 150, 150, NULL, NULL),
('Ford', 'F-150', 1995, 1999, 100, 100, NULL, NULL),
('Ford', 'F-150', 2001, 2021, 150, 150, NULL, NULL),
('Ford', 'F-250', 1995, 1996, 140, 140, NULL, NULL),
('Ford', 'F-250', 1999, 2004, 150, 165, NULL, 'Super Duty'),
('Ford', 'F-250', 2005, 2008, 150, 150, NULL, NULL),
('Ford', 'F-250', 2009, 2019, 165, 165, NULL, NULL),
('Ford', 'F-250', 2020, 2021, 150, 150, NULL, NULL),
('Ford', 'F-350', 1995, 1997, 140, 140, NULL, NULL),
('Ford', 'F-350 Super Duty', 1999, 2004, 150, 165, NULL, NULL),
('Ford', 'F-350 Super Duty', 2005, 2008, 150, 150, NULL, NULL),
('Ford', 'F-350 Super Duty', 2009, 2019, 165, 165, NULL, NULL),
('Ford', 'F-350 Super Duty', 2020, 2021, 150, 150, NULL, NULL),
('Ford', 'Fiesta', 2011, 2013, 98, 98, '19', NULL),
('Ford', 'Fiesta', 2014, 2019, 100, 100, '19', NULL),
('Ford', 'Flex', 2004, 2019, 100, 100, NULL, NULL),
('Ford', 'Focus', 2000, 2005, 94, 94, '19', NULL),
('Ford', 'Focus', 2006, 2020, 100, 100, NULL, NULL),
('Ford', 'Fusion', 2006, 2020, 100, 100, NULL, NULL),
('Ford', 'Fusion Sport', 2017, 2019, 150, 150, NULL, NULL),
('Ford', 'Mustang', 1995, 2004, 85, 105, '19', NULL),
('Ford', 'Mustang', 2005, 2014, 100, 100, '19', NULL),
('Ford', 'Mustang', 2015, 2021, 150, 150, '19', NULL),
('Ford', 'Mustang Mach-E', 2021, 2021, 150, 150, NULL, NULL),
('Ford', 'Ranger', 1995, 2021, 100, 100, NULL, NULL),
('Ford', 'Taurus', 1995, 2003, 85, 105, NULL, NULL),
('Ford', 'Taurus', 2004, 2019, 100, 100, NULL, NULL),
('Ford', 'Transit', 2015, 2021, 150, 150, NULL, NULL),
('Ford', 'Transit Connect', 2010, 2011, 66, 66, NULL, NULL),
('Ford', 'Transit Connect', 2012, 2018, 100, 100, NULL, NULL),
('Ford', 'Transit Connect', 2019, 2021, 150, 150, NULL, NULL),

-- ===== GENESIS =====
('Genesis', 'GV80', 2021, 2021, 101, 116, NULL, NULL),
('Genesis', 'G70', 2017, 2021, 79, 94, NULL, NULL),
('Genesis', 'G80', 2017, 2017, 65, 80, NULL, NULL),
('Genesis', 'G80', 2018, 2020, 79, 94, NULL, NULL),
('Genesis', 'G80', 2021, 2021, 101, 116, NULL, NULL),
('Genesis', 'G90', 2017, 2021, 79, 94, NULL, NULL),

-- ===== GMC =====
('GMC', 'Acadia', 2007, 2021, 140, 140, NULL, NULL),
('GMC', 'Canyon', 2004, 2012, 100, 100, NULL, NULL),
('GMC', 'Canyon', 2015, 2021, 140, 140, NULL, NULL),
('GMC', 'Envoy', 2002, 2009, 100, 100, NULL, NULL),
('GMC', 'Sierra', 1999, 2021, 140, 140, NULL, NULL),
('GMC', 'Terrain', 2010, 2017, 140, 140, NULL, NULL),
('GMC', 'Terrain', 2018, 2021, 100, 100, NULL, NULL),
('GMC', 'Yukon', 1996, 2021, 140, 140, NULL, NULL),
('GMC', 'All Other Car Models', 1995, 2021, 100, 100, NULL, NULL),

-- ===== HONDA =====
('Honda', 'Civic Type R', 2017, 2021, 94, 94, NULL, NULL),
('Honda', 'Odyssey', 2005, 2021, 94, 94, NULL, NULL),
('Honda', 'Passport', 1995, 2002, 65, 65, NULL, NULL),
('Honda', 'Passport Alloy', 1995, 2002, 87, 87, NULL, 'Aluminum wheels'),
('Honda', 'Passport', 2019, 2021, 94, 94, NULL, NULL),
('Honda', 'Pilot', 2009, 2021, 94, 94, NULL, NULL),
('Honda', 'Ridgeline', 2005, 2021, 94, 94, NULL, NULL),
('Honda', 'All Other Car Models', 1995, 2021, 80, 80, '19', NULL),
('Honda', 'All Other Light Truck/SUV/Van', 1995, 2021, 80, 80, NULL, NULL),

-- ===== HYUNDAI =====
('Hyundai', 'Accent', 2018, 2021, 79, 94, NULL, NULL),
('Hyundai', 'Elantra', 2017, 2021, 79, 94, NULL, 'Includes Elantra GT'),
('Hyundai', 'Ioniq', 2017, 2021, 79, 94, NULL, NULL),
('Hyundai', 'Sonata', 2018, 2021, 79, 94, NULL, 'Includes Veloster'),
('Hyundai', 'All Other Car Models', 1995, 2017, 65, 80, '21', NULL),
('Hyundai', 'All Other Light Truck/SUV/Van', 2001, 2017, 65, 80, NULL, NULL),
('Hyundai', 'All Other Light Truck/SUV/Van', 2018, 2021, 79, 94, NULL, NULL),

-- ===== INFINITI =====
('Infiniti', 'QX4', 1997, 2021, 98, 98, NULL, 'Includes QX56, QX80'),
('Infiniti', 'QX30', 2017, 2019, 96, 96, NULL, NULL),
('Infiniti', 'QX50', 2019, 2021, 83, 83, NULL, NULL),
('Infiniti', 'QX60', 2013, 2020, 83, 83, NULL, 'Includes JX35'),
('Infiniti', 'All Other Models', 1995, 2021, 80, 80, '21', NULL),

-- ===== JAGUAR =====
('Jaguar', 'E-Pace', 2018, 2021, 98, 98, NULL, NULL),
('Jaguar', 'F-Pace', 2017, 2018, 103, 103, NULL, NULL),
('Jaguar', 'F-Pace', 2019, 2021, 98, 98, NULL, NULL),
('Jaguar', 'F-Type', 2014, 2021, 92, 92, '19', 'Includes XE'),
('Jaguar', 'I-Pace', 2019, 2019, 92, 92, NULL, NULL),
('Jaguar', 'I-Pace', 2020, 2021, 98, 98, NULL, NULL),
('Jaguar', 'S-Type', 2000, 2008, 92, 92, '19', NULL),
('Jaguar', 'XF/XJ', 2004, 2021, 92, 92, NULL, 'Includes XFR, XJ8, XJR'),
('Jaguar', 'XK/XKR', 2007, 2015, 92, 92, NULL, 'Includes XKR-S'),
('Jaguar', 'All Other Car Models', 1995, 2009, 75, 75, '19', NULL),

-- ===== JEEP =====
('Jeep', 'Cherokee', 1995, 2001, 85, 115, NULL, NULL),
('Jeep', 'Cherokee', 2014, 2021, 100, 100, NULL, NULL),
('Jeep', 'Commander', 2006, 2010, 95, 95, NULL, NULL),
('Jeep', 'Compass', 2007, 2021, 100, 100, NULL, NULL),
('Jeep', 'Gladiator', 2020, 2021, 130, 130, NULL, NULL),
('Jeep', 'Grand Cherokee', 1995, 2004, 85, 115, NULL, NULL),
('Jeep', 'Grand Cherokee', 2005, 2010, 95, 95, NULL, NULL),
('Jeep', 'Grand Cherokee', 2011, 2013, 110, 110, NULL, NULL),
('Jeep', 'Grand Cherokee', 2014, 2021, 130, 130, NULL, NULL),
('Jeep', 'Grand Cherokee SRT', 2015, 2021, 110, 110, NULL, NULL),
('Jeep', 'Liberty', 2000, 2004, 85, 110, NULL, NULL),
('Jeep', 'Liberty', 2005, 2012, 95, 95, NULL, NULL),
('Jeep', 'Patriot', 2007, 2021, 100, 100, NULL, NULL),
('Jeep', 'Renegade', 2015, 2021, 89, 89, NULL, NULL),
('Jeep', 'Wrangler JK', 2014, 2018, 100, 100, NULL, NULL),
('Jeep', 'Wrangler JL', 2018, 2021, 130, 130, NULL, NULL),
('Jeep', 'Wrangler TJ', 1995, 2004, 85, 110, NULL, NULL),
('Jeep', 'Wrangler TJ', 2005, 2013, 95, 95, NULL, NULL),

-- ===== KIA =====
('Kia', 'Cadenza', 2017, 2021, 79, 94, NULL, NULL),
('Kia', 'Forte', 2018, 2021, 79, 94, NULL, 'Includes Forte5'),
('Kia', 'Niro', 2017, 2021, 79, 84, NULL, 'Includes Niro EV'),
('Kia', 'Optima', 2017, 2021, 79, 94, NULL, NULL),
('Kia', 'Rio', 2001, 2005, 65, 87, '21', NULL),
('Kia', 'Rio', 2018, 2021, 79, 94, NULL, NULL),
('Kia', 'Sedona', 2019, 2021, 79, 94, NULL, NULL),
('Kia', 'Seltos', 2019, 2021, 79, 94, NULL, NULL),
('Kia', 'Sorento', 2003, 2009, 65, 87, NULL, NULL),
('Kia', 'Sorento', 2019, 2021, 79, 94, NULL, NULL),
('Kia', 'Soul', 2017, 2021, 79, 94, NULL, NULL),
('Kia', 'Sportage', 1995, 2002, 65, 87, NULL, NULL),
('Kia', 'Sportage', 2017, 2021, 79, 94, NULL, NULL),
('Kia', 'Stinger', 2018, 2021, 79, 94, NULL, NULL),
('Kia', 'Telluride', 2019, 2021, 79, 94, NULL, NULL),
('Kia', 'All Other Car Models', 2001, 2019, 65, 80, '21', NULL),
('Kia', 'All Other Light Truck/SUV/Van', 2002, 2018, 65, 80, NULL, NULL),

-- ===== LAND ROVER =====
('Land Rover', 'Defender', 1995, 1998, 90, 95, NULL, NULL),
('Land Rover', 'Defender', 1999, 2021, 103, 103, NULL, NULL),
('Land Rover', 'Discovery', 1995, 1998, 90, 95, NULL, NULL),
('Land Rover', 'Discovery', 1999, 2021, 103, 103, NULL, NULL),
('Land Rover', 'Discovery Sport', 2015, 2021, 98, 98, NULL, NULL),
('Land Rover', 'Range Rover', 2003, 2012, 103, 103, NULL, NULL),
('Land Rover', 'Range Rover', 2013, 2018, 98, 98, NULL, NULL),
('Land Rover', 'Range Rover', 2019, 2021, 103, 103, NULL, NULL),
('Land Rover', 'Range Rover Evoque', 2012, 2021, 98, 98, NULL, NULL),
('Land Rover', 'Range Rover Sport', 2011, 2018, 98, 98, NULL, NULL),
('Land Rover', 'Range Rover Sport', 2019, 2021, 103, 103, NULL, NULL),
('Land Rover', 'Range Rover Velar', 2018, 2021, 98, 98, NULL, NULL),

-- ===== LEXUS =====
('Lexus', 'GX460/470', 2003, 2014, 83, 83, NULL, NULL),
('Lexus', 'IS 300/350', 2021, 2021, 103, 103, NULL, NULL),
('Lexus', 'LC500', 2018, 2021, 103, 103, NULL, 'Includes LC500h'),
('Lexus', 'LS460/500', 2007, 2021, 103, 103, NULL, 'Includes LS500h, LS600h'),
('Lexus', 'LX470/570', 1998, 2021, 97, 97, NULL, NULL),
('Lexus', 'All Other Car Models', 1995, 2021, 76, 76, '21', NULL),
('Lexus', 'All Other Light Truck/SUV/Van', 1996, 2021, 76, 76, NULL, NULL),

-- ===== LINCOLN =====
('Lincoln', 'Aviator', 2003, 2005, 100, 100, NULL, NULL),
('Lincoln', 'Aviator', 2020, 2021, 150, 150, NULL, NULL),
('Lincoln', 'Continental', 2017, 2020, 162, 162, NULL, NULL),
('Lincoln', 'Corsair', 2020, 2021, 100, 100, NULL, NULL),
('Lincoln', 'MKX', 2016, 2018, 162, 162, NULL, NULL),
('Lincoln', 'MKZ', 2017, 2020, 150, 150, NULL, NULL),
('Lincoln', 'Nautilus', 2019, 2021, 162, 162, NULL, NULL),
('Lincoln', 'Navigator 19mm', 1998, 2000, 100, 100, '19', '19mm hex'),
('Lincoln', 'Navigator 21mm', 2000, 2021, 150, 150, '21', '21mm hex'),
('Lincoln', 'Town Car', 2004, 2011, 100, 100, NULL, NULL),
('Lincoln', 'All Other Car Models', 1995, 2003, 85, 105, NULL, NULL),

-- ===== MAZDA =====
('Mazda', 'CX-3', 2007, 2021, 80, 108, NULL, NULL),
('Mazda', 'CX-30', 2007, 2021, 80, 108, NULL, NULL),
('Mazda', 'CX-5', 2007, 2021, 80, 108, NULL, NULL),
('Mazda', 'CX-9', 2007, 2021, 80, 108, NULL, NULL),
('Mazda', 'Mazda3', 2014, 2021, 80, 108, NULL, 'Includes Mazda3 Sport'),
('Mazda', 'Mazda6', 2014, 2021, 80, 108, NULL, NULL),
('Mazda', 'MX-5 Miata', 2016, 2021, 80, 108, NULL, NULL),
('Mazda', 'Tribute', 2001, 2011, 100, 100, NULL, NULL),
('Mazda', 'All Other Car Models', 1995, 2015, 65, 87, '21', NULL),

-- ===== MERCEDES-BENZ =====
('Mercedes-Benz', 'A220/A250', 2019, 2021, 96, 96, NULL, NULL),
('Mercedes-Benz', 'AMG GT 2 Door', 2016, 2021, 133, 133, NULL, NULL),
('Mercedes-Benz', 'AMG GT 4 Door', 2019, 2021, 111, 111, NULL, NULL),
('Mercedes-Benz', 'B Class', 2013, 2019, 96, 96, NULL, NULL),
('Mercedes-Benz', 'C Class', 2008, 2021, 96, 96, '17', NULL),
('Mercedes-Benz', 'CL', 1998, 2014, 110, 110, NULL, NULL),
('Mercedes-Benz', 'CLA', 2008, 2021, 96, 96, NULL, NULL),
('Mercedes-Benz', 'CLS', 2006, 2018, 96, 96, NULL, NULL),
('Mercedes-Benz', 'CLS 450/53 AMG', 2019, 2021, 111, 111, NULL, NULL),
('Mercedes-Benz', 'E Class', 2003, 2017, 96, 96, NULL, NULL),
('Mercedes-Benz', 'E Class', 2018, 2021, 111, 111, NULL, NULL),
('Mercedes-Benz', 'G Class', 2002, 2021, 96, 96, NULL, NULL),
('Mercedes-Benz', 'AMG G63', 2019, 2021, 111, 111, NULL, NULL),
('Mercedes-Benz', 'GLC', 2002, 2021, 96, 96, NULL, 'Includes GLA, GLB'),
('Mercedes-Benz', 'GLC 300/350e/43/63', 2018, 2021, 111, 111, NULL, NULL),
('Mercedes-Benz', 'S Class', 1995, 2021, 110, 110, NULL, 'Includes SD, SEC'),
('Mercedes-Benz', 'SL Class', 2003, 2020, 96, 96, NULL, 'Includes SLC, SLK, SLR'),
('Mercedes-Benz', 'SLS AMG', 2013, 2015, 133, 133, NULL, NULL),
('Mercedes-Benz', 'Sprinter Alloy', 2003, 2021, 133, 133, NULL, 'Alloy wheels'),
('Mercedes-Benz', 'Sprinter Steel', 2003, 2021, 177, 177, NULL, 'Steel wheels'),
('Mercedes-Benz', 'Metris Alloy', 2016, 2021, 133, 133, NULL, 'Alloy wheels'),
('Mercedes-Benz', 'Metris Steel', 2016, 2021, 147, 147, NULL, 'Steel wheels'),
('Mercedes-Benz', 'All Other Light Truck/SUV/Van', 1998, 2021, 110, 110, NULL, NULL),
('Mercedes-Benz', 'All Other Car Models', 1995, 2011, 81, 81, '17', NULL),

-- ===== MITSUBISHI =====
('Mitsubishi', 'Eclipse Cross', 2018, 2020, 65, 80, NULL, NULL),
('Mitsubishi', 'Outlander', 2003, 2021, 65, 80, NULL, 'Includes Outlander Sport'),
('Mitsubishi', 'Raider', 2006, 2009, 125, 145, NULL, NULL),
('Mitsubishi', 'All Other Car Models', 1995, 2021, 65, 80, '21', NULL),

-- ===== NISSAN =====
('Nissan', 'Altima', 2007, 2021, 83, 83, NULL, NULL),
('Nissan', 'Armada', 2000, 2021, 98, 98, NULL, NULL),
('Nissan', 'GT-R', 2009, 2021, 97, 97, NULL, NULL),
('Nissan', 'GT-R Nismo', 2015, 2021, 114, 114, NULL, NULL),
('Nissan', 'Kicks', 2015, 2021, 83, 83, NULL, NULL),
('Nissan', 'Leaf', 2013, 2021, 83, 83, NULL, NULL),
('Nissan', 'Maxima', 2009, 2021, 83, 83, NULL, NULL),
('Nissan', 'Murano', 2015, 2021, 83, 83, NULL, NULL),
('Nissan', 'NV1500/2500/3500', 2012, 2014, 138, 138, NULL, NULL),
('Nissan', 'NV1500/2500/3500', 2015, 2021, 131, 131, NULL, NULL),
('Nissan', 'NV200', 2013, 2021, 83, 83, NULL, NULL),
('Nissan', 'Pathfinder', 1995, 2012, 98, 98, NULL, NULL),
('Nissan', 'Pathfinder', 2013, 2020, 83, 83, NULL, NULL),
('Nissan', 'Rogue', 2014, 2021, 83, 83, NULL, NULL),
('Nissan', 'Sentra', 2007, 2021, 83, 83, NULL, NULL),
('Nissan', 'Titan XD', 2016, 2021, 131, 131, NULL, NULL),
('Nissan', 'Versa', 2007, 2021, 83, 83, NULL, NULL),
('Nissan', 'Xterra', 2000, 2021, 98, 98, NULL, NULL),
('Nissan', 'All Other Trucks', 1995, 2021, 98, 98, '21', NULL),
('Nissan', 'All Other SUVs/Vans', 1995, 2021, 80, 80, '21', NULL),

-- ===== PONTIAC =====
('Pontiac', 'G8', 2008, 2009, 125, 125, '22', NULL),
('Pontiac', 'Vibe', 2003, 2010, 76, 76, '21', NULL),
('Pontiac', 'All Other Car Models', 1995, 2010, 100, 100, '19', NULL),
('Pontiac', 'All Other Light Truck/SUV/Van', 1995, 2009, 100, 100, NULL, NULL),

-- ===== PORSCHE =====
('Porsche', 'Cayman', 2012, 2017, 118, 118, NULL, NULL),
('Porsche', 'Panamera', 2010, 2011, 118, 118, NULL, NULL),
('Porsche', 'Panamera', 2012, 2016, 133, 133, NULL, NULL),
('Porsche', 'Panamera', 2017, 2021, 118, 118, NULL, NULL),
('Porsche', 'Taycan', 2020, 2021, 118, 118, NULL, NULL),
('Porsche', '718', 2017, 2021, 118, 118, NULL, NULL),
('Porsche', '911', 2012, 2021, 118, 118, NULL, 'Standard 5-bolt'),
('Porsche', 'All Other Car Models', 1995, 2013, 96, 96, '19', NULL),
('Porsche', 'All Other Light Truck/SUV/Van', 2003, 2021, 118, 118, NULL, NULL),

-- ===== RAM =====
('Ram', 'ProMaster', 2014, 2021, 145, 145, NULL, NULL),
('Ram', 'ProMaster City', 2015, 2021, 89, 89, NULL, NULL),
('Ram', 'ProMaster City Steel', 2015, 2021, 63, 63, NULL, 'Steel wheels'),
('Ram', '1500', 2011, 2021, 130, 130, NULL, NULL),
('Ram', '2500', 2011, 2021, 130, 130, NULL, NULL),
('Ram', '3500', 2011, 2021, 130, 130, NULL, 'SRW'),
('Ram', '3500 DRW', 2011, 2021, 140, 140, NULL, 'Dual rear wheels'),

-- ===== SUBARU =====
('Subaru', 'Ascent', 2019, 2021, 89, 89, NULL, NULL),
('Subaru', 'Crosstrek', 2014, 2021, 89, 89, NULL, NULL),
('Subaru', 'Forester', 1998, 2010, 58, 72, NULL, NULL),
('Subaru', 'Forester', 2011, 2013, 72, 72, NULL, NULL),
('Subaru', 'Forester', 2014, 2021, 89, 89, NULL, NULL),
('Subaru', 'Legacy', 2005, 2009, 74, 89, NULL, NULL),
('Subaru', 'Legacy', 2010, 2021, 89, 89, NULL, NULL),
('Subaru', 'Outback', 2005, 2009, 74, 89, NULL, NULL),
('Subaru', 'Outback', 2010, 2021, 89, 89, NULL, NULL),
('Subaru', 'WRX', 2011, 2014, 72, 72, '19', 'Includes STI'),
('Subaru', 'All Other Car Models', 1995, 2011, 58, 72, '19', NULL),

-- ===== TESLA =====
('Tesla', 'Model S', 2012, 2021, 129, 129, NULL, NULL),
('Tesla', 'Model 3', 2012, 2021, 129, 129, NULL, NULL),
('Tesla', 'Model X', 2016, 2021, 129, 129, NULL, NULL),
('Tesla', 'Model Y', 2016, 2021, 129, 129, NULL, NULL),
('Tesla', 'Roadster', 2008, 2012, 77, 77, NULL, NULL),

-- ===== TOYOTA =====
('Toyota', 'FR-S/86', 2013, 2020, 89, 89, NULL, NULL),
('Toyota', 'GR Supra', 2020, 2021, 103, 103, NULL, NULL),
('Toyota', 'Mirai', 2021, 2021, 103, 103, NULL, NULL),
('Toyota', '4Runner', 1996, 2014, 81, 81, NULL, NULL),
('Toyota', 'FJ Cruiser', 2007, 2014, 83, 83, NULL, NULL),
('Toyota', 'Land Cruiser', 1998, 2021, 97, 97, NULL, NULL),
('Toyota', 'Sequoia', 2001, 2007, 83, 83, NULL, NULL),
('Toyota', 'Sequoia', 2008, 2021, 97, 97, NULL, NULL),
('Toyota', 'Tacoma', 1995, 2021, 83, 83, NULL, NULL),
('Toyota', 'Tundra', 2000, 2006, 83, 83, NULL, NULL),
('Toyota', 'Tundra', 2007, 2021, 97, 97, NULL, NULL),
('Toyota', 'Tundra Steel', 2007, 2021, 154, 154, NULL, 'Steel wheels only'),
('Toyota', 'All Other Light Truck/SUV/Van', 1995, 2021, 76, 76, '21', NULL),

-- ===== VOLKSWAGEN =====
('Volkswagen', 'Arteon', 2012, 2021, 103, 103, NULL, NULL),
('Volkswagen', 'Atlas', 2018, 2021, 88, 88, NULL, 'Includes Atlas Cross Sport'),
('Volkswagen', 'Beetle', 1995, 2010, 89, 89, '17', NULL),
('Volkswagen', 'Beetle', 2012, 2021, 103, 103, NULL, NULL),
('Volkswagen', 'ID.4', 2018, 2021, 88, 88, NULL, NULL),
('Volkswagen', 'Passat', 2012, 2021, 103, 103, '17', NULL),
('Volkswagen', 'Tiguan', 2009, 2021, 103, 103, NULL, NULL),
('Volkswagen', 'Touareg', 2004, 2007, 118, 118, NULL, NULL),
('Volkswagen', 'Touareg', 2008, 2017, 133, 133, NULL, NULL),
('Volkswagen', 'All Other Car Models', 1995, 1998, 81, 81, '17', NULL),
('Volkswagen', 'All Other Car Models', 1999, 2021, 89, 89, '17', NULL),

-- ===== VOLVO =====
('Volvo', 'S60', 1999, 2021, 103, 103, '19', NULL),
('Volvo', 'S80', 1999, 2021, 103, 103, '19', NULL),
('Volvo', 'S90', 1999, 2021, 103, 103, NULL, NULL),
('Volvo', 'V60', 2001, 2021, 103, 103, NULL, NULL),
('Volvo', 'V70', 2001, 2021, 103, 103, NULL, 'Includes XC70'),
('Volvo', 'V90', 2001, 2021, 103, 103, NULL, NULL),
('Volvo', 'C30/C70/S40/V40/V50 Fixed Washer', 1998, 2010, 81, 81, '19', 'Fixed washer type'),
('Volvo', 'C30/C70/S40/V50', 2011, 2013, 96, 96, NULL, 'Refer to owner manual'),
('Volvo', '240/740/760/780/940/960', 1995, 1997, 63, 63, '19', NULL),
('Volvo', '850', 1995, 1997, 81, 81, '19', NULL),
('Volvo', 'All SUV/Van/Truck', 2003, 2021, 103, 103, NULL, NULL);

-- Verify row count
SELECT COUNT(*) AS torque_spec_rows FROM lkp_torque_specs;

-- ============================================================================
-- END OF SCHEMA v2.4
-- Total: 44 tables, 14 views
-- ============================================================================


-- Shop settings seed data
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

-- Notification delivery settings
INSERT IGNORE INTO shop_settings (setting_key, setting_value, setting_type, category, label, description, is_public) VALUES
('smtp_host',       '',         'text',   'mail', 'SMTP Host',            'SMTP server hostname (e.g., smtp.gmail.com). Leave blank to use server MTA.', 0),
('smtp_port',       '587',      'number', 'mail', 'SMTP Port',            '587 for STARTTLS, 465 for SSL, 25 for unencrypted.',                          0),
('smtp_user',       '',         'text',   'mail', 'SMTP Username',        'SMTP authentication username (usually your email address).',                   0),
('smtp_pass',       '',         'text',   'mail', 'SMTP Password',        'SMTP authentication password.',                                                0),
('smtp_encryption', 'tls',      'text',   'mail', 'SMTP Encryption',      'tls (STARTTLS on 587), ssl (implicit on 465), or none.',                      0),
('smtp_from',       '',         'text',   'mail', 'From Address',         'Email address used as the From header. Falls back to shop_email.',             0),
('sms_api_key',     '',         'text',   'sms',  'Flowroute API Key',    'Flowroute Tech Prefix (access key). Found in Flowroute portal.',               0),
('sms_api_secret',  '',         'text',   'sms',  'Flowroute API Secret', 'Flowroute Tech Prefix secret.',                                                0),
('sms_from_number', '',         'text',   'sms',  'SMS From Number',      'Your Flowroute DID (e.g., 17195550100). Must be on your account.',             0);
