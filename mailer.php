<?php
// Sends email through Gmail's SMTP server (no Composer / PHPMailer needed).
// Used for the verification codes. Settings (MAIL_*) are in config.php.
require_once __DIR__ . '/config.php';

// Reads one SMTP reply (it can be several lines). Returns [code, text].
function smtp_read($fp): array {
    $text = '';
    while (($line = fgets($fp, 515)) !== false) {
        $text .= $line;
        if (strlen($line) < 4 || $line[3] === ' ') break;   // "250 ..." = last line, "250-..." = more coming
    }
    return [(int)substr($text, 0, 3), trim($text)];
}

// Sends a command and checks the reply code.
function smtp_cmd($fp, ?string $command, array $okCodes): string {
    if ($command !== null) fwrite($fp, $command . "\r\n");
    [$code, $text] = smtp_read($fp);
    if (!in_array($code, $okCodes, true)) {
        throw new RuntimeException('Email server said: ' . $text);
    }
    return $text;
}

// Sends one HTML email. Throws RuntimeException when it fails.
function send_mail(string $to, string $subject, string $html, string $plain): void {
    // Not set up yet: on your own computer write the mail to a file so you can still test.
    if (MAIL_APP_PASSWORD === '') {
        $local = in_array((string)($_SERVER['REMOTE_ADDR'] ?? ''), ['127.0.0.1', '::1'], true);
        if ($local) {
            @file_put_contents(__DIR__ . '/mail-outbox.log',
                '[' . date('Y-m-d H:i:s') . "] To: $to\nSubject: $subject\n$plain\n----------\n", FILE_APPEND | LOCK_EX);
            return;
        }
        throw new RuntimeException('Email is not set up yet (MAIL_APP_PASSWORD in config.php is empty).');
    }

    $context = stream_context_create(['ssl' => [
        'verify_peer'      => MAIL_VERIFY_SSL,
        'verify_peer_name' => MAIL_VERIFY_SSL,
        'SNI_enabled'      => true,
    ]]);
    $fp = @stream_socket_client('ssl://' . MAIL_HOST . ':' . MAIL_PORT, $errno, $errstr, 15, STREAM_CLIENT_CONNECT, $context);
    if (!$fp) throw new RuntimeException("Cannot connect to the email server ($errstr). Check the internet connection.");
    stream_set_timeout($fp, 15);

    try {
        smtp_cmd($fp, null, [220]);
        smtp_cmd($fp, 'EHLO localhost', [250]);
        smtp_cmd($fp, 'AUTH LOGIN', [334]);
        smtp_cmd($fp, base64_encode(MAIL_USER), [334]);
        try {
            smtp_cmd($fp, base64_encode(str_replace(' ', '', MAIL_APP_PASSWORD)), [235]);
        } catch (RuntimeException $e) {
            throw new RuntimeException('Gmail refused the login. Use a 16-letter App Password (not the normal password). ' . $e->getMessage());
        }
        smtp_cmd($fp, 'MAIL FROM:<' . MAIL_USER . '>', [250]);
        smtp_cmd($fp, 'RCPT TO:<' . $to . '>', [250, 251]);
        smtp_cmd($fp, 'DATA', [354]);

        // Plain text + HTML in one message (the mail app picks the one it can show)
        $boundary = 'mcc_' . bin2hex(random_bytes(8));
        $fromName = '=?UTF-8?B?' . base64_encode(MAIL_FROM_NAME) . '?=';
        $headers = [
            'Date: ' . date('r'),
            'From: ' . $fromName . ' <' . MAIL_USER . '>',
            'To: <' . $to . '>',
            'Subject: =?UTF-8?B?' . base64_encode($subject) . '?=',
            'Message-ID: <' . bin2hex(random_bytes(12)) . '@mcc-canteen>',
            'MIME-Version: 1.0',
            'Content-Type: multipart/alternative; boundary="' . $boundary . '"',
        ];
        $body  = "--$boundary\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n"
               . chunk_split(base64_encode($plain))
               . "--$boundary\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n"
               . chunk_split(base64_encode($html))
               . "--$boundary--\r\n";
        // base64 text never has a line that starts with ".", so no dot-stuffing is needed
        fwrite($fp, implode("\r\n", $headers) . "\r\n\r\n" . $body . "\r\n.\r\n");
        smtp_cmd($fp, null, [250]);
        @fwrite($fp, "QUIT\r\n");
    } finally {
        fclose($fp);
    }
}

// The verification-code email.
function send_verification_email(string $to, string $name, string $code, int $minutes): void {
    $safeName = htmlspecialchars($name, ENT_QUOTES, 'UTF-8');
    $subject  = 'Your MCC Canteen verification code';
    $plain    = "Hi $name,\n\nYour MCC Canteen verification code is: $code\n\n"
              . "It works for $minutes minutes. If you did not sign up, you can ignore this email.\n\n- MCC Canteen";
    $html = '<div style="font-family:Arial,Helvetica,sans-serif;max-width:420px;margin:auto;padding:24px;border:1px solid #eee;border-radius:14px">'
          . '<h2 style="margin:0 0 6px;color:#bf1e2e">MCC Canteen</h2>'
          . '<p style="color:#333">Hi ' . $safeName . ', use this code to verify your email:</p>'
          . '<p style="font-size:34px;font-weight:700;letter-spacing:8px;text-align:center;margin:18px 0;color:#222">' . $code . '</p>'
          . '<p style="color:#666;font-size:13px">The code works for ' . $minutes . ' minutes. '
          . 'If you did not sign up, you can ignore this email.</p></div>';
    send_mail($to, $subject, $html, $plain);
}
