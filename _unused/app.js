// Campus Cafeteria - front end
const $ = (id) => document.getElementById(id);
const peso = (n) => '₱' + Number(n).toFixed(2);

let menu = [];
let cart = {};          // { itemId: qty }

async function api(action, payload) {
  // 1. Send the request. This only fails if api.php cannot be reached at all
  //    (for example the page was opened by double-clicking the file).
  let res;
  try {
    res = await fetch('api.php?action=' + action, payload ? {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    } : undefined);
  } catch (err) {
    throw new Error('Cannot reach api.php. Open this page from Laragon: http://localhost/Mcc-Canteen/order.html');
  }

  // 2. Read the reply as text first, so we can show a useful message
  //    when it is not valid JSON.
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    console.error('api.php did not return JSON. It returned:', text);

    // Live Server or any plain file server does not run PHP: it either sends the
    // PHP source code back as-is, or refuses the request (404 / 405 / 501).
    if (text.trim().startsWith('<?php') || [404, 405, 501].includes(res.status)) {
      throw new Error('PHP is not running here (HTTP ' + res.status + '). Open this page from Laragon: http://localhost/Mcc-Canteen/order.html, not Live Server.');
    }
    // Otherwise PHP printed a warning or error: show a short, readable piece of it
    const readable = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);
    throw new Error('Server error: ' + (readable || 'api.php returned an empty reply (check the PHP error log).'));
  }

  // 3. api.php answered with JSON. If it reported a problem, show its message.
  if (!res.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}

/* ---------- views ---------- */
function showAuth() {
  $('view-auth').classList.remove('hidden');
  $('view-app').classList.add('hidden');
}

async function showApp(user) {
  $('view-auth').classList.add('hidden');
  $('view-app').classList.remove('hidden');
  $('hello').textContent = 'Hi, ' + user.name.split(' ')[0];
  if (!menu.length) menu = (await api('menu')).menu;
  renderMenu();
  renderCart();
  loadHistory();
}

/* ---------- auth ---------- */
function setTab(login) {
  $('tab-login').classList.toggle('active', login);
  $('tab-signup').classList.toggle('active', !login);
  $('form-login').classList.toggle('hidden', !login);
  $('form-signup').classList.toggle('hidden', login);
  $('auth-error').textContent = '';
}
$('tab-login').onclick = () => setTab(true);
$('tab-signup').onclick = () => setTab(false);

async function submitAuth(e, action) {
  e.preventDefault();
  const payload = Object.fromEntries(new FormData(e.target));
  try {
    const { user } = await api(action, payload);
    e.target.reset();
    showApp(user);
  } catch (err) {
    $('auth-error').textContent = err.message;
  }
}
$('form-login').onsubmit = (e) => submitAuth(e, 'login');
$('form-signup').onsubmit = (e) => submitAuth(e, 'register');

$('btn-logout').onclick = async () => {
  await api('logout');
  cart = {};
  showAuth();
};

/* ---------- menu & cart ---------- */
function renderMenu() {
  const box = $('menu');
  box.innerHTML = '';
  menu.forEach((item) => {
    const card = document.createElement('div');
    card.className = 'item';
    card.id = 'item-' + item.id;
    card.innerHTML = `
      <div class="emoji"></div>
      <div class="name"></div>
      <div class="price"></div>
      <div class="stepper">
        <button type="button" aria-label="Remove one">−</button>
        <span class="qty">0</span>
        <button type="button" aria-label="Add one">+</button>
      </div>`;
    card.querySelector('.emoji').textContent = item.emoji;
    card.querySelector('.name').textContent = item.name;
    card.querySelector('.price').textContent = peso(item.price);
    const [minus, plus] = card.querySelectorAll('button');
    minus.onclick = () => changeQty(item.id, -1);
    plus.onclick = () => changeQty(item.id, +1);
    box.appendChild(card);
  });
}

function changeQty(id, delta) {
  const next = Math.max(0, Math.min(20, (cart[id] || 0) + delta));
  if (next === 0) delete cart[id]; else cart[id] = next;
  renderCart();
}

function renderCart() {
  const list = $('cart');
  list.innerHTML = '';
  let subtotal = 0, count = 0;

  menu.forEach((item) => {
    const qty = cart[item.id] || 0;
    const card = $('item-' + item.id);
    if (card) {
      card.classList.toggle('selected', qty > 0);
      card.querySelector('.qty').textContent = qty;
    }
    if (qty > 0) {
      subtotal += qty * item.price;
      count += qty;
      const li = document.createElement('li');
      const left = document.createElement('span');
      left.textContent = `${qty} × ${item.name}`;
      const right = document.createElement('span');
      right.textContent = peso(qty * item.price);
      li.append(left, right);
      list.appendChild(li);
    }
  });

  $('cart-empty').classList.toggle('hidden', subtotal > 0);
  $('subtotal').textContent = peso(subtotal);
  $('btn-order').disabled = subtotal === 0;

  // bottom bar (phones/tablets)
  $('cartbar').classList.toggle('hidden', count === 0);
  $('cartbar-count').textContent = count + (count === 1 ? ' item' : ' items');
  $('cartbar-total').textContent = peso(subtotal);
}

$('cartbar-btn').onclick = () =>
  $('order-card').scrollIntoView({ behavior: 'smooth', block: 'start' });

/* ---------- placing an order ---------- */
$('btn-order').onclick = async () => {
  $('order-error').textContent = '';
  const items = Object.entries(cart).map(([id, qty]) => ({ id: Number(id), qty }));
  $('btn-order').disabled = true;
  try {
    const { order } = await api('order', {
      items,
      room: $('room').value,
      note: $('note').value
    });
    $('modal-text').textContent =
      `Order #${order.id} — ${peso(order.subtotal)}. It will be delivered to room ${order.room}.`;
    $('modal').classList.remove('hidden');
    cart = {};
    $('note').value = '';
    renderCart();
    loadHistory();
  } catch (err) {
    $('order-error').textContent = err.message;
    renderCart();
  }
};
$('modal-close').onclick = () => $('modal').classList.add('hidden');

/* ---------- order history ---------- */
async function loadHistory() {
  try {
    const { orders } = await api('my_orders');
    const ul = $('history');
    ul.innerHTML = '';
    $('history-empty').classList.toggle('hidden', orders.length > 0);
    orders.slice(0, 8).forEach((o) => {
      const li = document.createElement('li');
      const row = document.createElement('div');
      row.className = 'row';
      const title = document.createElement('span');
      title.textContent = `#${o.id} · ${o.room} · ${peso(o.subtotal)}`;
      const badge = document.createElement('span');
      badge.className = 'badge ' + o.status;
      badge.textContent = o.status;
      row.append(title, badge);
      const detail = document.createElement('div');
      detail.className = 'muted';
      detail.textContent = o.items.map((i) => `${i.qty}× ${i.name}`).join(', ');
      li.append(row, detail);
      ul.appendChild(li);
    });
  } catch (_) { /* not logged in */ }
}

/* ---------- boot ---------- */
(async function init() {
  try {
    const { user } = await api('me');
    user ? showApp(user) : showAuth();
  } catch (_) { showAuth(); }
})();
