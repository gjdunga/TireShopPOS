-- ============================================================================
-- Migration 011: Notification delivery configuration
--
-- Seeds shop_settings with SMTP (email) and SMS (Flowroute) config keys.
-- These are editable in Settings > Notifications tab.
--
-- DunganSoft Technologies, March 2026
-- ============================================================================

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
