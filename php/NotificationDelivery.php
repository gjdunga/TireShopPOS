<?php
/**
 * ============================================================================
 * NotificationDelivery: Email and SMS delivery for the notification queue.
 * ============================================================================
 *
 * Processes pending notifications from notification_log, dispatches by channel:
 *   email    -> SMTP socket with STARTTLS (or PHP mail() fallback)
 *   sms      -> Flowroute SMS API (v2.1) via curl
 *   internal -> auto-marked sent (visible in-app only)
 *
 * Configuration:
 *   SMTP settings in shop_settings (category: mail) or .env fallback.
 *   SMS settings in shop_settings (category: sms).
 *   Configurable via Settings > Notifications tab in the UI.
 *
 * Usage:
 *   From route:   $result = NotificationDelivery::processQueue(10);
 *   From cron:    scripts/deliver-notifications.sh
 *
 * DunganSoft Technologies, March 2026
 * ============================================================================
 */

class NotificationDelivery
{
    /** Strip CR/LF from email header values to prevent header injection. */
    private static function hdr(string $val): string
    {
        return str_replace(["\r", "\n", "\0"], '', $val);
    }

    // ========================================================================
    // Queue Processor
    // ========================================================================

    /**
     * Process up to $limit pending notifications.
     * Returns summary: sent count, failed count, errors.
     */
    public static function processQueue(int $limit = 20): array
    {
        $pending = \App\Core\Database::query(
            "SELECT nl.*, c.first_name, c.last_name, c.email AS customer_email,
                    c.phone_primary AS customer_phone
             FROM notification_log nl
             JOIN customers c ON nl.customer_id = c.customer_id
             WHERE nl.status = 'pending'
             ORDER BY nl.created_at ASC
             LIMIT ?",
            [$limit]
        );

        $sent = 0;
        $failed = 0;
        $errors = [];

        foreach ($pending as $notif) {
            try {
                $result = self::dispatch($notif);
                if ($result['success']) {
                    markNotificationSent($notif['notification_id']);
                    $sent++;
                } else {
                    markNotificationFailed($notif['notification_id'], $result['error']);
                    $failed++;
                    $errors[] = "#{$notif['notification_id']}: {$result['error']}";
                }
            } catch (\Throwable $e) {
                markNotificationFailed($notif['notification_id'], $e->getMessage());
                $failed++;
                $errors[] = "#{$notif['notification_id']}: {$e->getMessage()}";
            }
        }

        return [
            'processed' => count($pending),
            'sent'      => $sent,
            'failed'    => $failed,
            'errors'    => $errors,
        ];
    }

    /**
     * Dispatch a single notification by channel.
     */
    private static function dispatch(array $notif): array
    {
        switch ($notif['channel']) {
            case 'email':
                return self::sendEmail($notif);
            case 'sms':
                return self::sendSms($notif);
            case 'internal':
                return ['success' => true];
            default:
                return ['success' => false, 'error' => "Unknown channel: {$notif['channel']}"];
        }
    }

    // ========================================================================
    // Email Delivery (SMTP with STARTTLS, or PHP mail() fallback)
    // ========================================================================

    /**
     * Send an email notification.
     * Tries SMTP socket first (if smtp_host is configured), falls back to mail().
     */
    private static function sendEmail(array $notif): array
    {
        $to = $notif['customer_email'] ?? '';
        if (empty($to)) {
            return ['success' => false, 'error' => 'Customer has no email address'];
        }

        $config = self::getMailConfig();
        $from = $config['smtp_from'] ?: ($config['shop_email'] ?: 'noreply@' . ($_SERVER['SERVER_NAME'] ?? 'localhost'));
        $fromName = $config['shop_name'] ?: 'Tire Shop';
        $subject = $notif['subject'] ?: 'Notification from ' . $fromName;
        $body = $notif['body'] ?? '';

        // Build plain-text + simple HTML
        $htmlBody = self::buildHtmlEmail($fromName, $subject, $body);

        // Try SMTP if configured
        if (!empty($config['smtp_host'])) {
            return self::sendSmtp($config, $to, $fromName, $from, $subject, $htmlBody, $body);
        }

        // Fallback: PHP mail()
        $safeName = self::hdr($fromName);
        $safeFrom = self::hdr($from);
        $safeSubject = self::hdr($subject);
        $headers = [
            "From: {$safeName} <{$safeFrom}>",
            "Reply-To: {$safeFrom}",
            "MIME-Version: 1.0",
            "Content-Type: text/html; charset=UTF-8",
            "X-Mailer: TireShopPOS/1.2.0",
        ];

        $ok = @mail($to, $safeSubject, $htmlBody, implode("\r\n", $headers));
        if ($ok) {
            return ['success' => true];
        }
        return ['success' => false, 'error' => 'PHP mail() returned false. Check server MTA (Postfix) configuration.'];
    }

    /**
     * SMTP socket delivery with STARTTLS support.
     */
    private static function sendSmtp(array $config, string $to, string $fromName, string $from,
                                      string $subject, string $htmlBody, string $textBody): array
    {
        $host = $config['smtp_host'];
        $port = (int) ($config['smtp_port'] ?: 587);
        $user = $config['smtp_user'] ?? '';
        $pass = $config['smtp_pass'] ?? '';
        $encryption = $config['smtp_encryption'] ?? 'tls';

        $conn = @fsockopen(
            ($encryption === 'ssl') ? "ssl://{$host}" : $host,
            $port,
            $errno, $errstr, 10
        );

        if (!$conn) {
            return ['success' => false, 'error' => "SMTP connect failed: {$errstr} ({$errno})"];
        }

        stream_set_timeout($conn, 15);

        try {
            self::smtpRead($conn); // greeting

            self::smtpCmd($conn, "EHLO " . gethostname(), 250);

            // STARTTLS for port 587
            if ($encryption === 'tls' && $port !== 465) {
                self::smtpCmd($conn, "STARTTLS", 220);
                $crypto = stream_socket_enable_crypto($conn, true, STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT);
                if (!$crypto) {
                    throw new \RuntimeException('STARTTLS negotiation failed');
                }
                self::smtpCmd($conn, "EHLO " . gethostname(), 250);
            }

            // AUTH LOGIN
            if ($user !== '') {
                self::smtpCmd($conn, "AUTH LOGIN", 334);
                self::smtpCmd($conn, base64_encode($user), 334);
                self::smtpCmd($conn, base64_encode($pass), 235);
            }

            $safeFrom = self::hdr($from);
            $safeTo = self::hdr($to);
            $safeName = self::hdr($fromName);
            $safeSubject = self::hdr($subject);

            self::smtpCmd($conn, "MAIL FROM:<{$safeFrom}>", 250);
            self::smtpCmd($conn, "RCPT TO:<{$safeTo}>", 250);
            self::smtpCmd($conn, "DATA", 354);

            // Build message with headers
            $boundary = md5(uniqid((string) time()));
            $msg  = "From: {$safeName} <{$safeFrom}>\r\n";
            $msg .= "To: {$safeTo}\r\n";
            $msg .= "Subject: {$safeSubject}\r\n";
            $msg .= "MIME-Version: 1.0\r\n";
            $msg .= "Content-Type: multipart/alternative; boundary=\"{$boundary}\"\r\n";
            $msg .= "X-Mailer: TireShopPOS/1.2.0\r\n";
            $msg .= "\r\n";
            $msg .= "--{$boundary}\r\n";
            $msg .= "Content-Type: text/plain; charset=UTF-8\r\n\r\n";
            $msg .= $textBody . "\r\n";
            $msg .= "--{$boundary}\r\n";
            $msg .= "Content-Type: text/html; charset=UTF-8\r\n\r\n";
            $msg .= $htmlBody . "\r\n";
            $msg .= "--{$boundary}--\r\n";
            $msg .= ".";

            self::smtpCmd($conn, $msg, 250);
            self::smtpCmd($conn, "QUIT", 221);

            return ['success' => true];
        } catch (\Throwable $e) {
            @fwrite($conn, "QUIT\r\n");
            return ['success' => false, 'error' => "SMTP: {$e->getMessage()}"];
        } finally {
            @fclose($conn);
        }
    }

    private static function smtpCmd($conn, string $cmd, int $expect): string
    {
        fwrite($conn, $cmd . "\r\n");
        $response = self::smtpRead($conn);
        $code = (int) substr($response, 0, 3);
        if ($code !== $expect) {
            throw new \RuntimeException("Expected {$expect}, got: {$response}");
        }
        return $response;
    }

    private static function smtpRead($conn): string
    {
        $response = '';
        while ($line = fgets($conn, 512)) {
            $response .= $line;
            // Last line: code followed by space (not dash)
            if (isset($line[3]) && $line[3] === ' ') break;
        }
        return trim($response);
    }

    private static function buildHtmlEmail(string $shopName, string $subject, string $body): string
    {
        $escaped = nl2br(htmlspecialchars($body, ENT_QUOTES, 'UTF-8'));
        return <<<HTML
<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width"><title>{$subject}</title></head>
<body style="font-family:Arial,sans-serif;margin:0;padding:0;background:#f4f4f4;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:20px 0;">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
<tr><td style="background:#1B4F72;padding:16px 24px;"><h1 style="margin:0;color:#fff;font-size:18px;">{$shopName}</h1></td></tr>
<tr><td style="padding:24px;font-size:15px;line-height:1.6;color:#333;">{$escaped}</td></tr>
<tr><td style="padding:16px 24px;background:#f8f9fa;font-size:12px;color:#888;text-align:center;">
This message was sent by {$shopName}. Please do not reply directly to this email.
</td></tr></table></td></tr></table></body></html>
HTML;
    }

    // ========================================================================
    // SMS Delivery (Flowroute API v2.1)
    // ========================================================================

    /**
     * Send an SMS via Flowroute.
     * Requires: sms_api_key, sms_api_secret, sms_from_number in shop_settings.
     */
    private static function sendSms(array $notif): array
    {
        $to = $notif['customer_phone'] ?? '';
        if (empty($to)) {
            return ['success' => false, 'error' => 'Customer has no phone number'];
        }

        $config = self::getSmsConfig();
        if (empty($config['sms_api_key']) || empty($config['sms_api_secret'])) {
            return ['success' => false, 'error' => 'SMS not configured. Set API key and secret in Settings > Notifications.'];
        }
        if (empty($config['sms_from_number'])) {
            return ['success' => false, 'error' => 'SMS from number not configured.'];
        }

        // Normalize phone to E.164
        $to = self::normalizePhone($to);
        $from = self::normalizePhone($config['sms_from_number']);

        $body = $notif['body'] ?? '';
        // SMS: 160 char limit per segment, but Flowroute handles concatenation
        if (strlen($body) > 1600) {
            $body = substr($body, 0, 1597) . '...';
        }

        $payload = json_encode([
            'from' => $from,
            'to'   => $to,
            'body' => $body,
        ]);

        $ch = curl_init('https://api.flowroute.com/v2.1/messages');
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $payload,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 15,
            CURLOPT_HTTPHEADER     => ['Content-Type: application/vnd.api+json'],
            CURLOPT_USERPWD        => $config['sms_api_key'] . ':' . $config['sms_api_secret'],
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlErr = curl_error($ch);
        curl_close($ch);

        if ($curlErr) {
            return ['success' => false, 'error' => "SMS curl error: {$curlErr}"];
        }

        if ($httpCode >= 200 && $httpCode < 300) {
            return ['success' => true];
        }

        $decoded = json_decode($response, true);
        $apiErr = $decoded['errors'][0]['detail'] ?? $response;
        return ['success' => false, 'error' => "SMS API {$httpCode}: {$apiErr}"];
    }

    /**
     * Normalize a phone number to E.164 format (US assumed).
     */
    private static function normalizePhone(string $phone): string
    {
        $digits = preg_replace('/[^0-9]/', '', $phone);
        if (strlen($digits) === 10) {
            return '1' . $digits;
        }
        if (strlen($digits) === 11 && $digits[0] === '1') {
            return $digits;
        }
        return $digits;
    }

    // ========================================================================
    // Configuration
    // ========================================================================

    private static function getMailConfig(): array
    {
        $keys = ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_encryption', 'smtp_from', 'shop_name', 'shop_email'];
        $config = [];
        foreach ($keys as $k) {
            $config[$k] = self::getSetting($k) ?? '';
        }
        // .env fallback for SMTP
        if (empty($config['smtp_host'])) $config['smtp_host'] = \App\Core\Env::get('SMTP_HOST', '');
        if (empty($config['smtp_port'])) $config['smtp_port'] = \App\Core\Env::get('SMTP_PORT', '587');
        if (empty($config['smtp_user'])) $config['smtp_user'] = \App\Core\Env::get('SMTP_USER', '');
        if (empty($config['smtp_pass'])) $config['smtp_pass'] = \App\Core\Env::get('SMTP_PASS', '');
        if (empty($config['smtp_from'])) $config['smtp_from'] = \App\Core\Env::get('SMTP_FROM', '');
        if (empty($config['smtp_encryption'])) $config['smtp_encryption'] = \App\Core\Env::get('SMTP_ENCRYPTION', 'tls');
        return $config;
    }

    private static function getSmsConfig(): array
    {
        $keys = ['sms_api_key', 'sms_api_secret', 'sms_from_number'];
        $config = [];
        foreach ($keys as $k) {
            $config[$k] = self::getSetting($k) ?? '';
        }
        return $config;
    }

    private static function getSetting(string $key): ?string
    {
        $row = \App\Core\Database::queryOne(
            "SELECT setting_value FROM shop_settings WHERE setting_key = ?", [$key]
        );
        return $row ? $row['setting_value'] : null;
    }

    /**
     * Get delivery configuration for the settings UI.
     */
    public static function getDeliveryConfig(): array
    {
        $mail = self::getMailConfig();
        $sms = self::getSmsConfig();
        return [
            'email' => [
                'configured' => !empty($mail['smtp_host']) || !empty($mail['shop_email']),
                'method' => !empty($mail['smtp_host']) ? 'smtp' : 'php_mail',
                'smtp_host' => $mail['smtp_host'],
                'smtp_port' => $mail['smtp_port'],
                'smtp_encryption' => $mail['smtp_encryption'],
                'smtp_user' => $mail['smtp_user'],
                'smtp_from' => $mail['smtp_from'],
                'has_password' => !empty($mail['smtp_pass']),
            ],
            'sms' => [
                'configured' => !empty($sms['sms_api_key']),
                'from_number' => $sms['sms_from_number'],
                'has_credentials' => !empty($sms['sms_api_key']) && !empty($sms['sms_api_secret']),
            ],
        ];
    }

    /**
     * Test email delivery by sending to the shop email address.
     */
    public static function testEmail(): array
    {
        $config = self::getMailConfig();
        $to = $config['shop_email'] ?: $config['smtp_from'] ?: '';
        if (empty($to)) {
            return ['success' => false, 'error' => 'No shop email or SMTP from address configured.'];
        }

        $shopName = $config['shop_name'] ?: 'Tire Shop';
        $subject = 'TireShopPOS Test Email';
        $body = "This is a test email from {$shopName}.\n\nIf you are reading this, email delivery is working correctly.\n\nSent at: " . date('Y-m-d H:i:s T');
        $htmlBody = self::buildHtmlEmail($shopName, $subject, $body);

        if (!empty($config['smtp_host'])) {
            return self::sendSmtp($config, $to, $shopName, $config['smtp_from'] ?: $to, $subject, $htmlBody, $body);
        }

        $headers = [
            "From: " . self::hdr($shopName) . " <" . self::hdr($config['smtp_from'] ?: $to) . ">",
            "MIME-Version: 1.0",
            "Content-Type: text/html; charset=UTF-8",
        ];
        $ok = @mail($to, self::hdr($subject), $htmlBody, implode("\r\n", $headers));
        return $ok
            ? ['success' => true, 'sent_to' => $to]
            : ['success' => false, 'error' => 'PHP mail() returned false.'];
    }

    /**
     * Test SMS delivery by sending to the configured from number.
     */
    public static function testSms(): array
    {
        $config = self::getSmsConfig();
        if (empty($config['sms_api_key']) || empty($config['sms_api_secret'])) {
            return ['success' => false, 'error' => 'SMS credentials not configured.'];
        }
        if (empty($config['sms_from_number'])) {
            return ['success' => false, 'error' => 'SMS from number not configured.'];
        }

        // Send test to the from number itself
        $notif = [
            'customer_phone' => $config['sms_from_number'],
            'body' => 'TireShopPOS test SMS. If you see this, SMS delivery is working. ' . date('H:i:s'),
        ];
        return self::sendSms($notif);
    }

    /**
     * Get delivery statistics.
     */
    public static function getStats(): array
    {
        $pending = (int) \App\Core\Database::scalar(
            "SELECT COUNT(*) FROM notification_log WHERE status = 'pending'"
        );
        $sentToday = (int) \App\Core\Database::scalar(
            "SELECT COUNT(*) FROM notification_log WHERE status = 'sent' AND sent_at >= CURDATE()"
        );
        $failedToday = (int) \App\Core\Database::scalar(
            "SELECT COUNT(*) FROM notification_log WHERE status = 'failed' AND created_at >= CURDATE()"
        );
        $lastSent = \App\Core\Database::queryOne(
            "SELECT sent_at FROM notification_log WHERE status = 'sent' ORDER BY sent_at DESC LIMIT 1"
        );

        return [
            'pending'      => $pending,
            'sent_today'   => $sentToday,
            'failed_today' => $failedToday,
            'last_sent_at' => $lastSent ? $lastSent['sent_at'] : null,
        ];
    }
}
