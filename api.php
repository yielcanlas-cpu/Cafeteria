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
require_once __DIR__ . '/mailer.php';

// ---------------------------------------------------------------
// THE MENU now lives in the database (table menu_list).
// The main admin edits names, prices and availability on owner.html.
// The server only trusts these prices (never the browser's).
// Each food button in index.html has a matching data-id="..." number.
// ---------------------------------------------------------------
const MENU_CATEGORIES = ['Rice Meal', 'Meryenda', 'Tusok-tusok', 'Drinks', 'Bundle', 'Other'];

function menu_rows(bool $onlyAvailable): array {
    $sql = 'SELECT id, name, price, category, available, image FROM menu_list'
         . ($onlyAvailable ? ' WHERE available = 1' : '') . ' ORDER BY sort_order, id';
    $rows = db()->query($sql)->fetchAll();
    foreach ($rows as &$r) {
        $r['id'] = (int)$r['id'];
        $r['price'] = (float)$r['price'];
        $r['available'] = (int)$r['available'] === 1;
    }
    unset($r);
    return $rows;
}

// The first-order promo: switch and percent are saved by the main admin (table site_settings).
function promo_enabled(): bool { return setting('promo_enabled', '1') === '1'; }
function promo_percent(): int  { return max(1, min(90, (int)setting('promo_percent', (string)FIRST_ORDER_DISCOUNT_PERCENT))); }

// DELIVERY FEE per floor. Charged ONCE per order, however many foods it has.
// The pages read these from the "menu" action, so change a price here only.
$DELIVERY_FEES = [1 => 5, 2 => 10];

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

// Saves the proof photos sent with a message (data URLs, already shrunk by contact.js).
// Only real jpeg/png/webp pictures up to 500 KB each, at most 3. Returns the saved file names.
function save_proof_images($list): array {
    if (!is_array($list)) return [];
    if (count($list) > 3) out(['error' => 'You can add up to 3 photos.'], 422);
    $dir = __DIR__ . '/uploads';
    if (!is_dir($dir) && !mkdir($dir, 0755, true)) out(['error' => 'Could not save the photo (uploads folder).'], 500);
    $types = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
    $names = [];
    foreach ($list as $url) {
        if (!is_string($url) || !preg_match('#^data:image/(?:jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$#', $url, $m)) out(['error' => 'Only JPG, PNG or WebP photos are allowed.'], 422);
        $bin = base64_decode($m[1], true);
        if ($bin === false || strlen($bin) > 500000) out(['error' => 'Each photo must be under 500 KB.'], 422);
        $info = @getimagesizefromstring($bin);
        if (!$info || !isset($types[$info['mime']])) out(['error' => 'That file is not a valid photo.'], 422);
        $name = bin2hex(random_bytes(16)) . '.' . $types[$info['mime']];
        file_put_contents($dir . '/' . $name, $bin);
        $names[] = $name;
    }
    return $names;
}

// messages.images (JSON list of names) -> list of urls the pages can show
function proof_urls(array $rows): array {
    foreach ($rows as &$r) {
        $names = json_decode((string)($r['images'] ?? ''), true);
        $r['images'] = is_array($names) ? array_map(fn($n) => 'uploads/' . $n, $names) : [];
    }
    return $rows;
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
    $st = db()->prepare('SELECT id, name, email, role, active, email_verified FROM users WHERE id = ?');
    $st->execute([$id]);
    $u = $st->fetch();
    if (!$u || (int)$u['active'] !== 1) { unset($_SESSION['uid']); return null; }
    // A student must have typed the emailed code first (staff and the main admin never need one)
    if ($u['role'] === 'student' && (int)$u['email_verified'] !== 1) { unset($_SESSION['uid']); return null; }
    unset($u['active'], $u['email_verified']);
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

function require_owner(): array {
    $u = require_login();
    if ($u['role'] !== 'owner') out(['error' => 'Main admin only.'], 403);
    return $u;
}

// ---------------- email verification (students only) ----------------
// Makes a new 6-digit code, saves only its hash, and emails it. Returns false (and sends nothing)
// when a code was sent less than VERIFY_RESEND_SECONDS ago and $force is false.
function send_verification_code(PDO $pdo, int $userId, string $email, string $name, bool $force = true): bool {
    $st = $pdo->prepare('SELECT sent_at FROM email_codes WHERE user_id = ?');
    $st->execute([$userId]);
    $sentAt = $st->fetchColumn();
    if (!$force && $sentAt !== false && time() - (int)$sentAt < VERIFY_RESEND_SECONDS) return false;

    $code = str_pad((string)random_int(0, 999999), 6, '0', STR_PAD_LEFT);
    $pdo->prepare('REPLACE INTO email_codes (user_id, code_hash, expires_at, sent_at, attempts) VALUES (?, ?, ?, ?, 0)')
        ->execute([$userId, password_hash($code, PASSWORD_DEFAULT), time() + VERIFY_CODE_MINUTES * 60, time()]);
    send_verification_email($email, $name, $code, VERIFY_CODE_MINUTES);
    return true;
}

// The student who just passed the password step (or just signed up) and now has to type the emailed code.
// It comes from the session, so the code step can only be reached after a correct password.
function pending_student(PDO $pdo): ?array {
    $id = (int)($_SESSION['pending_uid'] ?? 0);
    if ($id <= 0) return null;
    $st = $pdo->prepare("SELECT id, name, email, active FROM users WHERE id = ? AND role = 'student'");
    $st->execute([$id]);
    $u = $st->fetch();
    return $u ?: null;
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
        $o['delivery_fee'] = (float)($o['delivery_fee'] ?? 0);
        $o['total'] = round($o['subtotal'] - $o['discount'] + $o['delivery_fee'], 2);
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
            out(['menu' => menu_rows(true), 'delivery_fees' => $DELIVERY_FEES]);

        case 'me':
            out(['user' => current_user()]);

        // Public: is the first-order promo running, and how many percent? (the Offers page shows it)
        case 'promo_info':
            out(['enabled' => promo_enabled(), 'percent' => promo_percent()]);

        case 'register': {
            $b = body();
            $name  = trim((string)($b['name'] ?? ''));
            $loginId = normalize_login_id((string)($b['email'] ?? ''));
            $pass  = (string)($b['password'] ?? '');

            if ($name === '' || mb_strlen($name) > 60) out(['error' => 'Enter your name (up to 60 letters).'], 422);
            if ($loginId === null || strpos($loginId, '@') === false) {
                out(['error' => 'Please sign up with your email address. We send a verification code to it.'], 422);
            }
            if (strlen($pass) < 8)                     out(['error' => 'Password must be at least 8 characters.'], 422);
            if ($loginId === strtolower(ADMIN_EMAIL) || $loginId === strtolower(OWNER_EMAIL)) out(['error' => 'That email is reserved.'], 409);

            $pdo = db();
            $hash = password_hash($pass, PASSWORD_DEFAULT);

            // The same email may sign up again while it was never verified (typo in the password, lost code...).
            // Only the person who can read that mailbox can finish it, because the code goes there.
            $userId = 0;
            $st = $pdo->prepare('SELECT id, role, email_verified FROM users WHERE email = ?');
            $st->execute([$loginId]);
            $existing = $st->fetch();
            if ($existing) {
                if ($existing['role'] !== 'student' || (int)$existing['email_verified'] === 1) {
                    out(['error' => 'That email or number is already registered.'], 409);
                }
                $pdo->prepare('UPDATE users SET name = ?, password_hash = ? WHERE id = ?')->execute([$name, $hash, (int)$existing['id']]);
                $userId = (int)$existing['id'];
            } else {
                try {
                    $pdo->prepare('INSERT INTO users (name, email, password_hash, phone, email_verified) VALUES (?, ?, ?, ?, 0)')
                        ->execute([$name, $loginId, $hash, '']);
                } catch (PDOException $e) {
                    if ((string)$e->getCode() === '23000') out(['error' => 'That email or number is already registered.'], 409);
                    throw $e;
                }
                $userId = (int)$pdo->lastInsertId();
            }

            // No login yet: the student is logged in only after typing the emailed code (verify_email).
            try {
                send_verification_code($pdo, $userId, $loginId, $name, false);
            } catch (Throwable $e) {
                error_log('[MCC Canteen] verification email failed: ' . $e->getMessage());
                out(['error' => 'We could not send the verification email. ' . (DEBUG ? $e->getMessage() : 'Please check the email address and try again.')], 422);
            }
            session_regenerate_id(true);
            $_SESSION['pending_uid'] = $userId;
            out(['needs_verification' => true, 'email' => $loginId]);
        }

        case 'login': {
            $b = body();
            $loginId = normalize_login_id((string)($b['email'] ?? ''));   // an email OR a mobile number
            $pass  = (string)($b['password'] ?? '');
            $u = false;
            if ($loginId !== null) {
                $st = db()->prepare('SELECT id, name, email, role, password_hash, active, email_verified FROM users WHERE email = ?');
                $st->execute([$loginId]);
                $u = $st->fetch();
            }
            if ($u && password_verify($pass, $u['password_hash']) && (int)$u['active'] !== 1) {
                out(['error' => 'This account is suspended. Please ask the canteen.'], 403);
            }
            if ($u && password_verify($pass, $u['password_hash'])) {
                // EVERY student login needs the emailed code (staff and the main admin skip this).
                // Old accounts that signed up with a mobile number have no email to send to, so they log in as before.
                if ($u['role'] === 'student' && strpos($u['email'], '@') !== false) {
                    try {
                        send_verification_code(db(), (int)$u['id'], $u['email'], $u['name'], false);   // no new mail if one was just sent
                    } catch (Throwable $e) {
                        error_log('[MCC Canteen] verification email failed: ' . $e->getMessage());
                        out(['error' => 'We could not send the verification email. ' . (DEBUG ? $e->getMessage() : 'Please try again later.')], 422);
                    }
                    session_regenerate_id(true);
                    $_SESSION['pending_uid'] = (int)$u['id'];
                    out(['needs_verification' => true, 'email' => $u['email']]);
                }
                session_regenerate_id(true);
                $_SESSION['uid'] = (int)$u['id'];
                out(['user' => current_user()]);
            }
            out(['error' => 'Wrong email/number or password.'], 401);
        }

        // Student typed the 6-digit code from the email: check it, then log in.
        case 'verify_email': {
            $b = body();
            $code = preg_replace('/[^0-9]/', '', (string)($b['code'] ?? ''));
            if (strlen($code) !== 6) out(['error' => 'Enter the 6-digit code from your email.'], 422);

            $pdo = db();
            $u = pending_student($pdo);
            if (!$u) out(['error' => 'Your session ended. Please log in again.'], 422);
            if ((int)$u['active'] !== 1) out(['error' => 'This account is suspended. Please ask the canteen.'], 403);

            $st = $pdo->prepare('SELECT code_hash, expires_at, attempts FROM email_codes WHERE user_id = ?');
            $st->execute([(int)$u['id']]);
            $row = $st->fetch();
            if (!$row || (int)$row['expires_at'] < time()) {
                out(['error' => 'That code has expired. Tap "Resend code" to get a new one.'], 422);
            }
            // Count this try first (and refuse once the limit is reached), so many quick guesses cannot sneak through.
            $bump = $pdo->prepare('UPDATE email_codes SET attempts = attempts + 1 WHERE user_id = ? AND attempts < ?');
            $bump->execute([(int)$u['id'], VERIFY_MAX_TRIES]);
            if ($bump->rowCount() === 0) {
                out(['error' => 'Too many wrong tries. Tap "Resend code" to get a new code.'], 429);
            }
            if (!password_verify($code, $row['code_hash'])) {
                $left = max(0, VERIFY_MAX_TRIES - ((int)$row['attempts'] + 1));
                out(['error' => 'Wrong code.' . ($left > 0 ? " $left " . ($left === 1 ? 'try' : 'tries') . ' left.' : ' Tap "Resend code" to get a new code.')], 422);
            }

            $pdo->prepare('UPDATE users SET email_verified = 1 WHERE id = ?')->execute([(int)$u['id']]);
            $pdo->prepare('DELETE FROM email_codes WHERE user_id = ?')->execute([(int)$u['id']]);
            unset($_SESSION['pending_uid']);
            session_regenerate_id(true);
            $_SESSION['uid'] = (int)$u['id'];
            out(['user' => current_user()]);
        }

        // "Resend code": a new code, at most one every VERIFY_RESEND_SECONDS.
        case 'resend_code': {
            $pdo = db();
            $u = pending_student($pdo);
            if (!$u || (int)$u['active'] !== 1) out(['error' => 'Your session ended. Please log in again.'], 422);

            $st = $pdo->prepare('SELECT sent_at FROM email_codes WHERE user_id = ?');
            $st->execute([(int)$u['id']]);
            $sentAt = $st->fetchColumn();
            if ($sentAt !== false && time() - (int)$sentAt < VERIFY_RESEND_SECONDS) {
                $wait = VERIFY_RESEND_SECONDS - (time() - (int)$sentAt);
                out(['error' => "Please wait $wait second(s) before asking for a new code."], 429);
            }
            try {
                send_verification_code($pdo, (int)$u['id'], $u['email'], $u['name'], true);
            } catch (Throwable $e) {
                error_log('[MCC Canteen] verification email failed: ' . $e->getMessage());
                out(['error' => 'We could not send the verification email. ' . (DEBUG ? $e->getMessage() : 'Please try again later.')], 422);
            }
            out(['ok' => true]);
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
            $st = db()->prepare('SELECT id, name, email, role, phone, location, bio, birthdate, created_at FROM users WHERE id = ?');
            $st->execute([$user['id']]);
            $p = $st->fetch();
            $p['id'] = (int)$p['id'];
            out(['profile' => $p]);
        }

        // Only the fields that are sent get changed (the profile page does not send the phone).
        case 'update_profile': {
            $user = require_login();
            $b = body();
            $st = db()->prepare('SELECT name, phone, location, bio, birthdate FROM users WHERE id = ?');
            $st->execute([$user['id']]);
            $cur = $st->fetch();

            $pick = function (string $key, int $max) use ($b, $cur) {
                return array_key_exists($key, $b) ? mb_substr(trim((string)$b[$key]), 0, $max) : (string)$cur[$key];
            };
            $name      = $pick('name', 50);
            $phone     = $pick('phone', 20);
            $location  = $pick('location', 80);
            $bio       = $pick('bio', 200);
            $birthdate = $pick('birthdate', 10);

            if ($name === '') out(['error' => 'Name cannot be empty.'], 422);
            if ($phone !== '' && !preg_match('/^[0-9+\-\s()]{5,20}$/', $phone)) {
                out(['error' => 'Enter a valid phone number.'], 422);
            }
            if ($birthdate !== '') {
                $d = DateTime::createFromFormat('Y-m-d', $birthdate);
                if (!$d || $d->format('Y-m-d') !== $birthdate || $d > new DateTime('today')) {
                    out(['error' => 'Enter a valid birthdate.'], 422);
                }
            }
            db()->prepare('UPDATE users SET name = ?, phone = ?, location = ?, bio = ?, birthdate = NULLIF(?, \'\') WHERE id = ?')
                ->execute([$name, $phone, $location, $bio, $birthdate, $user['id']]);
            out(['ok' => true, 'name' => $name, 'phone' => $phone, 'location' => $location, 'bio' => $bio,
                 'birthdate' => $birthdate === '' ? null : $birthdate]);
        }

        // ----- first-order promo -----
        // Where does this student stand?  eligible = still a first-time customer,
        // claimed = already passed the check, so the next order gets the discount.
        case 'promo_status': {
            $user = require_login();
            $pdo = db();
            $enabled = promo_enabled();
            $eligible = $enabled && $user['role'] === 'student' && first_order_eligible($pdo, $user['id']);
            $st = $pdo->prepare('SELECT promo_claimed_at FROM users WHERE id = ?');
            $st->execute([$user['id']]);
            $claimedAt = $st->fetchColumn();
            out(['percent' => promo_percent(), 'enabled' => $enabled, 'eligible' => $eligible,
                 'claimed' => $eligible && !empty($claimedAt)]);
        }

        // The "First-Time Customer?  Submit" button on offers.html: the server looks at the
        // order history. Only a student with no order yet can claim it.
        case 'promo_claim': {
            $user = require_login();
            if ($user['role'] !== 'student') out(['error' => 'The staff account cannot use this promo.'], 403);
            $pdo = db();
            if (!promo_enabled()) out(['error' => 'Sorry, this promo is not running right now.'], 409);
            if (!first_order_eligible($pdo, $user['id'])) {
                out(['error' => 'Sorry, this promo is for first-time customers only. Your account already has an order.'], 409);
            }
            $pdo->prepare('UPDATE users SET promo_claimed_at = COALESCE(promo_claimed_at, NOW()) WHERE id = ?')
                ->execute([$user['id']]);
            out(['ok' => true, 'percent' => promo_percent(), 'claimed' => true]);
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

            $photos = save_proof_images($b['images'] ?? []);
            db()->prepare('INSERT INTO messages (user_id, name, email, subject, message, images) VALUES (?, ?, ?, ?, ?, ?)')
                ->execute([$u ? $u['id'] : null, $name, $email, $subject, $text, $photos ? json_encode($photos) : null]);
            $_SESSION['last_message_at'] = time();
            out(['ok' => true]);
        }

        case 'my_messages': {
            $user = require_login();
            $st = db()->prepare('SELECT id, subject, message, images, reply, replied_at, created_at FROM messages WHERE user_id = ? ORDER BY id DESC LIMIT 30');
            $st->execute([$user['id']]);
            out(['messages' => proof_urls($st->fetchAll())]);
        }

        // ----- student orders -----
        case 'order': {
            $user = require_login();
            if ($user['role'] !== 'student') out(['error' => 'Staff accounts cannot place orders.'], 403);
            $b = body();

            // Room like "MB 101": letters then digits, optional space.
            $room = strtoupper(trim((string)($b['room'] ?? '')));
            if (!preg_match('/^([A-Z]{1,4})\s?(\d{1,4})$/', $room, $m)) {
                out(['error' => 'Enter a valid room, for example MB 101.'], 422);
            }
            $room = $m[1] . ' ' . $m[2];

            // The floor decides the delivery fee (one fee per order).
            $floor = (int)($b['floor'] ?? 0);
            if (!isset($DELIVERY_FEES[$floor])) out(['error' => 'Choose the floor to deliver to.'], 422);
            $deliveryFee = $DELIVERY_FEES[$floor];

            $byId = [];
            foreach (menu_rows(true) as $item) $byId[$item['id']] = $item;

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
                if (promo_enabled() && !empty($lock->fetchColumn()) && first_order_eligible($pdo, $user['id'])) {
                    $discount = round($subtotal * promo_percent() / 100, 2);
                }

                $pdo->prepare('INSERT INTO orders (user_id, room, floor, note, subtotal, discount, delivery_fee) VALUES (?, ?, ?, ?, ?, ?, ?)')
                    ->execute([$user['id'], $room, $floor, $note, $subtotal, $discount, $deliveryFee]);
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

            out(['order' => ['id' => $orderId, 'room' => $room, 'floor' => $floor, 'items' => $lines,
                             'subtotal' => $subtotal, 'discount' => $discount, 'delivery_fee' => $deliveryFee,
                             'total' => round($subtotal - $discount + $deliveryFee, 2),
                             'note' => $note, 'status' => 'Preparing']]);
        }

        case 'my_orders': {
            $user = require_login();
            $pdo = db();
            $st = $pdo->prepare('SELECT id, room, note, subtotal, discount, delivery_fee, status, created_at FROM orders WHERE user_id = ? ORDER BY id DESC LIMIT 30');
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
                'SELECT o.id, o.room, o.note, o.subtotal, o.discount, o.delivery_fee, o.status, o.created_at, u.name AS customer, u.email
                 FROM orders o JOIN users u ON u.id = o.user_id
                 ORDER BY o.id DESC LIMIT 200'
            )->fetchAll();

            $counts = array_fill_keys(ORDER_STATUSES, 0);
            foreach ($pdo->query('SELECT status, COUNT(*) AS c FROM orders GROUP BY status')->fetchAll() as $r) {
                $counts[$r['status']] = (int)$r['c'];
            }
            $today = (float)$pdo->query("SELECT COALESCE(SUM(subtotal - discount + delivery_fee), 0) FROM orders
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
            $rows = db()->query('SELECT id, name, email, subject, message, images, reply, replied_at, created_at
                                 FROM messages ORDER BY (reply IS NULL) DESC, id DESC LIMIT 100')->fetchAll();
            out(['messages' => proof_urls($rows)]);
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

        // =====================================================================
        // ----- MAIN ADMIN (owner.html) -----
        // =====================================================================

        // Dashboard numbers
        case 'owner_dashboard': {
            require_owner();
            $pdo = db();
            $net = 'COALESCE(SUM(subtotal - discount + delivery_fee), 0)';
            $one = function (string $sql) use ($pdo) { return $pdo->query($sql)->fetchColumn(); };

            $counts = array_fill_keys(ORDER_STATUSES, 0);
            foreach ($pdo->query('SELECT status, COUNT(*) AS c FROM orders GROUP BY status')->fetchAll() as $r) {
                $counts[$r['status']] = (int)$r['c'];
            }

            // Sales for each of the last 7 days (days with no orders show 0)
            $byDay = [];
            foreach ($pdo->query("SELECT DATE(created_at) AS d, $net AS s FROM orders
                                  WHERE status <> 'Cancelled' AND created_at >= CURDATE() - INTERVAL 6 DAY
                                  GROUP BY DATE(created_at)")->fetchAll() as $r) {
                $byDay[$r['d']] = (float)$r['s'];
            }
            $days = [];
            for ($i = 6; $i >= 0; $i--) {
                $d = date('Y-m-d', strtotime("-$i day"));
                $days[] = ['date' => $d, 'sales' => $byDay[$d] ?? 0];
            }

            $top = $pdo->query("SELECT oi.name, SUM(oi.qty) AS qty, SUM(oi.line_total) AS revenue
                                FROM order_items oi JOIN orders o ON o.id = oi.order_id
                                WHERE o.status <> 'Cancelled' GROUP BY oi.name ORDER BY qty DESC LIMIT 5")->fetchAll();
            foreach ($top as &$t) { $t['qty'] = (int)$t['qty']; $t['revenue'] = (float)$t['revenue']; }
            unset($t);

            $recent = $pdo->query('SELECT o.id, o.room, o.subtotal, o.discount, o.delivery_fee, o.status, o.created_at, u.name AS customer
                                   FROM orders o JOIN users u ON u.id = o.user_id ORDER BY o.id DESC LIMIT 6')->fetchAll();
            foreach ($recent as &$o) {
                $o['id'] = (int)$o['id'];
                $o['total'] = round((float)$o['subtotal'] - (float)$o['discount'] + (float)$o['delivery_fee'], 2);
            }
            unset($o);

            out([
                'sales_today' => (float)$one("SELECT $net FROM orders WHERE status <> 'Cancelled' AND DATE(created_at) = CURDATE()"),
                'sales_week'  => (float)$one("SELECT $net FROM orders WHERE status <> 'Cancelled' AND created_at >= CURDATE() - INTERVAL 6 DAY"),
                'sales_total' => (float)$one("SELECT $net FROM orders WHERE status <> 'Cancelled'"),
                'orders_today' => (int)$one("SELECT COUNT(*) FROM orders WHERE status <> 'Cancelled' AND DATE(created_at) = CURDATE()"),
                'counts' => $counts,
                'students' => (int)$one("SELECT COUNT(*) FROM users WHERE role = 'student'"),
                'staff' => (int)$one("SELECT COUNT(*) FROM users WHERE role = 'admin'"),
                'unanswered' => (int)$one('SELECT COUNT(*) FROM messages WHERE reply IS NULL'),
                'days' => $days, 'top_items' => $top, 'recent' => $recent,
            ]);
        }

        // ----- menu & prices -----
        case 'owner_menu': {
            require_owner();
            out(['menu' => menu_rows(false), 'categories' => MENU_CATEGORIES]);
        }

        // Add (no id) or edit (with id) one food.
        case 'owner_menu_save': {
            require_owner();
            $b = body();
            $id = (int)($b['id'] ?? 0);
            $name = trim((string)($b['name'] ?? ''));
            $price = $b['price'] ?? null;
            $category = (string)($b['category'] ?? 'Other');
            $available = !empty($b['available']) ? 1 : 0;

            if ($name === '' || mb_strlen($name) > 80) out(['error' => 'Enter the food name (up to 80 letters).'], 422);
            if (!is_numeric($price) || (float)$price <= 0 || (float)$price > 10000) out(['error' => 'Enter a price above 0 (up to 10,000).'], 422);
            if (!in_array($category, MENU_CATEGORIES, true)) out(['error' => 'Choose a category.'], 422);
            $price = round((float)$price, 2);

            $pdo = db();
            if ($id > 0) {
                $pdo->prepare('UPDATE menu_list SET name = ?, price = ?, category = ?, available = ? WHERE id = ?')
                    ->execute([$name, $price, $category, $available, $id]);
            } else {
                $next = (int)$pdo->query('SELECT COALESCE(MAX(sort_order), 0) + 1 FROM menu_list')->fetchColumn();
                $pdo->prepare('INSERT INTO menu_list (name, price, category, available, sort_order) VALUES (?, ?, ?, ?, ?)')
                    ->execute([$name, $price, $category, $available, $next]);
                $id = (int)$pdo->lastInsertId();
            }
            out(['ok' => true, 'id' => $id]);
        }

        // The Available / Sold out switch
        case 'owner_menu_toggle': {
            require_owner();
            $b = body();
            db()->prepare('UPDATE menu_list SET available = ? WHERE id = ?')
                ->execute([!empty($b['available']) ? 1 : 0, (int)($b['id'] ?? 0)]);
            out(['ok' => true]);
        }

        // One press: every food on the menu becomes available again
        case 'owner_menu_all_available': {
            require_owner();
            db()->exec('UPDATE menu_list SET available = 1');
            out(['ok' => true]);
        }

        // Old orders keep their own copy of the name and price, so deleting a food is safe.
        case 'owner_menu_delete': {
            require_owner();
            db()->prepare('DELETE FROM menu_list WHERE id = ?')->execute([(int)(body()['id'] ?? 0)]);
            out(['ok' => true]);
        }

        // ----- offers & promo -----
        case 'owner_offers': {
            require_owner();
            $pdo = db();
            out([
                'enabled' => promo_enabled(), 'percent' => promo_percent(),
                'claimed' => (int)$pdo->query("SELECT COUNT(*) FROM users WHERE role = 'student' AND promo_claimed_at IS NOT NULL")->fetchColumn(),
                'used' => (int)$pdo->query("SELECT COUNT(*) FROM orders WHERE discount > 0 AND status <> 'Cancelled'")->fetchColumn(),
                'discount_total' => (float)$pdo->query("SELECT COALESCE(SUM(discount), 0) FROM orders WHERE status <> 'Cancelled'")->fetchColumn(),
            ]);
        }

        case 'owner_offers_save': {
            require_owner();
            $b = body();
            $percent = (int)($b['percent'] ?? 0);
            if ($percent < 1 || $percent > 50) out(['error' => 'The discount must be between 1% and 50%.'], 422);
            set_setting('promo_enabled', !empty($b['enabled']) ? '1' : '0');
            set_setting('promo_percent', (string)$percent);
            out(['ok' => true]);
        }

        // ----- staff accounts and student accounts -----
        // ?role=staff  or  ?role=student
        case 'owner_users': {
            require_owner();
            $dbRole = (($_GET['role'] ?? '') === 'staff') ? 'admin' : 'student';
            $st = db()->prepare("SELECT u.id, u.name, u.email, u.phone, u.active, u.created_at,
                                        COUNT(o.id) AS orders, COALESCE(SUM(o.subtotal - o.discount + o.delivery_fee), 0) AS spent
                                 FROM users u LEFT JOIN orders o ON o.user_id = u.id AND o.status <> 'Cancelled'
                                 WHERE u.role = ? GROUP BY u.id ORDER BY u.id DESC LIMIT 500");
            $st->execute([$dbRole]);
            $rows = $st->fetchAll();
            foreach ($rows as &$r) {
                $r['id'] = (int)$r['id']; $r['active'] = (int)$r['active'] === 1;
                $r['orders'] = (int)$r['orders']; $r['spent'] = (float)$r['spent'];
            }
            unset($r);
            out(['users' => $rows]);
        }

        // Only staff accounts are created here (students sign up themselves).
        case 'owner_staff_create': {
            require_owner();
            $b = body();
            $name = trim((string)($b['name'] ?? ''));
            $loginId = normalize_login_id((string)($b['email'] ?? ''));
            $pass = (string)($b['password'] ?? '');
            if ($name === '' || mb_strlen($name) > 60) out(['error' => 'Enter the name (up to 60 letters).'], 422);
            if ($loginId === null)                     out(['error' => 'Enter a valid email or a mobile number.'], 422);
            if (strlen($pass) < 8)                     out(['error' => 'Password must be at least 8 characters.'], 422);
            try {
                db()->prepare("INSERT INTO users (name, email, password_hash, role, phone) VALUES (?, ?, ?, 'admin', ?)")
                    ->execute([$name, $loginId, password_hash($pass, PASSWORD_DEFAULT), strpos($loginId, '@') === false ? $loginId : '']);
            } catch (PDOException $e) {
                if ((string)$e->getCode() === '23000') out(['error' => 'That email or number is already registered.'], 409);
                throw $e;
            }
            out(['ok' => true]);
        }

        // Suspend / re-activate. Works on staff and student accounts only (never on a main admin).
        case 'owner_user_active': {
            require_owner();
            $b = body();
            $st = db()->prepare("UPDATE users SET active = ? WHERE id = ? AND role IN ('admin','student')");
            $st->execute([!empty($b['active']) ? 1 : 0, (int)($b['id'] ?? 0)]);
            out(['ok' => true]);
        }

        case 'owner_user_password': {
            require_owner();
            $b = body();
            $pass = (string)($b['password'] ?? '');
            if (strlen($pass) < 8) out(['error' => 'Password must be at least 8 characters.'], 422);
            $st = db()->prepare("UPDATE users SET password_hash = ? WHERE id = ? AND role IN ('admin','student')");
            $st->execute([password_hash($pass, PASSWORD_DEFAULT), (int)($b['id'] ?? 0)]);
            out(['ok' => true]);
        }

        // An account that has orders cannot be deleted (it would erase the sales history): suspend it instead.
        case 'owner_user_delete': {
            require_owner();
            $id = (int)(body()['id'] ?? 0);
            $pdo = db();
            $st = $pdo->prepare('SELECT COUNT(*) FROM orders WHERE user_id = ?');
            $st->execute([$id]);
            if ((int)$st->fetchColumn() > 0) out(['error' => 'This account has orders, so it cannot be deleted. Suspend it instead.'], 409);
            $pdo->prepare("DELETE FROM users WHERE id = ? AND role IN ('admin','student')")->execute([$id]);
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
