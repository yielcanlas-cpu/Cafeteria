<?php
/**
 * MCC Canteen - security layer (NEW file, nothing in the existing code was changed).
 *
 * Apache/PHP loads this file BEFORE every PHP page (auto_prepend_file, set up by
 * security/install.php). The existing code does not know it exists and does not need to.
 *
 * What it does
 *   1. Locks the dangerous one-time scripts (reset-owner-password.php, create-owner.php,
 *      reset-staff-password.php, everything in _unused/) to the local computer only.
 *   2. Blocks opening config.php / db.php straight from the browser.
 *   3. Hardens the session cookie (strict mode, HttpOnly, Secure on HTTPS).
 *   4. api.php: CSRF protection (same-origin check + JSON-only POST), "change something"
 *      actions must be POST, request size limit.
 *   5. api.php: brute-force protection for login, plus limits on sign-up and contact spam.
 *   6. api.php: hides internal error details (database messages) from other computers
 *      while config.php has DEBUG = true.
 *   7. Adds security headers to every PHP reply.
 *
 * If anything inside the rate limiter itself fails (e.g. temp folder not writable), the
 * site keeps working: only the limiter is skipped, never the site.
 */

if (PHP_SAPI === 'cli' || PHP_SAPI === 'phpdbg' || defined('MCCSEC_LOADED')) { return; }
define('MCCSEC_LOADED', true);

// ---- limits (change here if needed) ----
const MCCSEC_LOGIN_WINDOW        = 900;  // seconds a failed login is remembered (15 min)
const MCCSEC_LOGIN_MAX_ACCOUNT   = 5;    // failed logins per account, per computer, per window
const MCCSEC_LOGIN_MAX_IP        = 30;   // failed logins per computer per window (high: a whole campus can share one IP)
const MCCSEC_REGISTER_MAX        = 30;   // sign-ups per computer per hour
const MCCSEC_CONTACT_MAX         = 10;   // contact/messages per computer per 10 minutes
const MCCSEC_MAX_BODY_BYTES      = 65536;

// ---------------------------------------------------------------- helpers
function mccsec_ip(): string { return (string)($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0'); }
function mccsec_is_local(): bool { return in_array(mccsec_ip(), ['127.0.0.1', '::1'], true); }
function mccsec_https(): bool {
    return (!empty($_SERVER['HTTPS']) && strtolower((string)$_SERVER['HTTPS']) !== 'off')
        || (string)($_SERVER['SERVER_PORT'] ?? '') === '443';
}

function mccsec_deny(int $code, string $message, bool $json, array $extraHeaders = []): void {
    http_response_code($code);
    foreach ($extraHeaders as $h) header($h);
    if ($json) {
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        echo json_encode(['error' => $message], JSON_UNESCAPED_UNICODE);
    } else {
        header('Content-Type: text/plain; charset=utf-8');
        echo $message;
    }
    exit;
}

function mccsec_hostport(string $hostport, string $scheme): string {
    $hostport = strtolower(trim($hostport));
    $default  = $scheme === 'https' ? ':443' : ':80';
    if (substr($hostport, -strlen($default)) === $default) $hostport = substr($hostport, 0, -strlen($default));
    return $hostport;
}

// Does this URL (the Origin or Referer header) belong to this same website?
function mccsec_same_origin(string $url): bool {
    $p = parse_url($url);
    if (!$p || empty($p['host'])) return false;
    $scheme = strtolower((string)($p['scheme'] ?? 'http'));
    $hp = $p['host'] . (isset($p['port']) ? ':' . $p['port'] : '');
    return mccsec_hostport($hp, $scheme) === mccsec_hostport((string)($_SERVER['HTTP_HOST'] ?? ''), mccsec_https() ? 'https' : 'http');
}

// Tiny file-based counter (one small file per key, in the system temp folder, outside the website).
// Returns the timestamps still inside the window. $add = true records one more hit.
function mccsec_hits(string $key, int $window, bool $add = false): array {
    try {
        $dir = rtrim(sys_get_temp_dir(), '/\\') . DIRECTORY_SEPARATOR . 'mcc-canteen-security';
        if (!is_dir($dir)) @mkdir($dir, 0700, true);
        $f = @fopen($dir . DIRECTORY_SEPARATOR . sha1($key) . '.json', 'c+');
        if (!$f) return [];
        flock($f, LOCK_EX);
        $hits = json_decode((string)stream_get_contents($f), true);
        $now  = time();
        $hits = is_array($hits) ? array_values(array_filter($hits, function ($t) use ($now, $window) { return is_int($t) && $t > $now - $window; })) : [];
        if ($add) $hits[] = $now;
        $hits = array_slice($hits, -200);
        ftruncate($f, 0); rewind($f); fwrite($f, json_encode($hits)); fflush($f);
        flock($f, LOCK_UN); fclose($f);
        if (mt_rand(1, 200) === 1) mccsec_cleanup($dir);
        return $hits;
    } catch (Throwable $e) { return []; }
}
function mccsec_forget(string $key): void {
    try { @unlink(rtrim(sys_get_temp_dir(), '/\\') . DIRECTORY_SEPARATOR . 'mcc-canteen-security' . DIRECTORY_SEPARATOR . sha1($key) . '.json'); } catch (Throwable $e) {}
}
function mccsec_cleanup(string $dir): void {
    foreach ((array)glob($dir . DIRECTORY_SEPARATOR . '*.json') as $file) {
        if (@filemtime($file) < time() - 86400) @unlink($file);
    }
}
function mccsec_retry_after(array $hits, int $window): int {
    return $hits ? max(1, min($hits) + $window - time()) : 1;
}

// ---------------------------------------------------------------- 1. headers for every PHP reply
header_remove('X-Powered-By');
header('X-MCC-Security: on');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: SAMEORIGIN');
header('Referrer-Policy: strict-origin-when-cross-origin');
header('Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()');

// ---------------------------------------------------------------- 2. session cookie hardening
// (api.php calls session_start() after this file has run)
@ini_set('session.use_strict_mode', '1');
@ini_set('session.use_only_cookies', '1');
@ini_set('session.cookie_httponly', '1');
@ini_set('session.cookie_samesite', 'Lax');
if (mccsec_https()) @ini_set('session.cookie_secure', '1');

// ---------------------------------------------------------------- 3. files that must never run from the internet
$script = basename((string)($_SERVER['SCRIPT_FILENAME'] ?? ''));
$path   = str_replace('\\', '/', (string)($_SERVER['SCRIPT_FILENAME'] ?? ''));

$oneTime = ['create-owner.php', 'reset-owner-password.php', 'reset-staff-password.php'];
if ((in_array($script, $oneTime, true) || strpos($path, '/_unused/') !== false) && !mccsec_is_local()) {
    mccsec_deny(403, 'Forbidden.', false);
}
if (in_array($script, ['config.php', 'db.php'], true)) {
    mccsec_deny(403, 'Forbidden.', false);
}

// ---------------------------------------------------------------- 4. api.php guard
if ($script !== 'api.php') { return; }

$action = (string)($_GET['action'] ?? '');
$method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));

// Actions that change something. The site sends all of them as POST, except logout and
// promo_claim, which it sends as GET - so those two are allowed as GET but get the origin check.
$changing = ['login', 'register', 'verify_email', 'resend_code', 'logout', 'update_profile', 'promo_claim', 'contact', 'order', 'cancel_order',
    'admin_set_status', 'admin_delete_order', 'admin_reply_message',
    'owner_menu_save', 'owner_menu_toggle', 'owner_menu_all_available', 'owner_menu_delete',
    'owner_offers_save', 'owner_staff_create', 'owner_user_active', 'owner_user_password', 'owner_user_delete'];
$getAllowed = ['logout', 'promo_claim'];
$isChanging = in_array($action, $changing, true);

if ($method !== 'GET' && $method !== 'POST') {
    mccsec_deny(405, 'Method not allowed.', true, ['Allow: GET, POST']);
}
if ($isChanging && $method !== 'POST' && !in_array($action, $getAllowed, true)) {
    mccsec_deny(405, 'Use POST for this action.', true, ['Allow: POST']);
}
if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > MCCSEC_MAX_BODY_BYTES) {
    mccsec_deny(413, 'Request too large.', true);
}

// CSRF: a page on another website must not be able to make a logged-in browser act on this one.
if ($isChanging) {
    $site = strtolower((string)($_SERVER['HTTP_SEC_FETCH_SITE'] ?? ''));
    if ($site !== '' && $site !== 'same-origin' && $site !== 'none') {
        mccsec_deny(403, 'Blocked: request came from another website.', true);
    }
    if (!empty($_SERVER['HTTP_ORIGIN'])) {
        if (!mccsec_same_origin((string)$_SERVER['HTTP_ORIGIN'])) mccsec_deny(403, 'Blocked: request came from another website.', true);
    } elseif (!empty($_SERVER['HTTP_REFERER'])) {
        if (!mccsec_same_origin((string)$_SERVER['HTTP_REFERER'])) mccsec_deny(403, 'Blocked: request came from another website.', true);
    }
    // The site always sends JSON. A plain HTML form cannot, so this closes the form-post trick.
    if ($method === 'POST') {
        $ct = strtolower((string)($_SERVER['CONTENT_TYPE'] ?? ''));
        if (strpos($ct, 'application/json') !== 0) mccsec_deny(415, 'Unsupported request type.', true);
    }
}

// Brute-force and spam limits
$ip = mccsec_ip();
$onFinish = null;   // what to do with the final reply (see ob_start below)

if ($action === 'login' && $method === 'POST') {
    $b   = json_decode((string)file_get_contents('php://input'), true);
    $raw = strtolower(trim((string)(is_array($b) ? ($b['email'] ?? '') : '')));
    if (strpos($raw, '@') === false) $raw = substr(preg_replace('/\D+/', '', $raw), -10);   // phone: same number, any format
    $acctKey = 'login|' . $ip . '|' . substr($raw, 0, 120);
    $ipKey   = 'login-ip|' . $ip;

    $a = mccsec_hits($acctKey, MCCSEC_LOGIN_WINDOW);
    $i = mccsec_hits($ipKey, MCCSEC_LOGIN_WINDOW);
    if (count($a) >= MCCSEC_LOGIN_MAX_ACCOUNT || count($i) >= MCCSEC_LOGIN_MAX_IP) {
        $wait = count($a) >= MCCSEC_LOGIN_MAX_ACCOUNT ? mccsec_retry_after($a, MCCSEC_LOGIN_WINDOW) : mccsec_retry_after($i, MCCSEC_LOGIN_WINDOW);
        mccsec_deny(429, 'Too many failed log-in attempts. Please try again in ' . max(1, (int)ceil($wait / 60)) . ' minute(s).', true, ['Retry-After: ' . $wait]);
    }
    $onFinish = function (int $code) use ($acctKey, $ipKey) {
        if ($code === 401) { mccsec_hits($acctKey, MCCSEC_LOGIN_WINDOW, true); mccsec_hits($ipKey, MCCSEC_LOGIN_WINDOW, true); }
        elseif ($code === 200) { mccsec_forget($acctKey); }
    };
} elseif ($action === 'register' && $method === 'POST') {
    if (count(mccsec_hits('register|' . $ip, 3600, true)) > MCCSEC_REGISTER_MAX) {
        mccsec_deny(429, 'Too many sign-ups from this computer. Please try again later.', true, ['Retry-After: 3600']);
    }
} elseif (($action === 'verify_email' || $action === 'resend_code') && $method === 'POST') {
    // The code itself is also limited per account in api.php; this stops mail spam / guessing from one computer
    if (count(mccsec_hits('verify|' . $ip, 600, true)) > 30) {
        mccsec_deny(429, 'Too many tries. Please wait a few minutes.', true, ['Retry-After: 600']);
    }
} elseif ($action === 'contact' && $method === 'POST') {
    if (count(mccsec_hits('contact|' . $ip, 600, true)) > MCCSEC_CONTACT_MAX) {
        mccsec_deny(429, 'Too many messages. Please wait a few minutes.', true, ['Retry-After: 600']);
    }
}

// Look at api.php's finished reply: count failed logins, and hide internal error details
// from other computers (config.php has DEBUG = true, which would show database messages).
ob_start(function (string $buffer) use ($onFinish) {
    $code = (int)http_response_code();
    if ($onFinish) { try { $onFinish($code); } catch (Throwable $e) {} }
    if ($code >= 500 && !mccsec_is_local()) {
        return json_encode(['error' => 'Server error. Please try again.']);
    }
    return $buffer;
});
