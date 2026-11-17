<?php
// MCC Canteen - JSON API (PHP sessions + MySQL).
// The pages call it like:  api.php?action=login   (see common.js -> api())

// Never print PHP warnings into the reply: they would break the JSON the pages expect.
// (Problems still go to the PHP error log.)
ini_set('display_errors', '0');

// Laragon already has the "mbstring" extension. If it is ever missing, these simple
// stand-ins keep the site working instead of crashing.
if (!function_exists('mb_strlen')) {
    function mb_strlen($text) { return strlen($text); }
}
if (!function_exists('mb_substr')) {
    function mb_substr($text, $start, $length = null) {
        return $length === null ? substr($text, $start) : substr($text, $start, $length);
    }
}

// A name of our own, so it never clashes with other projects on localhost.
session_name('MCCSESSID');
session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'httponly' => true, 'samesite' => 'Lax']);
session_start();

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

require_once __DIR__ . '/db.php';

// ---------------------------------------------------------------
// THE MENU. The server only trusts these prices (never the browser's).
// Each food button in index.html has a matching data-id="..." number.
// To add a food: add a line here AND a button in index.html with the same id.
// ---------------------------------------------------------------
$MENU = [
    ['id' => 1,  'name' => 'Kwek-kwek',        'price' => 5],
    ['id' => 2,  'name' => 'Turon',            'price' => 15],
    ['id' => 3,  'name' => 'Iced Tea',         'price' => 15],
    ['id' => 4,  'name' => 'Chicken Katsu',    'price' => 60],
    ['id' => 5,  'name' => 'Kare-kare',        'price' => 60],
    ['id' => 6,  'name' => 'Ham & Cheese',     'price' => 60],
    ['id' => 7,  'name' => 'Red Tea',          'price' => 60],
    ['id' => 8,  'name' => 'Milk Tea Duo',     'price' => 90],
    ['id' => 9,  'name' => 'Rice meal + Coke', 'price' => 85],
    ['id' => 10, 'name' => 'Coffee + Fries',   'price' => 200],
];

// ---------------- helpers ----------------
function out($data, $code = 200) {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

function body(): array {
    $data = json_decode(file_get_contents('php://input'), true);
    return is_array($data) ? $data : [];
}

// The "Email or Number" box: turns what the person typed into the value we store and look up.
//   an email           -> lowercase email
//   a mobile number    -> 09xxxxxxxxx  (09123456789, 9123456789, +63 912 345 6789 all become 09123456789)
// Returns null when it is neither.
function normalize_login_id(string $raw): ?string {
    $raw = trim($raw);
    if ($raw === '') return null;

    if (strpos($raw, '@') !== false) {
        $email = strtolower($raw);
        return (filter_var($email, FILTER_VALIDATE_EMAIL) && strlen($email) <= 120) ? $email : null;
    }

    $digits = preg_replace('/[^0-9]/', '', $raw);              // keep only the digits
    if (preg_match('/^(?:63|0)?(9[0-9]{9})$/', $digits, $m)) {
        return '0' . $m[1];
    }
    return null;
}

// The logged-in user, read fresh from the database (so a changed role takes effect at once).
function current_user(): ?array {
    $id = (int)($_SESSION['uid'] ?? 0);
    if ($id <= 0) return null;
    $st = db()->prepare('SELECT id, name, email, role FROM users WHERE id = ?');
    $st->execute([$id]);
    $u = $st->fetch();
    if (!$u) { unset($_SESSION['uid']); return null; }
    $u['id'] = (int)$u['id'];
    return $u;
}

function require_login(): array {
    $u = current_user();
    if (!$u) out(['error' => 'Please log in first.'], 401);
    return $u;
}

function require_admin(): array {
    $u = require_login();
    if ($u['role'] !== 'admin') out(['error' => 'Staff only.'], 403);
    return $u;
}

// Is this student still a first-time customer?  Yes = no order yet except cancelled ones.
// (A cancelled first order does not use up the promo.)
function first_order_eligible(PDO $pdo, int $userId): bool {
    $st = $pdo->prepare("SELECT COUNT(*) FROM orders WHERE user_id = ? AND status <> 'Cancelled'");
    $st->execute([$userId]);
    return (int)$st->fetchColumn() === 0;
}

// Adds the food list to each order (one query for all orders).
function attach_items(PDO $pdo, array $orders): array {
    if (!$orders) return $orders;
    $ids = array_map(function ($o) { return (int)$o['id']; }, $orders);
    $marks = implode(',', array_fill(0, count($ids), '?'));
    $st = $pdo->prepare("SELECT order_id, name, qty, price FROM order_items WHERE order_id IN ($marks) ORDER BY id");
    $st->execute($ids);
    $byOrder = [];
    foreach ($st->fetchAll() as $row) {
        $byOrder[(int)$row['order_id']][] = [
            'name' => $row['name'], 'qty' => (int)$row['qty'], 'price' => (float)$row['price'],
        ];
    }
    foreach ($orders as &$o) {
        $o['id'] = (int)$o['id'];
        $o['subtotal'] = (float)$o['subtotal'];
        $o['discount'] = (float)($o['discount'] ?? 0);
        $o['total'] = round($o['subtotal'] - $o['discount'], 2);
        $o['items'] = $byOrder[$o['id']] ?? [];
    }
    unset($o);
    return $orders;
}

// ---------------- routes ----------------
$action = $_GET['action'] ?? '';

try {
    switch ($action) {

        case 'menu':
            out(['menu' => $MENU]);

        case 'me':
            out(['user' => current_user()]);

        case 'register': {
            $b = body();
            $name  = trim((string)($b['name'] ?? ''));
            $loginId = normalize_login_id((string)($b['email'] ?? ''));   // an email OR a mobile number
            $pass  = (string)($b['password'] ?? '');

            if ($name === '' || mb_strlen($name) > 60) out(['error' => 'Enter your name (up to 60 letters).'], 422);
            if ($loginId === null)                     out(['error' => 'Enter a valid email or a mobile number like 09123456789.'], 422);
            if (strlen($pass) < 8)                     out(['error' => 'Password must be at least 8 characters.'], 422);
            if ($loginId === strtolower(ADMIN_EMAIL))  out(['error' => 'That email is reserved.'], 409);

            // A mobile number is also saved as the account's phone number
            $phone = (strpos($loginId, '@') === false) ? $loginId : '';

            $pdo = db();
            try {
                $pdo->prepare('INSERT INTO users (name, email, password_hash, phone) VALUES (?, ?, ?, ?)')
                    ->execute([$name, $loginId, password_hash($pass, PASSWORD_DEFAULT), $phone]);
            } catch (PDOException $e) {
                if ((string)$e->getCode() === '23000') out(['error' => 'That email or number is already registered.'], 409);
                throw $e;
            }
            session_regenerate_id(true);
            $_SESSION['uid'] = (int)$pdo->lastInsertId();
            out(['user' => current_user()]);
        }

        case 'login': {
            $b = body();
            $loginId = normalize_login_id((string)($b['email'] ?? ''));   // an email OR a mobile number
            $pass  = (string)($b['password'] ?? '');
            $u = false;
            if ($loginId !== null) {
                $st = db()->prepare('SELECT id, password_hash FROM users WHERE email = ?');
                $st->execute([$loginId]);
                $u = $st->fetch();
            }
            if ($u && password_verify($pass, $u['password_hash'])) {
                session_regenerate_id(true);
                $_SESSION['uid'] = (int)$u['id'];
                out(['user' => current_user()]);
            }
            out(['error' => 'Wrong email/number or password.'], 401);
        }

        case 'logout': {
            $_SESSION = [];
            if (ini_get('session.use_cookies')) {
                $p = session_get_cookie_params();
                setcookie(session_name(), '', time() - 42000, $p['path'], $p['domain'], $p['secure'], $p['httponly']);
            }
            session_destroy();
            out(['ok' => true]);
        }

        // ----- profile -----
        case 'profile': {
            $user = require_login();
            $st = db()->prepare('SELECT id, name, email, role, phone, location, bio, created_at FROM users WHERE id = ?');
            $st->execute([$user['id']]);
            $p = $st->fetch();
            $p['id'] = (int)$p['id'];
            out(['profile' => $p]);
        }

        case 'update_profile': {
            $user = require_login();
            $b = body();
            $phone    = mb_substr(trim((string)($b['phone'] ?? '')), 0, 20);
            $location = mb_substr(trim((string)($b['location'] ?? '')), 0, 80);
            $bio      = mb_substr(trim((string)($b['bio'] ?? '')), 0, 200);
            if ($phone !== '' && !preg_match('/^[0-9+\-\s()]{5,20}$/', $phone)) {
                out(['error' => 'Enter a valid phone number.'], 422);
            }
            db()->prepare('UPDATE users SET phone = ?, location = ?, bio = ? WHERE id = ?')
                ->execute([$phone, $location, $bio, $user['id']]);
            out(['ok' => true, 'phone' => $phone, 'location' => $location, 'bio' => $bio]);
        }

        // ----- first-order promo -----
        // Where does this student stand?  eligible = still a first-time customer,
        // claimed = already passed the check, so the next order gets the discount.
        case 'promo_status': {
            $user = require_login();
            $pdo = db();
            $eligible = $user['role'] === 'student' && first_order_eligible($pdo, $user['id']);
            $st = $pdo->prepare('SELECT promo_claimed_at FROM users WHERE id = ?');
            $st->execute([$user['id']]);
            $claimedAt = $st->fetchColumn();
            out(['percent' => FIRST_ORDER_DISCOUNT_PERCENT, 'eligible' => $eligible,
                 'claimed' => $eligible && !empty($claimedAt)]);
        }

        // The "First-Time Customer?  Submit" button on offers.html: the server looks at the
        // order history. Only a student with no order yet can claim it.
        case 'promo_claim': {
            $user = require_login();
            if ($user['role'] !== 'student') out(['error' => 'The staff account cannot use this promo.'], 403);
            $pdo = db();
            if (!first_order_eligible($pdo, $user['id'])) {
                out(['error' => 'Sorry, this promo is for first-time customers only. Your account already has an order.'], 409);
            }
            $pdo->prepare('UPDATE users SET promo_claimed_at = COALESCE(promo_claimed_at, NOW()) WHERE id = ?')
                ->execute([$user['id']]);
            out(['ok' => true, 'percent' => FIRST_ORDER_DISCOUNT_PERCENT, 'claimed' => true]);
        }

        // ----- messages (contact form + Messages window) -----
        case 'contact': {
            $b = body();
            $name    = trim((string)($b['name'] ?? ''));
            $email   = strtolower(trim((string)($b['email'] ?? '')));
            $subject = trim((string)($b['subject'] ?? ''));
            $text    = trim((string)($b['message'] ?? ''));

            // A logged-in student does not have to type name/email again. (Their login can be
            // a mobile number, so we use it as the way to reach them.)
            $u = current_user();
            if ($u && $name === '')  $name = $u['name'];
            if ($u && $email === '') $email = strtolower($u['email']);

            if ($name === '' || mb_strlen($name) > 60)                       out(['error' => 'Enter your name (up to 60 letters).'], 422);
            if (strlen($email) > 120 || (!filter_var($email, FILTER_VALIDATE_EMAIL) && !($u && $email === strtolower($u['email'])))) {
                out(['error' => 'Enter a valid email address.'], 422);
            }
            if (mb_strlen($subject) > 100)                                   out(['error' => 'The subject is too long (up to 100 letters).'], 422);
            if (mb_strlen($text) < 5 || mb_strlen($text) > 1000)             out(['error' => 'Write your message (5 to 1000 letters).'], 422);

            // Slow down spam: one message every 20 seconds per visitor
            if (time() - (int)($_SESSION['last_message_at'] ?? 0) < 20) out(['error' => 'Please wait a few seconds before sending another message.'], 429);

            db()->prepare('INSERT INTO messages (user_id, name, email, subject, message) VALUES (?, ?, ?, ?, ?)')
                ->execute([$u ? $u['id'] : null, $name, $email, $subject, $text]);
            $_SESSION['last_message_at'] = time();
            out(['ok' => true]);
        }

        case 'my_messages': {
            $user = require_login();
            $st = db()->prepare('SELECT id, subject, message, reply, replied_at, created_at FROM messages WHERE user_id = ? ORDER BY id DESC LIMIT 30');
            $st->execute([$user['id']]);
            out(['messages' => $st->fetchAll()]);
        }

        // ----- student orders -----
        case 'order': {
            $user = require_login();
            $b = body();

            // Room like "MB 101": letters then digits, optional space.
            $room = strtoupper(trim((string)($b['room'] ?? '')));
            if (!preg_match('/^([A-Z]{1,4})\s?(\d{1,4})$/', $room, $m)) {
                out(['error' => 'Enter a valid room, for example MB 101.'], 422);
            }
            $room = $m[1] . ' ' . $m[2];

            $byId = [];
            foreach ($MENU as $item) $byId[$item['id']] = $item;

            // Add up the quantity of each food (the same food may appear twice).
            $qtyById = [];
            if (is_array($b['items'] ?? null)) {
                foreach ($b['items'] as $row) {
                    if (!is_array($row)) continue;
                    $id  = (int)($row['id'] ?? 0);
                    $qty = (int)($row['qty'] ?? 0);
                    if (!isset($byId[$id]) || $qty < 1) continue;
                    $qtyById[$id] = ($qtyById[$id] ?? 0) + $qty;
                }
            }

            $lines = [];
            $subtotal = 0;
            foreach ($qtyById as $id => $qty) {
                if ($qty > 20) out(['error' => 'Maximum 20 of each item.'], 422);
                $line = $qty * $byId[$id]['price'];
                $subtotal += $line;
                $lines[] = ['id' => $id, 'name' => $byId[$id]['name'], 'price' => $byId[$id]['price'],
                            'qty' => $qty, 'line_total' => $line];
            }
            if (!$lines) out(['error' => 'Choose at least one food item.'], 422);

            $note = mb_substr(trim((string)($b['note'] ?? '')), 0, 120);

            $pdo = db();
            $pdo->beginTransaction();
            try {
                // First-order promo. The student's row is locked while we check, so two orders
                // sent at the same moment cannot both get the discount.
                $lock = $pdo->prepare('SELECT promo_claimed_at FROM users WHERE id = ? FOR UPDATE');
                $lock->execute([$user['id']]);
                $discount = 0;
                if (!empty($lock->fetchColumn()) && first_order_eligible($pdo, $user['id'])) {
                    $discount = round($subtotal * FIRST_ORDER_DISCOUNT_PERCENT / 100, 2);
                }

                $pdo->prepare('INSERT INTO orders (user_id, room, note, subtotal, discount) VALUES (?, ?, ?, ?, ?)')
                    ->execute([$user['id'], $room, $note, $subtotal, $discount]);
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
                             'subtotal' => $subtotal, 'discount' => $discount,
                             'total' => round($subtotal - $discount, 2),
                             'note' => $note, 'status' => 'Preparing']]);
        }

        case 'my_orders': {
            $user = require_login();
            $pdo = db();
            $st = $pdo->prepare('SELECT id, room, note, subtotal, discount, status, created_at FROM orders WHERE user_id = ? ORDER BY id DESC LIMIT 30');
            $st->execute([$user['id']]);
            out(['orders' => attach_items($pdo, $st->fetchAll())]);
        }

        // A student may cancel their own order only while it is still "Preparing".
        case 'cancel_order': {
            $user = require_login();
            $id = (int)(body()['id'] ?? 0);
            $st = db()->prepare("UPDATE orders SET status = 'Cancelled' WHERE id = ? AND user_id = ? AND status = 'Preparing'");
            $st->execute([$id, $user['id']]);
            if ($st->rowCount() === 0) out(['error' => 'This order can no longer be cancelled.'], 409);
            out(['ok' => true]);
        }

        // ----- staff (admin account) -----
        case 'admin_orders': {
            require_admin();
            $pdo = db();
            $orders = $pdo->query(
                'SELECT o.id, o.room, o.note, o.subtotal, o.discount, o.status, o.created_at, u.name AS customer, u.email
                 FROM orders o JOIN users u ON u.id = o.user_id
                 ORDER BY o.id DESC LIMIT 200'
            )->fetchAll();

            $counts = array_fill_keys(ORDER_STATUSES, 0);
            foreach ($pdo->query('SELECT status, COUNT(*) AS c FROM orders GROUP BY status')->fetchAll() as $r) {
                $counts[$r['status']] = (int)$r['c'];
            }
            $today = (float)$pdo->query("SELECT COALESCE(SUM(subtotal - discount), 0) FROM orders
                                         WHERE status <> 'Cancelled' AND DATE(created_at) = CURDATE()")->fetchColumn();

            out(['orders' => attach_items($pdo, $orders), 'counts' => $counts, 'sales_today' => $today]);
        }

        case 'admin_set_status': {
            require_admin();
            $b = body();
            $id = (int)($b['id'] ?? 0);
            $status = (string)($b['status'] ?? '');
            if (!in_array($status, ORDER_STATUSES, true)) out(['error' => 'Unknown status.'], 422);
            db()->prepare('UPDATE orders SET status = ? WHERE id = ?')->execute([$status, $id]);
            out(['ok' => true]);
        }

        case 'admin_delete_order': {
            require_admin();
            $id = (int)(body()['id'] ?? 0);
            db()->prepare("DELETE FROM orders WHERE id = ? AND status IN ('Delivered','Cancelled')")->execute([$id]);
            out(['ok' => true]);
        }

        // ----- staff: messages from students -----
        case 'admin_messages': {
            require_admin();
            $rows = db()->query('SELECT id, name, email, subject, message, reply, replied_at, created_at
                                 FROM messages ORDER BY (reply IS NULL) DESC, id DESC LIMIT 100')->fetchAll();
            out(['messages' => $rows]);
        }

        case 'admin_reply_message': {
            require_admin();
            $b = body();
            $id = (int)($b['id'] ?? 0);
            $reply = trim((string)($b['reply'] ?? ''));
            if ($reply === '' || mb_strlen($reply) > 1000) out(['error' => 'Write a reply (up to 1000 letters).'], 422);
            $st = db()->prepare('UPDATE messages SET reply = ?, replied_at = NOW() WHERE id = ?');
            $st->execute([$reply, $id]);
            out(['ok' => true]);
        }

        default:
            out(['error' => 'Unknown action.'], 404);
    }
} catch (Throwable $e) {
    error_log('[MCC Canteen] ' . $e);
    $message = (DEBUG || $e instanceof RuntimeException) ? $e->getMessage() : 'Server error. Please try again.';
    out(['error' => $message], 500);
}
