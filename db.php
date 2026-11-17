<?php
// Connects to MySQL and prepares the database.
// Everything is created automatically the first time, and an older database
// is upgraded in place, so you never have to fix tables by hand.
require_once __DIR__ . '/config.php';

// The steps an order goes through. The staff account moves orders along this list.
const ORDER_STATUSES = ['Preparing', 'Ready', 'Delivered', 'Cancelled'];

function db(): PDO {
    static $pdo = null;
    if ($pdo !== null) return $pdo;

    try {
        $conn = new PDO(
            'mysql:host=' . DB_HOST . ';port=' . DB_PORT . ';charset=utf8mb4',
            DB_USER, DB_PASS,
            [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
             PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
             PDO::ATTR_EMULATE_PREPARES => false]
        );
    } catch (PDOException $e) {
        throw new RuntimeException('Cannot connect to MySQL. Open Laragon and click "Start All". (' . $e->getMessage() . ')');
    }

    $conn->exec('CREATE DATABASE IF NOT EXISTS `' . DB_NAME . '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    $conn->exec('USE `' . DB_NAME . '`');

    // Table setup only needs to run once per browser session (it is checked again after a log out).
    $sessionOn = session_status() === PHP_SESSION_ACTIVE;
    if (!$sessionOn || empty($_SESSION['schema_v2'])) {
        setup_database($conn);
        if ($sessionOn) $_SESSION['schema_v2'] = true;
    }

    // Only keep the connection once it is fully prepared.
    $pdo = $conn;
    return $pdo;
}

function column_exists(PDO $pdo, string $table, string $column): bool {
    $st = $pdo->prepare('SELECT COUNT(*) FROM information_schema.COLUMNS
                         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?');
    $st->execute([DB_NAME, $table, $column]);
    return (int)$st->fetchColumn() > 0;
}

function setup_database(PDO $pdo): void {
    // 1. Tables (only created when missing)
    $pdo->exec('CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(60) NOT NULL,
        email VARCHAR(120) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        role ENUM(\'student\',\'admin\') NOT NULL DEFAULT \'student\',
        phone VARCHAR(20) NOT NULL DEFAULT \'\',
        location VARCHAR(80) NOT NULL DEFAULT \'\',
        bio VARCHAR(200) NOT NULL DEFAULT \'\',
        created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB');

    $pdo->exec('CREATE TABLE IF NOT EXISTS orders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        room VARCHAR(10) NOT NULL,
        note VARCHAR(120) NOT NULL DEFAULT \'\',
        subtotal DECIMAL(10,2) NOT NULL,
        status ENUM(\'Preparing\',\'Ready\',\'Delivered\',\'Cancelled\') NOT NULL DEFAULT \'Preparing\',
        created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
    ) ENGINE=InnoDB');

    $pdo->exec('CREATE TABLE IF NOT EXISTS order_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_id INT NOT NULL,
        item_id INT NOT NULL,
        name VARCHAR(80) NOT NULL,
        price DECIMAL(10,2) NOT NULL,
        qty INT NOT NULL,
        line_total DECIMAL(10,2) NOT NULL,
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    ) ENGINE=InnoDB');

    // Messages sent from contact.html or the Messages window (staff can reply)
    $pdo->exec('CREATE TABLE IF NOT EXISTS messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NULL,
        name VARCHAR(60) NOT NULL,
        email VARCHAR(120) NOT NULL,
        subject VARCHAR(100) NOT NULL DEFAULT \'\',
        message VARCHAR(1000) NOT NULL,
        reply VARCHAR(1000) NULL,
        replied_at TIMESTAMP NULL DEFAULT NULL,
        created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB');

    // 2. Upgrade an older database: add the columns it is missing
    if (!column_exists($pdo, 'users', 'role'))     $pdo->exec("ALTER TABLE users ADD COLUMN role ENUM('student','admin') NOT NULL DEFAULT 'student'");
    if (!column_exists($pdo, 'users', 'phone'))    $pdo->exec("ALTER TABLE users ADD COLUMN phone VARCHAR(20) NOT NULL DEFAULT ''");
    if (!column_exists($pdo, 'users', 'location')) $pdo->exec("ALTER TABLE users ADD COLUMN location VARCHAR(80) NOT NULL DEFAULT ''");
    if (!column_exists($pdo, 'users', 'bio'))      $pdo->exec("ALTER TABLE users ADD COLUMN bio VARCHAR(200) NOT NULL DEFAULT ''");

    // First-order promo: when the student passed the "first-time customer" check,
    // and how much was taken off each order
    if (!column_exists($pdo, 'users', 'promo_claimed_at')) $pdo->exec('ALTER TABLE users ADD COLUMN promo_claimed_at TIMESTAMP NULL DEFAULT NULL');
    if (!column_exists($pdo, 'orders', 'discount'))        $pdo->exec('ALTER TABLE orders ADD COLUMN discount DECIMAL(10,2) NOT NULL DEFAULT 0');

    // Older databases only knew "Preparing" and "Delivered"
    $st = $pdo->prepare('SELECT COLUMN_TYPE FROM information_schema.COLUMNS
                         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?');
    $st->execute([DB_NAME, 'orders', 'status']);
    $statusType = (string)$st->fetchColumn();
    if (strpos($statusType, 'Cancelled') === false) {
        $pdo->exec("ALTER TABLE orders MODIFY status ENUM('Preparing','Ready','Delivered','Cancelled') NOT NULL DEFAULT 'Preparing'");
    }

    // 3. Make sure the staff account exists (INSERT IGNORE = skip if the email is already taken)
    $admins = (int)$pdo->query("SELECT COUNT(*) FROM users WHERE role = 'admin'")->fetchColumn();
    if ($admins === 0) {
        $pdo->prepare("INSERT IGNORE INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'admin')")
            ->execute([ADMIN_NAME, strtolower(ADMIN_EMAIL), password_hash(ADMIN_PASSWORD, PASSWORD_DEFAULT)]);
    }
}
