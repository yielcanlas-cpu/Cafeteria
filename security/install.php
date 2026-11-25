<?php
/**
 * One-click installer for the security layer. Open it ON THE SERVER COMPUTER only:
 *   http://localhost/Mcc-Canteen/security/install.php
 *
 * It never edits any existing PHP / HTML / JS / CSS / SQL file. The only existing file it
 * touches is .htaccess, and only by ADDING a clearly marked block at the end (a backup is
 * saved first). If the site does not answer normally afterwards, it puts the backup back.
 * "Remove" deletes that block again.
 */
if (!defined('MCCSEC_LOADED')) require_once __DIR__ . '/security.php';
session_name('MCCSEC'); session_start();
header('Content-Type: text/html; charset=utf-8');
if (!mccsec_is_local()) { http_response_code(403); exit('Forbidden.'); }

const BEGIN_MARK = '# BEGIN MCC-SECURITY (added by security/install.php - remove with its Remove button)';
const END_MARK   = '# END MCC-SECURITY';
$root     = dirname(__DIR__);
$htaccess = $root . '/.htaccess';
$backup   = $root . '/.htaccess.pre-security.bak';
$prepend  = str_replace('\\', '/', __DIR__ . '/security.php');
$e = function ($s) { return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8'); };

function block_text(string $prepend): string {
    return BEGIN_MARK . "\n" . <<<HT
# Load the PHP security layer before every PHP page (Apache + mod_php, which Laragon uses).
<IfModule mod_php.c>
  php_value auto_prepend_file "$prepend"
</IfModule>
<IfModule mod_php7.c>
  php_value auto_prepend_file "$prepend"
</IfModule>

Options -Indexes

# Security headers for every file (pages, scripts, styles, images)
<IfModule mod_headers.c>
  Header always set X-Content-Type-Options "nosniff"
  Header always set X-Frame-Options "SAMEORIGIN"
  Header always set Referrer-Policy "strict-origin-when-cross-origin"
  Header always set Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=()"
  Header always set Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'"
  Header always set Strict-Transport-Security "max-age=15552000" "expr=%{HTTPS} == 'on'"
</IfModule>

# Source/config/database files must never be downloadable
<FilesMatch "(?i)^(config\.php|db\.php|.*\.sql|README\.md|.*\.bak|\.user\.ini|composer\.(json|lock))$">
  <IfModule mod_authz_core.c>
    Require all denied
  </IfModule>
</FilesMatch>
# One-time admin scripts: only from the server computer itself
<FilesMatch "(?i)^(create-owner|reset-owner-password|reset-staff-password)\.php$">
  <IfModule mod_authz_core.c>
    Require local
  </IfModule>
</FilesMatch>
# Hidden / leftover folders
<IfModule mod_alias.c>
  RedirectMatch 404 "(?i)/\.(git|svn|vscode)(/|$)"
  RedirectMatch 404 "(?i)/_unused(/|$)"
</IfModule>
HT . "\n" . END_MARK . "\n";
}

function strip_block(string $text): string {
    return preg_replace('/\R?' . preg_quote(BEGIN_MARK, '/') . '.*?' . preg_quote(END_MARK, '/') . '\R?/s', "\n", $text);
}
function installed(string $file): bool { return is_file($file) && strpos((string)file_get_contents($file), BEGIN_MARK) !== false; }

// Does the site answer, and is the security layer really running? (asks api.php over the loopback)
function self_test(): array {
    $base = (mccsec_https() ? 'https' : 'http') . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost')
          . rtrim(dirname(dirname($_SERVER['SCRIPT_NAME'])), '/\\') . '/api.php?action=menu';
    $ctx = stream_context_create(['http' => ['timeout' => 6, 'ignore_errors' => true], 'ssl' => ['verify_peer' => false, 'verify_peer_name' => false]]);
    $body = @file_get_contents($base, false, $ctx);
    if ($body === false || empty($http_response_header)) return ['ok' => null, 'active' => null, 'msg' => 'Could not test automatically.'];
    $status = (int)substr($http_response_header[0], 9, 3);
    $active = false;
    foreach ($http_response_header as $h) if (stripos($h, 'X-MCC-Security:') === 0) $active = true;
    return ['ok' => $status === 200, 'active' => $active, 'msg' => 'api.php answered HTTP ' . $status . '.'];
}

$msg = ''; $bad = false;
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $okToken = isset($_POST['t'], $_SESSION['t']) && hash_equals($_SESSION['t'], (string)$_POST['t']);
    if (!$okToken) { $msg = 'Session expired. Reload the page and try again.'; $bad = true; }
    elseif (($_POST['do'] ?? '') === 'install') {
        $old = is_file($htaccess) ? (string)file_get_contents($htaccess) : '';
        if (!is_file($backup)) @file_put_contents($backup, $old);
        $new = rtrim(strip_block($old)) . "\n\n" . block_text($prepend);
        if (@file_put_contents($htaccess, $new) === false) { $msg = 'Could not write .htaccess (file permissions).'; $bad = true; }
        else {
            if (!is_file($root . '/.user.ini')) @file_put_contents($root . '/.user.ini', "; PHP-FPM/FastCGI setups (ignored by Apache mod_php)\nauto_prepend_file = \"$prepend\"\n");
            $t = self_test();
            if ($t['ok'] === false) {
                @file_put_contents($htaccess, $old);
                $msg = 'The site did not answer normally after the change (' . $t['msg'] . '), so the old .htaccess was put back. Nothing changed.'; $bad = true;
            } else {
                $msg = 'Installed. ' . $t['msg'] . ' ' . ($t['active'] === true ? 'The PHP security layer is active.' : ($t['active'] === false ? 'WARNING: the PHP layer is not loading (your PHP may not run as an Apache module). The Apache rules are active; see SECURITY.md.' : ''));
                $bad = $t['active'] === false;
            }
        }
    } elseif (($_POST['do'] ?? '') === 'remove') {
        $old = is_file($htaccess) ? (string)file_get_contents($htaccess) : '';
        @file_put_contents($htaccess, rtrim(strip_block($old)) . "\n");
        if (is_file($root . '/.user.ini') && strpos((string)file_get_contents($root . '/.user.ini'), 'security.php') !== false) @unlink($root . '/.user.ini');
        $msg = 'Removed. The site is back to how it was.';
    }
}
$_SESSION['t'] = $_SESSION['t'] ?? bin2hex(random_bytes(16));
$isOn = installed($htaccess);

// Warn about the default passwords from config.php that are still in use
$warnings = [];
try {
    require_once $root . '/db.php';
    foreach (db()->query("SELECT name, email, role, password_hash FROM users WHERE role IN ('owner','admin')")->fetchAll() as $u) {
        $default = $u['role'] === 'owner' ? OWNER_PASSWORD : ADMIN_PASSWORD;
        if (password_verify($default, $u['password_hash'])) $warnings[] = $u;
    }
} catch (Throwable $ex) { /* database not running: skip the check */ }
?><!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>MCC Canteen - Security setup</title>
<style>
 body{font:16px/1.5 system-ui,Segoe UI,Arial,sans-serif;max-width:680px;margin:32px auto;padding:0 16px;color:#222}
 .card{border:1px solid #ddd;border-radius:10px;padding:16px 20px;margin:16px 0}
 .ok{background:#eaf7ee;border-color:#9bd3a8}.bad{background:#fdecec;border-color:#e3a1a1}
 button{font:inherit;padding:10px 18px;border-radius:8px;border:0;background:#a40000;color:#fff;cursor:pointer}
 button.gray{background:#666} a{color:#a40000}
</style>
<h1>Security setup</h1>
<?php if ($msg): ?><div class="card <?= $bad ? 'bad' : 'ok' ?>"><?= $e($msg) ?></div><?php endif; ?>
<?php if ($warnings): ?>
<div class="card bad"><b>Default password still in use:</b>
 <ul><?php foreach ($warnings as $w): ?><li><?= $e($w['name']) ?> (<?= $e($w['email']) ?>) - <?= $e($w['role']) ?></li><?php endforeach; ?></ul>
 These passwords are written in <code>config.php</code> and the README, so anyone can guess them.
 <a href="set-password.php">Change them now</a>.</div>
<?php endif; ?>
<div class="card">
 <p>Status: <b><?= $isOn ? 'Installed' : 'Not installed yet' ?></b></p>
 <p>This adds protection <b>without changing any existing page, script or style</b>. It only adds a marked block at the end of <code>.htaccess</code> (backup saved as <code>.htaccess.pre-security.bak</code>).</p>
 <form method="post"><input type="hidden" name="t" value="<?= $e($_SESSION['t']) ?>">
  <button name="do" value="install"><?= $isOn ? 'Re-install / update' : 'Install security' ?></button>
  <?php if ($isOn): ?> <button class="gray" name="do" value="remove">Remove</button><?php endif; ?>
 </form>
</div>
<p><a href="set-password.php">Change the owner / staff password</a> &middot; <a href="../landing.html">Back to the site</a></p>
</html>
