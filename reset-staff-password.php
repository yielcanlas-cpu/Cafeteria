<?php
// ONE-TIME USE: sets the staff account's password to ADMIN_PASSWORD from config.php.
// 1. Open http://localhost/Mcc-Canteen/reset-staff-password.php in your browser (Laragon running).
// 2. When it says "Done", DELETE this file.
require_once __DIR__ . '/db.php';
header('Content-Type: text/plain; charset=utf-8');
try {
    $st = db()->prepare("UPDATE users SET password_hash = ? WHERE role = 'admin'");
    $st->execute([password_hash(ADMIN_PASSWORD, PASSWORD_DEFAULT)]);
    echo "Done. Staff accounts updated: " . $st->rowCount() . "\nLog in with " . ADMIN_EMAIL . " and your new password.\nNow delete reset-staff-password.php.";
} catch (Throwable $e) {
    echo 'Error: ' . $e->getMessage();
}
