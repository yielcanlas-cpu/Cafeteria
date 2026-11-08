<?php
// Canteen staff page: see incoming orders and mark them delivered.
session_start();
require_once __DIR__ . '/db.php';
 
function h($s) { return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8'); }
 
if (isset($_POST['logout'])) { unset($_SESSION['admin']); header('Location: admin.php'); exit; }
 
$error = '';
if (isset($_POST['password'])) {
    if (hash_equals(ADMIN_PASSWORD, $_POST['password'])) { $_SESSION['admin'] = true; header('Location: admin.php'); exit; }
    $error = 'Wrong password.';
}
 
$orders = [];
$dbError = '';
if (!empty($_SESSION['admin'])) {
    try {
        $pdo = db();
        if (isset($_POST['deliver'])) {
            $pdo->prepare("UPDATE orders SET status = 'Delivered' WHERE id = ?")->execute([(int)$_POST['deliver']]);
            header('Location: admin.php'); exit;
        }
        if (isset($_POST['delete'])) {
            $pdo->prepare('DELETE FROM orders WHERE id = ?')->execute([(int)$_POST['delete']]);
            header('Location: admin.php'); exit;
        }
        if (isset($_POST['clear_delivered'])) {
            $pdo->exec("DELETE FROM orders WHERE status = 'Delivered'");
            header('Location: admin.php'); exit;
        }
        $orders = $pdo->query('SELECT o.*, u.name AS customer FROM orders o JOIN users u ON u.id = o.user_id ORDER BY o.id DESC LIMIT 100')->fetchAll();
        $itemSt = $pdo->prepare('SELECT name, qty FROM order_items WHERE order_id = ?');
        foreach ($orders as &$o) {
            $itemSt->execute([$o['id']]);
            $o['items'] = $itemSt->fetchAll();
        }
        unset($o);
    } catch (Throwable $e) {
        $dbError = $e->getMessage();
    }
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Canteen Staff</title>
  <link rel="stylesheet" href="canteen.css">
  <?php if (!empty($_SESSION['admin'])): ?><meta http-equiv="refresh" content="20"><?php endif; ?>
  <style>
    .wrap { max-width: 900px; margin: 0 auto; padding: 1rem; }
    .order { display: flex; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
    .room { font-size: 1.4rem; font-weight: 800; color: var(--red); }
  </style>
</head>
<body>
<?php if (empty($_SESSION['admin'])): ?>
  <section class="view" style="min-height:100vh;display:grid;place-items:center;padding:1rem;background:linear-gradient(160deg,var(--red),var(--red-dark))">
    <form method="post" class="card auth-card">
      <div class="logo">👩‍🍳</div>
      <h1>Canteen Staff</h1>
      <label style="text-align:left">Password<input type="password" name="password" required autofocus></label>
      <button class="btn primary" type="submit">Enter</button>
      <p class="error"><?= h($error) ?></p>
    </form>
  </section>
<?php else: ?>
  <header class="topbar">
    <strong>🍽️ Incoming orders</strong>
    <div style="display:flex;gap:.5rem">
      <form method="post" onsubmit="return confirm('Delete ALL delivered orders? This cannot be undone.')">
        <button class="btn small ghost" name="clear_delivered" value="1">Clear delivered</button>
      </form>
      <form method="post"><button class="btn small ghost" name="logout" value="1">Log out</button></form>
    </div>
  </header>
  <div class="wrap">
    <?php if ($dbError): ?><p class="error"><?= h($dbError) ?></p><?php endif; ?>
    <?php if (!$orders && !$dbError): ?><p class="muted">No orders yet. This page refreshes every 20 seconds.</p><?php endif; ?>
    <?php foreach ($orders as $o): ?>
      <div class="card order">
        <div>
          <div class="room"><?= h($o['room']) ?></div>
          <strong>#<?= (int)$o['id'] ?> · <?= h($o['customer']) ?></strong>
          <div class="muted"><?= h(date('M j, g:i a', strtotime($o['created_at']))) ?></div>
          <ul>
            <?php foreach ($o['items'] as $i): ?><li><?= (int)$i['qty'] ?> × <?= h($i['name']) ?></li><?php endforeach; ?>
          </ul>
          <?php if ($o['note'] !== ''): ?><div class="muted">Note: <?= h($o['note']) ?></div><?php endif; ?>
        </div>
        <div style="text-align:right">
          <div class="subtotal" style="border:0;padding:0;gap:.6rem"><span>Total</span><strong>₱<?= number_format((float)$o['subtotal'], 2) ?></strong></div>
          <span class="badge <?= h($o['status']) ?>"><?= h($o['status']) ?></span>
          <?php if ($o['status'] !== 'Delivered'): ?>
            <form method="post" style="margin-top:.6rem"><button class="btn primary small" name="deliver" value="<?= (int)$o['id'] ?>">Mark delivered</button></form>
          <?php endif; ?>
          <form method="post" style="margin-top:.6rem" onsubmit="return confirm('Delete order #<?= (int)$o['id'] ?>? This cannot be undone.')">
            <button class="btn small ghost" name="delete" value="<?= (int)$o['id'] ?>">Delete</button>
          </form>
        </div>
      </div>
    <?php endforeach; ?>
  </div>
<?php endif; ?>
</body>
</html>
 