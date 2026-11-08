<?php
// Campus Cafeteria - JSON API (PHP sessions + MySQL)
// Never print PHP warnings into the reply: they would break the JSON the page expects.
// (Problems still go to the PHP error log.)
ini_set('display_errors', '0');

session_start();
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/db.php';

// Menu lives on the server so prices can't be tampered with from the browser.
$MENU = [
    ['id' => 1, 'name' => 'Chicken Adobo Rice',  'price' => 65, 'emoji' => '🍗'],
    ['id' => 2, 'name' => 'Pork Sisig Rice',     'price' => 75, 'emoji' => '🍳'],
    ['id' => 3, 'name' => 'Spaghetti',           'price' => 50, 'emoji' => '🍝'],
    ['id' => 4, 'name' => 'Burger with Fries',   'price' => 70, 'emoji' => '🍔'],
    ['id' => 5, 'name' => 'Fried Chicken (1pc)', 'price' => 55, 'emoji' => '🍖'],
    ['id' => 6, 'name' => 'Pancit Canton',       'price' => 45, 'emoji' => '🍜'],
    ['id' => 7, 'name' => 'Iced Tea',            'price' => 25, 'emoji' => '🧋'],
    ['id' => 8, 'name' => 'Bottled Water',       'price' => 15, 'emoji' => '💧'],
];

function out($data, $code = 200) {
    http_response_code($code);
    echo json_encode($data);
    exit;
}

function body() {
    $d = json_decode(file_get_contents('php://input'), true);
    return is_array($d) ? $d : [];
}

function require_login() {
    if (empty($_SESSION['user'])) out(['error' => 'Please log in first.'], 401);
    return $_SESSION['user'];
}

$action = $_GET['action'] ?? '';

try {
    switch ($action) {

        case 'menu':
            out(['menu' => $MENU]);

        case 'me':
            out(['user' => $_SESSION['user'] ?? null]);

        case 'register': {
            $b = body();
            $name  = trim($b['name'] ?? '');
            $email = strtolower(trim($b['email'] ?? ''));
            $pass  = $b['password'] ?? '';
            if ($name === '' || mb_strlen($name) > 60) out(['error' => 'Enter your full name.'], 422);
            if (!filter_var($email, FILTER_VALIDATE_EMAIL)) out(['error' => 'Enter a valid email.'], 422);
            if (strlen($pass) < 6) out(['error' => 'Password must be at least 6 characters.'], 422);

            $pdo = db();
            try {
                $st = $pdo->prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)');
                $st->execute([$name, $email, password_hash($pass, PASSWORD_DEFAULT)]);
            } catch (PDOException $e) {
                if ($e->getCode() === '23000') out(['error' => 'That email is already registered.'], 409);
                throw $e;
            }
            session_regenerate_id(true);
            $_SESSION['user'] = ['id' => (int)$pdo->lastInsertId(), 'name' => $name, 'email' => $email];
            out(['user' => $_SESSION['user']]);
        }

        case 'login': {
            $b = body();
            $email = strtolower(trim($b['email'] ?? ''));
            $pass  = $b['password'] ?? '';
            $st = db()->prepare('SELECT * FROM users WHERE email = ?');
            $st->execute([$email]);
            $u = $st->fetch();
            if ($u && password_verify($pass, $u['password_hash'])) {
                session_regenerate_id(true);
                $_SESSION['user'] = ['id' => (int)$u['id'], 'name' => $u['name'], 'email' => $u['email']];
                out(['user' => $_SESSION['user']]);
            }
            out(['error' => 'Wrong email or password.'], 401);
        }

        case 'logout':
            $_SESSION = [];
            session_destroy();
            out(['ok' => true]);

        case 'order': {
            $user = require_login();
            $b = body();

            // Room like "MB 101": letters then digits, optional space.
            $room = strtoupper(trim($b['room'] ?? ''));
            if (!preg_match('/^([A-Z]{1,4})\s?(\d{1,4})$/', $room, $m)) {
                out(['error' => 'Enter a valid room, for example MB 101.'], 422);
            }
            $room = $m[1] . ' ' . $m[2];

            $byId = [];
            foreach ($MENU as $item) $byId[$item['id']] = $item;

            $lines = [];
            $subtotal = 0;
            foreach (($b['items'] ?? []) as $row) {
                $id  = (int)($row['id'] ?? 0);
                $qty = (int)($row['qty'] ?? 0);
                if (!isset($byId[$id]) || $qty < 1) continue;
                if ($qty > 20) out(['error' => 'Maximum 20 of each item.'], 422);
                $line = $qty * $byId[$id]['price'];
                $subtotal += $line;
                $lines[] = ['id' => $id, 'name' => $byId[$id]['name'], 'price' => $byId[$id]['price'],
                            'qty' => $qty, 'line_total' => $line];
            }
            if (!$lines) out(['error' => 'Choose at least one food item.'], 422);

            $note = mb_substr(trim($b['note'] ?? ''), 0, 120);

            $pdo = db();
            $pdo->beginTransaction();
            try {
                $pdo->prepare('INSERT INTO orders (user_id, room, note, subtotal) VALUES (?, ?, ?, ?)')
                    ->execute([$user['id'], $room, $note, $subtotal]);
                $orderId = (int)$pdo->lastInsertId();
                $ins = $pdo->prepare('INSERT INTO order_items (order_id, item_id, name, price, qty, line_total) VALUES (?, ?, ?, ?, ?, ?)');
                foreach ($lines as $l) {
                    $ins->execute([$orderId, $l['id'], $l['name'], $l['price'], $l['qty'], $l['line_total']]);
                }
                $pdo->commit();
            } catch (Throwable $e) {
                $pdo->rollBack();
                throw $e;
            }

            out(['order' => ['id' => $orderId, 'room' => $room, 'items' => $lines,
                             'subtotal' => $subtotal, 'note' => $note, 'status' => 'Preparing']]);
        }

        case 'my_orders': {
            $user = require_login();
            $pdo = db();
            $st = $pdo->prepare('SELECT id, room, subtotal, status, created_at FROM orders WHERE user_id = ? ORDER BY id DESC LIMIT 20');
            $st->execute([$user['id']]);
            $orders = $st->fetchAll();

            $itemSt = $pdo->prepare('SELECT name, qty FROM order_items WHERE order_id = ?');
            foreach ($orders as &$o) {
                $o['id'] = (int)$o['id'];
                $o['subtotal'] = (float)$o['subtotal'];
                $itemSt->execute([$o['id']]);
                $o['items'] = $itemSt->fetchAll();
            }
            unset($o);
            out(['orders' => $orders]);
        }

        default:
            out(['error' => 'Unknown action.'], 404);
    }
} catch (Throwable $e) {
    out(['error' => $e->getMessage()], 500);
}
