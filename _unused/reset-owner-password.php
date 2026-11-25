<?php
// ONE-TIME USE: creates the owner account if it is missing, or sets its password to
// OWNER_PASSWORD from config.php. Use it if you cannot log in as the owner.
// 1. Open http://localhost/Mcc-Canteen/reset-owner-password.php in your browser (Laragon running).
// 2. When it says "Done", DELETE this file.
require_once __DIR__ . '/db.php';
header('Content-Type: text/plain; charset=utf-8');
try {
    $pdo = db();                                   // this also upgrades the tables (adds the owner role)
    $email = strtolower(OWNER_EMAIL);
    $hash = password_hash(OWNER_PASSWORD, PASSWORD_DEFAULT);

    $st = $pdo->prepare("UPDATE users SET password_hash = ?, role = 'owner', active = 1 WHERE email = ?");
    $st->execute([$hash, $email]);
    if ($st->rowCount() === 0) {
        $exists = $pdo->prepare('SELECT COUNT(*) FROM users WHERE email = ?');
        $exists->execute([$email]);
        if ((int)$exists->fetchColumn() === 0) {
            $pdo->prepare("INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'owner')")
                ->execute([OWNER_NAME, $email, $hash]);
        }
    }
    echo "Done.\nLog in with " . OWNER_EMAIL . " and the OWNER_PASSWORD from config.php.\nNow delete reset-owner-password.php.";
} catch (Throwable $e) {
    echo 'Error: ' . $e->getMessage();
}
