/* =========================================================
   menu.js  -  the menu page (menu.html)
   Needs common.js loaded first.
   ========================================================= */

const dishes = document.querySelectorAll(".dish");
const tabs = document.querySelectorAll(".menu-tab");


/* ---------------------------------------------------------
   1. TABS: show only the foods of the tab you pressed
   --------------------------------------------------------- */
function showCategory(category) {
  dishes.forEach(function (dish) { dish.hidden = dish.dataset.cat !== category; });
  tabs.forEach(function (tab) { tab.classList.toggle("active", tab.dataset.cat === category); });
}

tabs.forEach(function (tab) {
  tab.addEventListener("click", function () { showCategory(tab.dataset.cat); });
});


/* ---------------------------------------------------------
   2. LOGO + LOGIN/BACK  (common.js)
   Logged in -> the logo goes to YOUR home page, "Login" becomes a Back button,
   and "Sign up" is not needed any more, so it is hidden.
   --------------------------------------------------------- */
setupPublicHeader();

const signupLink = document.querySelector("#signupLink");
if (new URLSearchParams(location.search).get("from") === "app") signupLink.hidden = true;   // came from the dashboard: already logged in
getCurrentUser().then(function (user) {
  if (user) signupLink.hidden = true;
}).catch(function () { /* server not reachable: leave the header as it is */ });


/* ---------------------------------------------------------
   3. ORDER SUMMARY (right side)
   Uses the same cart as the front page (mcc_cart_<id> in the browser), so what you add here
   is also in "Your Order" on index.html. Prices and delivery fees come from api.php,
   and the server works out the real total when the order is placed.
   --------------------------------------------------------- */
const MAX_QTY = 20;            // the same limit as api.php

const osItems = document.querySelector("#osItems");
const osEmpty = document.querySelector("#osEmpty");
const osRoom = document.querySelector("#osRoom");
const osFloor = document.querySelector("#osFloor");
const osConfirm = document.querySelector("#osConfirm");

let me = null;                 // the logged-in user (null = guest)
let cart = [];
let menuById = {};
let deliveryFees = {};         // { 1: 5, 2: 10 }. Charged ONCE per order, not per food.
let promo = { percent: 10, claimed: false };
let placing = false;

function saveCart() {
  if (me) saveToBrowser("mcc_cart_" + me.id, JSON.stringify(cart));
}

// Re-draws the whole summary. Called after every add / remove / quantity change / floor change.
function renderSummary() {
  let sum = 0;
  let count = 0;
  osItems.innerHTML = "";

  cart.forEach(function (line, index) {
    sum += line.price * line.qty;
    count += line.qty;

    const li = document.createElement("li");
    li.innerHTML =
      '<div><span class="os-name"></span><span class="os-qty"><span class="os-unit"></span>' +
      '<button type="button" class="os-qty-btn minus" aria-label="One less">-</button><b></b>' +
      '<button type="button" class="os-qty-btn plus" aria-label="One more">+</button></span></div>' +
      '<span class="os-line"></span>' +
      '<button type="button" class="os-remove" aria-label="Remove">×</button>';
    li.querySelector(".os-name").textContent = line.name;
    li.querySelector(".os-unit").textContent = formatPrice(line.price) + " ×";
    li.querySelector("b").textContent = line.qty;
    li.querySelector(".os-line").textContent = formatPrice(line.price * line.qty);

    li.querySelector(".minus").addEventListener("click", function () {
      line.qty -= 1;
      if (line.qty < 1) cart.splice(index, 1);
      renderSummary();
    });
    li.querySelector(".plus").addEventListener("click", function () {
      if (line.qty >= MAX_QTY) { showToast("Maximum " + MAX_QTY + " of each item."); return; }
      line.qty += 1;
      renderSummary();
    });
    li.querySelector(".os-remove").addEventListener("click", function () {
      cart.splice(index, 1);
      renderSummary();
    });
    osItems.append(li);
  });

  const discount = (promo.claimed && sum > 0) ? Math.round(sum * promo.percent) / 100 : 0;
  const fee = sum > 0 ? (deliveryFees[osFloor.value] || 0) : 0;   // one fee per order

  document.querySelector("#osCount").textContent = "(" + count + ")";
  document.querySelector("#osSubtotal").textContent = formatPrice(sum);
  document.querySelector("#osDiscountRow").hidden = discount === 0;
  document.querySelector("#osDiscountLabel").textContent = "First-order discount (" + promo.percent + "%)";
  document.querySelector("#osDiscount").textContent = "-" + formatPrice(discount);
  document.querySelector("#osFee").textContent = formatPrice(fee);
  document.querySelector("#osTotal").textContent = formatPrice(sum - discount + fee);

  osItems.hidden = cart.length === 0;
  osEmpty.hidden = cart.length !== 0;
  osConfirm.disabled = cart.length === 0 || placing;
  saveCart();
}

// "Order Now" on a food: add it (or +1). Guests have to log in first.
document.querySelector("#dishGrid").addEventListener("click", function (event) {
  const button = event.target.closest(".order-btn");
  if (!button || button.disabled) return;
  if (!me) { location.href = "login.html?next=menu.html"; return; }
  if (me.role !== "student") { showToast("Staff accounts cannot place orders."); return; }

  const id = Number(button.dataset.id);
  const food = menuById[id];
  if (!food) return;
  const existing = cart.find(function (line) { return line.id === id; });
  if (existing) {
    if (existing.qty >= MAX_QTY) { showToast("Maximum " + MAX_QTY + " of each item."); return; }
    existing.qty += 1;
  } else {
    cart.push({ id: id, name: food.name, price: Number(food.price), qty: 1 });
  }
  renderSummary();
});

osFloor.addEventListener("change", function () {
  if (me) saveToBrowser("mcc_floor_" + me.id, osFloor.value);
  renderSummary();
});

osConfirm.addEventListener("click", async function () {
  const room = osRoom.value.trim();
  if (room === "") { showToast("Type the room to deliver to, for example MB 101."); osRoom.focus(); return; }
  if (osFloor.value === "") { showToast("Choose the floor to deliver to."); osFloor.focus(); return; }

  placing = true;
  osConfirm.textContent = "Placing order...";
  renderSummary();
  try {
    const { order } = await api("order", {
      items: cart.map(function (line) { return { id: line.id, qty: line.qty }; }),
      room: room,
      floor: Number(osFloor.value),
      note: ""
    });
    saveToBrowser("mcc_room_" + me.id, order.room);
    cart = [];
    const saved = order.discount > 0 ? " " + promo.percent + "% first-order discount applied." : "";
    showToast("Order #" + order.id + " placed! Total " + formatPrice(order.total) + "." + saved);
    api("promo_status").then(function (p) { promo = p; renderSummary(); }).catch(function () {});   // the promo can only be used once
  } catch (err) {
    showToast(err.message);
  } finally {
    placing = false;
    osConfirm.textContent = "Confirm Order";
    renderSummary();
  }
});

// An "Order Now" button works when the main admin's menu (owner.html > Menu & prices) has a food
// with the same id, or with the same NAME as the picture's caption. A food that is sold out
// or not on the menu stays gray.
function syncOrderButtons(menu) {
  const byName = {};
  menu.forEach(function (item) { byName[item.name.trim().toLowerCase().replace(/\s+/g, " ")] = item; });

  document.querySelectorAll(".order-btn").forEach(function (button) {
    const caption = button.parentElement.querySelector("figcaption");
    const name = caption ? caption.textContent.trim().toLowerCase().replace(/\s+/g, " ") : "";
    const item = (button.dataset.id && menuById[button.dataset.id]) || byName[name];
    if (item) {
      button.dataset.id = item.id;
      button.disabled = false;
      button.removeAttribute("title");
    } else {
      button.disabled = true;
      button.title = "Sold out or not available right now";
    }
  });
}

// Start: prices + fees from the server, then the saved cart of this customer
renderSummary();
api("menu").then(function (data) {
  data.menu.forEach(function (item) { menuById[item.id] = item; });
  syncOrderButtons(data.menu);
  deliveryFees = data.delivery_fees;
  fillFloorSelect(osFloor, deliveryFees);
  return getCurrentUser();
}).then(async function (user) {
  me = user;
  if (!me) return;
  osRoom.value = loadFromBrowser("mcc_room_" + me.id, "");
  osFloor.value = loadFromBrowser("mcc_floor_" + me.id, "");
  cart = loadJsonFromBrowser("mcc_cart_" + me.id, []);
  if (!Array.isArray(cart)) cart = [];
  // use the server's current prices and drop foods that are gone
  cart = cart.filter(function (line) { return menuById[line.id]; });
  cart.forEach(function (line) { line.price = Number(menuById[line.id].price); line.name = menuById[line.id].name; });
  try { promo = await api("promo_status"); } catch (err) { /* keep "no discount" */ }
  renderSummary();
}).catch(function () { /* server not reachable: the summary stays empty */ });
