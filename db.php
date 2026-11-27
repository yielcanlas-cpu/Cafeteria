<?php
// Connects to MySQL and prepares the database.
// Everything is created automatically the first time, and an older database
// is upgraded in place, so you never have to fix tables by hand.
require_once __DIR__ . '/config.php';

// The steps an order goes through. The staff account moves orders along this list.
// Raise this number whenever setup_database() below gets new steps: every browser session then runs
// the setup again by itself (no need to log out and in).
const SCHEMA_VERSION = 7;

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
    if (!$sessionOn || ($_SESSION['schema_version'] ?? 0) !== SCHEMA_VERSION) {
        setup_database($conn);
        if ($sessionOn) $_SESSION['schema_version'] = SCHEMA_VERSION;
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
        role ENUM(\'student\',\'admin\',\'owner\') NOT NULL DEFAULT \'student\',
        phone VARCHAR(20) NOT NULL DEFAULT \'\',
        location VARCHAR(80) NOT NULL DEFAULT \'\',
        bio VARCHAR(200) NOT NULL DEFAULT \'\',
        birthdate DATE NULL DEFAULT NULL,
        promo_claimed_at TIMESTAMP NULL DEFAULT NULL,
        created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB');

    $pdo->exec('CREATE TABLE IF NOT EXISTS orders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        room VARCHAR(10) NOT NULL,
        floor TINYINT NULL DEFAULT NULL,
        note VARCHAR(120) NOT NULL DEFAULT \'\',
        subtotal DECIMAL(10,2) NOT NULL,
        discount DECIMAL(10,2) NOT NULL DEFAULT 0,
        delivery_fee DECIMAL(10,2) NOT NULL DEFAULT 0,
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
    // The menu (the main admin edits it on owner.html; api.php reads it)
    $pdo->exec('CREATE TABLE IF NOT EXISTS menu_list (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(80) NOT NULL,
        price DECIMAL(10,2) NOT NULL,
        category VARCHAR(20) NOT NULL DEFAULT \'Other\',
        available TINYINT(1) NOT NULL DEFAULT 1,
        sort_order INT NOT NULL DEFAULT 0
    ) ENGINE=InnoDB');

    // Small key/value settings (the promo switch and percent live here)
    $pdo->exec('CREATE TABLE IF NOT EXISTS site_settings (
        k VARCHAR(40) PRIMARY KEY,
        v VARCHAR(200) NOT NULL
    ) ENGINE=InnoDB');

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

    if (!column_exists($pdo, 'messages', 'images')) $pdo->exec('ALTER TABLE messages ADD COLUMN images VARCHAR(400) NULL DEFAULT NULL');   // JSON list of proof photo names

    // First-order promo: when the student passed the "first-time customer" check,
    // and how much was taken off each order
    if (!column_exists($pdo, 'users', 'promo_claimed_at')) $pdo->exec('ALTER TABLE users ADD COLUMN promo_claimed_at TIMESTAMP NULL DEFAULT NULL');
    if (!column_exists($pdo, 'orders', 'discount'))        $pdo->exec('ALTER TABLE orders ADD COLUMN discount DECIMAL(10,2) NOT NULL DEFAULT 0');

    // Profile birthdate, and the floor + delivery fee of each order (api.php uses all three)
    if (!column_exists($pdo, 'users', 'birthdate'))        $pdo->exec('ALTER TABLE users ADD COLUMN birthdate DATE NULL DEFAULT NULL');
    if (!column_exists($pdo, 'orders', 'floor'))           $pdo->exec('ALTER TABLE orders ADD COLUMN floor TINYINT NULL DEFAULT NULL');
    if (!column_exists($pdo, 'orders', 'delivery_fee'))    $pdo->exec('ALTER TABLE orders ADD COLUMN delivery_fee DECIMAL(10,2) NOT NULL DEFAULT 0');

    // Older databases only knew "Preparing" and "Delivered"
    $st = $pdo->prepare('SELECT COLUMN_TYPE FROM information_schema.COLUMNS
                         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?');
    $st->execute([DB_NAME, 'orders', 'status']);
    $statusType = (string)$st->fetchColumn();
    if (strpos($statusType, 'Cancelled') === false) {
        $pdo->exec("ALTER TABLE orders MODIFY status ENUM('Preparing','Ready','Delivered','Cancelled') NOT NULL DEFAULT 'Preparing'");
    }

    // Email verification. DEFAULT 1 on purpose: staff, the main admin and every account that existed
    // before this feature count as verified. Only new student sign-ups are saved with 0 (api.php 'register').
    if (!column_exists($pdo, 'users', 'email_verified')) $pdo->exec('ALTER TABLE users ADD COLUMN email_verified TINYINT(1) NOT NULL DEFAULT 1');
    // One pending code per student (only a hash of the code is stored, never the code itself)
    $pdo->exec('CREATE TABLE IF NOT EXISTS email_codes (
        user_id INT NOT NULL PRIMARY KEY,
        code_hash VARCHAR(255) NOT NULL,
        expires_at INT NOT NULL,
        sent_at INT NOT NULL,
        attempts TINYINT NOT NULL DEFAULT 0,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB');

    // 3. Make sure the staff account exists (INSERT IGNORE = skip if the email is already taken)
    // Student/staff accounts can be suspended by the main admin
    if (!column_exists($pdo, 'users', 'active')) $pdo->exec('ALTER TABLE users ADD COLUMN active TINYINT(1) NOT NULL DEFAULT 1');
    // Older databases only knew the roles student and admin
    $st->execute([DB_NAME, 'users', 'role']);
    if (strpos((string)$st->fetchColumn(), 'owner') === false) {
        $pdo->exec("ALTER TABLE users MODIFY role ENUM('student','admin','owner') NOT NULL DEFAULT 'student'");
    }

    // Starting menu (only when the table is empty): the foods and prices the site always had
    if ((int)$pdo->query('SELECT COUNT(*) FROM menu_list')->fetchColumn() === 0) {
        $seed = [[1,'Kwek-kwek',5,'Meryenda'],[2,'Turon',15,'Meryenda'],[3,'Iced Tea',15,'Drinks'],
                 [4,'Chicken Katsu',60,'Rice Meal'],[5,'Kare-kare',60,'Rice Meal'],[6,'Ham & Cheese',60,'Meryenda'],
                 [7,'Red Tea',60,'Drinks'],[8,'Coffee & Cookies',90,'Bundle'],[9,'Siomai & drink',85,'Bundle'],
                 [10,'Coffee & Fries',200,'Bundle'],[11,'Rice meal + Coke',85,'Bundle']];
        $ins = $pdo->prepare('INSERT INTO menu_list (id, name, price, category, sort_order) VALUES (?, ?, ?, ?, ?)');
        foreach ($seed as $i => $f) $ins->execute([$f[0], $f[1], $f[2], $f[3], $i + 1]);
    }

    // Every dish shown on menu.html becomes orderable (ONE time; after that the main admin owns the menu,
    // so a food they delete does not come back). Prices here are starting prices: change them on owner.html.
    if (!column_exists($pdo, 'menu_list', 'image')) $pdo->exec("ALTER TABLE menu_list ADD COLUMN image VARCHAR(120) NOT NULL DEFAULT ''");
    $seeded = $pdo->prepare('SELECT COUNT(*) FROM site_settings WHERE k = ?');
    $seeded->execute(['menu_page_foods']);
    if ((int)$seeded->fetchColumn() === 0) {
        $extra = [['Sisig', 60, 'Rice Meal', 'img/sisig.jpg'],
                 ['Bicol Express', 60, 'Rice Meal', 'img/bicol-express.jpg'],
                 ['Sinigang', 60, 'Rice Meal', 'img/sinigang.jpg'],
                 ['Tinola', 60, 'Rice Meal', 'img/tinola.jpg'],
                 ['Pork Adobo', 60, 'Rice Meal', 'img/pork-adobo.jpg'],
                 ['Menudo', 60, 'Rice Meal', 'img/menudo.jpg'],
                 ['Lumpiang Gulay', 10, 'Meryenda', 'img/lumpiang-gulay.jpg'],
                 ['Maruya', 10, 'Meryenda', 'img/maruya.jpg'],
                 ['Muffin', 15, 'Meryenda', 'img/muffin.jpg'],
                 ['Cheese Stick', 10, 'Meryenda', 'img/cheese-stick.jpg'],
                 ['Fried isaw', 10, 'Tusok-tusok', 'img/fried-isaw.jpg'],
                 ['Fried Tokwa', 10, 'Tusok-tusok', 'img/fried-tokwa.jpg'],
                 ['Fried Siomai', 10, 'Tusok-tusok', 'img/fried-siomai.jpg'],
                 ['Gulaman', 15, 'Drinks', 'img/sago at gulaman.jpg'],
                 ['Melon', 15, 'Drinks', 'img/melon.jpg']];
        $has  = $pdo->prepare('SELECT COUNT(*) FROM menu_list WHERE LOWER(name) = LOWER(?)');
        $add  = $pdo->prepare('INSERT INTO menu_list (name, price, category, image, sort_order) VALUES (?, ?, ?, ?, ?)');
        $next = (int)$pdo->query('SELECT COALESCE(MAX(sort_order), 0) FROM menu_list')->fetchColumn();
        foreach ($extra as $f) {
            $has->execute([$f[0]]);
            if ((int)$has->fetchColumn() === 0) $add->execute([$f[0], $f[1], $f[2], $f[3], ++$next]);
        }
        $pdo->exec("UPDATE menu_list SET category = 'Tusok-tusok' WHERE name = 'Kwek-kwek' AND category = 'Meryenda'");
        $pdo->prepare('INSERT IGNORE INTO site_settings (k, v) VALUES (?, ?)')->execute(['menu_page_foods', '1']);
    }

    // Promo settings start from config.php
    $pdo->prepare('INSERT IGNORE INTO site_settings (k, v) VALUES (?, ?)')->execute(['promo_enabled', '1']);
    $pdo->prepare('INSERT IGNORE INTO site_settings (k, v) VALUES (?, ?)')->execute(['promo_percent', (string)FIRST_ORDER_DISCOUNT_PERCENT]);

    $admins = (int)$pdo->query("SELECT COUNT(*) FROM users WHERE role = 'admin'")->fetchColumn();
    if ($admins === 0) {
        $pdo->prepare("INSERT IGNORE INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'admin')")
            ->execute([ADMIN_NAME, strtolower(ADMIN_EMAIL), password_hash(ADMIN_PASSWORD, PASSWORD_DEFAULT)]);
    }

    // ... and the main admin (owner) account
    $owners = (int)$pdo->query("SELECT COUNT(*) FROM users WHERE role = 'owner'")->fetchColumn();
    if ($owners === 0) {
        $pdo->prepare("INSERT IGNORE INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'owner')")
            ->execute([OWNER_NAME, strtolower(OWNER_EMAIL), password_hash(OWNER_PASSWORD, PASSWORD_DEFAULT)]);
    }
}

// ---- settings helpers (used by api.php) ----
function setting(string $key, string $default = ''): string {
    $st = db()->prepare('SELECT v FROM site_settings WHERE k = ?');
    $st->execute([$key]);
    $v = $st->fetchColumn();
    return $v === false ? $default : (string)$v;
}
function set_setting(string $key, string $value): void {
    db()->prepare('INSERT INTO site_settings (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)')->execute([$key, $value]);
}
