<?php
/**
 * Change the password of the owner or a staff account WITHOUT editing config.php.
 * Server computer only:  http://localhost/Mcc-Canteen/security/set-password.php
 */
if (!defined('MCCSEC_LOADED')) require_once __DIR__ . '/security.php';
session_name('MCCSEC'); session_start();
header('Content-Type: text/html; charset=utf-8');
if (!mccsec_is_local()) { http_response_code(403); exit('Forbidden.'); }
require_once dirname(__DIR__) . '/db.php';

$e = function ($s) { return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8'); };
$_SESSION['t'] = $_SESSION['t'] ?? bin2hex(random_bytes(16));
$msg = ''; $bad = false;

try {
    $pdo = db();
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $id = (int)($_POST['id'] ?? 0);
        $p1 = (string)($_POST['p1'] ?? ''); $p2 = (string)($_POST['p2'] ?? '');
        if (!isset($_POST['t']) || !hash_equals($_SESSION['t'], (string)$_POST['t'])) { $msg = 'Session expired. Reload and try again.'; $bad = true; }
        elseif (strlen($p1) < 12)  { $msg = 'Use at least 12 characters.'; $bad = true; }
        elseif ($p1 !== $p2)       { $msg = 'The two passwords are different.'; $bad = true; }
        elseif (in_array(strtolower($p1), [strtolower(OWNER_PASSWORD), strtolower(ADMIN_PASSWORD)], true)) { $msg = 'That is the default password. Choose a new one.'; $bad = true; }
        else {
            $st = $pdo->prepare("UPDATE users SET password_hash = ? WHERE id = ? AND role IN ('owner','admin')");
            $st->execute([password_hash($p1, PASSWORD_DEFAULT), $id]);
            $msg = $st->rowCount() ? 'Password changed.' : 'Nothing changed (account not found, or the password is the same as before).';
            $bad = !$st->rowCount();
        }
    }
    $users = $pdo->query("SELECT id, name, email, role FROM users WHERE role IN ('owner','admin') ORDER BY role DESC, id")->fetchAll();
} catch (Throwable $ex) { $users = []; $msg = 'Database error: ' . $ex->getMessage(); $bad = true; }
?><!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>MCC Canteen - Change password</title>
<style>
 body{font:16px/1.5 system-ui,Segoe UI,Arial,sans-serif;max-width:480px;margin:32px auto;padding:0 16px;color:#222}
 .card{border:1px solid #ddd;border-radius:10px;padding:16px 20px;margin:16px 0}
 .ok{background:#eaf7ee;border-color:#9bd3a8}.bad{background:#fdecec;border-color:#e3a1a1}
 label{display:block;margin:12px 0 4px}select,input{font:inherit;width:100%;padding:9px;box-sizing:border-box}
 button{font:inherit;margin-top:16px;padding:10px 18px;border-radius:8px;border:0;background:#a40000;color:#fff;cursor:pointer}a{color:#a40000}
</style>
<h1>Change password</h1>
<?php if ($msg): ?><div class="card <?= $bad ? 'bad' : 'ok' ?>"><?= $e($msg) ?></div><?php endif; ?>
<form method="post" class="card" autocomplete="off">
 <input type="hidden" name="t" value="<?= $e($_SESSION['t']) ?>">
 <label for="id">Account</label>
 <select id="id" name="id"><?php foreach ($users as $u): ?>
  <option value="<?= (int)$u['id'] ?>"><?= $e($u['role'] === 'owner' ? 'Main admin' : 'Staff') ?> - <?= $e($u['name']) ?> (<?= $e($u['email']) ?>)</option>
 <?php endforeach; ?></select>
 <label for="p1">New password (12+ characters)</label><input id="p1" name="p1" type="password" minlength="12" required>
 <label for="p2">Type it again</label><input id="p2" name="p2" type="password" minlength="12" required>
 <button>Change password</button>
</form>
<p><a href="install.php">Security setup</a></p>
</html>
