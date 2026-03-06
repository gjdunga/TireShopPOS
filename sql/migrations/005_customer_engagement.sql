-- ============================================================================
-- Migration 005: Customer Engagement (Phase 5)
-- 8 new tables: discount_groups, customer_discount_groups, coupons,
-- coupon_usage, billing_statements, statement_line_items, tire_storage,
-- storage_billing
--
-- DunganSoft Technologies, March 2026
-- ============================================================================

-- 1. Discount Groups (fleet, wholesale, loyalty, etc.)
CREATE TABLE IF NOT EXISTS discount_groups (
    group_id        INT AUTO_INCREMENT PRIMARY KEY,
    group_name      VARCHAR(80) NOT NULL,
    group_code      VARCHAR(20) NOT NULL UNIQUE,
    discount_type   ENUM('percentage','fixed_per_tire','fixed_per_invoice') NOT NULL DEFAULT 'percentage',
    discount_value  DECIMAL(8,2) NOT NULL DEFAULT 0.00 COMMENT 'Percentage (0-100) or dollar amount',
    applies_to      ENUM('tires','labor','parts','all') NOT NULL DEFAULT 'all',
    auto_apply      TINYINT(1) NOT NULL DEFAULT 1 COMMENT 'Auto-apply when customer is in group',
    min_purchase    DECIMAL(10,2) DEFAULT NULL COMMENT 'Minimum invoice subtotal to qualify',
    stackable       TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Can combine with coupons',
    notes           TEXT DEFAULT NULL,
    is_active       TINYINT(1) NOT NULL DEFAULT 1,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO discount_groups (group_name, group_code, discount_type, discount_value, applies_to, auto_apply, notes) VALUES
('Fleet Account',  'FLEET',     'percentage', 10.00, 'all',   1, 'Fleet vehicles: 10% off all items'),
('Wholesale',      'WHOLESALE', 'percentage', 15.00, 'tires', 1, 'Wholesale buyers: 15% off tires'),
('Loyalty',        'LOYALTY',   'percentage',  5.00, 'all',   1, 'Returning customers: 5% off'),
('Military',       'MILITARY',  'percentage',  5.00, 'all',   1, 'Active/veteran military discount'),
('Senior',         'SENIOR',    'percentage',  5.00, 'labor', 1, 'Senior citizen: 5% off labor');


-- 2. Customer-to-Discount-Group mapping (M:M)
CREATE TABLE IF NOT EXISTS customer_discount_groups (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    customer_id     INT NOT NULL,
    group_id        INT NOT NULL,
    added_by        INT NOT NULL,
    added_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at      DATE DEFAULT NULL COMMENT 'Null = no expiry',

    CONSTRAINT fk_cdg_customer FOREIGN KEY (customer_id) REFERENCES customers(customer_id),
    CONSTRAINT fk_cdg_group    FOREIGN KEY (group_id)    REFERENCES discount_groups(group_id),
    CONSTRAINT fk_cdg_user     FOREIGN KEY (added_by)    REFERENCES users(user_id),
    UNIQUE INDEX idx_cdg_unique (customer_id, group_id),
    INDEX idx_cdg_group (group_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 3. Coupons
CREATE TABLE IF NOT EXISTS coupons (
    coupon_id       INT AUTO_INCREMENT PRIMARY KEY,
    coupon_code     VARCHAR(30) NOT NULL UNIQUE,
    coupon_name     VARCHAR(120) NOT NULL,
    coupon_type     ENUM('store','manufacturer') NOT NULL DEFAULT 'store'
        COMMENT 'store=discount after tax, manufacturer=discount before tax (reduces taxable base)',
    discount_type   ENUM('percentage','fixed','buy_x_get_y') NOT NULL DEFAULT 'percentage',
    discount_value  DECIMAL(8,2) NOT NULL COMMENT 'Percentage or fixed dollar amount',
    buy_qty         SMALLINT UNSIGNED DEFAULT NULL COMMENT 'For buy_x_get_y: buy this many',
    get_qty         SMALLINT UNSIGNED DEFAULT NULL COMMENT 'For buy_x_get_y: get this many free/discounted',
    applies_to      ENUM('tires','labor','parts','all') NOT NULL DEFAULT 'all',
    min_purchase    DECIMAL(10,2) DEFAULT NULL COMMENT 'Minimum subtotal to qualify',
    max_discount    DECIMAL(10,2) DEFAULT NULL COMMENT 'Cap on discount amount',
    usage_limit     INT UNSIGNED DEFAULT NULL COMMENT 'Total uses allowed (null=unlimited)',
    usage_per_customer INT UNSIGNED DEFAULT NULL COMMENT 'Uses per customer (null=unlimited)',
    usage_count     INT UNSIGNED NOT NULL DEFAULT 0,
    stackable       TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Can combine with group discounts',
    valid_from      DATE NOT NULL,
    valid_until     DATE DEFAULT NULL COMMENT 'Null = no expiry',
    is_active       TINYINT(1) NOT NULL DEFAULT 1,
    created_by      INT NOT NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_coup_user FOREIGN KEY (created_by) REFERENCES users(user_id),
    INDEX idx_coup_code (coupon_code),
    INDEX idx_coup_active (is_active, valid_from, valid_until)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 4. Coupon Usage Log
CREATE TABLE IF NOT EXISTS coupon_usage (
    usage_id        INT AUTO_INCREMENT PRIMARY KEY,
    coupon_id       INT NOT NULL,
    invoice_id      INT NOT NULL,
    customer_id     INT DEFAULT NULL,
    discount_applied DECIMAL(10,2) NOT NULL,
    used_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_cu_coupon   FOREIGN KEY (coupon_id)   REFERENCES coupons(coupon_id),
    CONSTRAINT fk_cu_invoice  FOREIGN KEY (invoice_id)  REFERENCES invoices(invoice_id),
    CONSTRAINT fk_cu_customer FOREIGN KEY (customer_id) REFERENCES customers(customer_id),
    INDEX idx_cu_coupon (coupon_id),
    INDEX idx_cu_invoice (invoice_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 5. Billing Statements
CREATE TABLE IF NOT EXISTS billing_statements (
    statement_id    INT AUTO_INCREMENT PRIMARY KEY,
    customer_id     INT NOT NULL,
    statement_number VARCHAR(20) NOT NULL UNIQUE,
    statement_date  DATE NOT NULL,
    period_start    DATE NOT NULL,
    period_end      DATE NOT NULL,
    opening_balance DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    charges         DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    payments        DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    adjustments     DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    closing_balance DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    due_date        DATE NOT NULL,
    status          ENUM('draft','sent','paid','overdue','void') NOT NULL DEFAULT 'draft',
    notes           TEXT DEFAULT NULL,
    created_by      INT NOT NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_bs_customer FOREIGN KEY (customer_id) REFERENCES customers(customer_id),
    CONSTRAINT fk_bs_user     FOREIGN KEY (created_by)  REFERENCES users(user_id),
    INDEX idx_bs_customer (customer_id),
    INDEX idx_bs_status (status),
    INDEX idx_bs_date (statement_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 6. Statement Line Items (invoices, payments, adjustments within period)
CREATE TABLE IF NOT EXISTS statement_line_items (
    line_id         INT AUTO_INCREMENT PRIMARY KEY,
    statement_id    INT NOT NULL,
    line_date       DATE NOT NULL,
    line_type       ENUM('invoice','payment','adjustment','credit') NOT NULL,
    reference       VARCHAR(60) DEFAULT NULL COMMENT 'Invoice #, payment ref, etc.',
    description     VARCHAR(255) DEFAULT NULL,
    amount          DECIMAL(10,2) NOT NULL COMMENT 'Positive=charge, negative=payment/credit',
    invoice_id      INT DEFAULT NULL,
    payment_id      INT DEFAULT NULL,

    CONSTRAINT fk_sli_statement FOREIGN KEY (statement_id) REFERENCES billing_statements(statement_id),
    CONSTRAINT fk_sli_invoice   FOREIGN KEY (invoice_id)   REFERENCES invoices(invoice_id),
    CONSTRAINT fk_sli_payment   FOREIGN KEY (payment_id)   REFERENCES payments(payment_id),
    INDEX idx_sli_statement (statement_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 7. Tire Storage (customer tires stored at shop)
CREATE TABLE IF NOT EXISTS tire_storage (
    storage_id      INT AUTO_INCREMENT PRIMARY KEY,
    customer_id     INT NOT NULL,
    tire_id         INT DEFAULT NULL COMMENT 'Linked inventory tire, or null for external',
    description     VARCHAR(255) NOT NULL COMMENT 'Tire description for external tires',
    quantity        TINYINT UNSIGNED NOT NULL DEFAULT 4,
    location_code   VARCHAR(30) DEFAULT NULL COMMENT 'Storage area/rack/position',
    stored_at       DATE NOT NULL,
    expected_pickup DATE DEFAULT NULL,
    picked_up_at    DATE DEFAULT NULL,
    monthly_rate    DECIMAL(8,2) NOT NULL DEFAULT 0.00 COMMENT '$0 = free, else billed monthly',
    status          ENUM('stored','picked_up','abandoned','billed') NOT NULL DEFAULT 'stored',
    notes           TEXT DEFAULT NULL,
    created_by      INT NOT NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_ts_customer FOREIGN KEY (customer_id) REFERENCES customers(customer_id),
    CONSTRAINT fk_ts_tire     FOREIGN KEY (tire_id)     REFERENCES tires(tire_id),
    CONSTRAINT fk_ts_user     FOREIGN KEY (created_by)  REFERENCES users(user_id),
    INDEX idx_ts_customer (customer_id),
    INDEX idx_ts_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 8. Storage Billing (monthly charges for stored tires)
CREATE TABLE IF NOT EXISTS storage_billing (
    billing_id      INT AUTO_INCREMENT PRIMARY KEY,
    storage_id      INT NOT NULL,
    billing_month   DATE NOT NULL COMMENT 'First of the month billed',
    amount          DECIMAL(8,2) NOT NULL,
    invoice_id      INT DEFAULT NULL COMMENT 'Linked to invoice when billed',
    status          ENUM('pending','invoiced','waived') NOT NULL DEFAULT 'pending',
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_sb_storage FOREIGN KEY (storage_id) REFERENCES tire_storage(storage_id),
    CONSTRAINT fk_sb_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(invoice_id),
    UNIQUE INDEX idx_sb_unique (storage_id, billing_month),
    INDEX idx_sb_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
