-- Down: 011_notification_delivery.sql
-- Reverses: 9 shop_settings rows in mail and sms categories.
-- Safe: only deletes config rows, does not drop tables or data.

DELETE FROM shop_settings WHERE setting_key IN (
    'smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass',
    'smtp_encryption', 'smtp_from',
    'sms_api_key', 'sms_api_secret', 'sms_from_number'
);
