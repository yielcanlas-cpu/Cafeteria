<?php
require_once __DIR__ . '/db.php';
header('Content-Type: text/plain; charset=utf-8');
try {
    $pdo = db();
    $pdo->exec("ALTER TABLE users MODIFY role ENUM('student','admin','owner') NOT NULL DEFAULT 'student'");
    $pdo->prepare("DELETE FROM users WHERE email = ?")->execute([strtolower(OWNER_EMAIL)]);
    $pdo->prepare("INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'owner')")
        ->execute([OWNER_NAME, strtolower(OWNER_EMAIL), password_hash(OWNER_PASSWORD, PASSWORD_DEFAULT)]);
    echo "Done. Log in with " . OWNER_EMAIL . " and the OWNER_PASSWORD from config.php.";
} catch (Throwable $e) {
    echo 'Error: ' . $e->getMessage();
}