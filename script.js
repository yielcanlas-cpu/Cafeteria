/* =========================================================
   script.js  -  the dashboard (index.html)
   Needs common.js loaded first (it provides api, showToast, formatPrice...).

   How JavaScript works with HTML, in 3 steps:
   1. FIND an element      -> document.querySelector("#id")
   2. LISTEN for an event  -> element.addEventListener("click", function)
   3. CHANGE something     -> element.textContent = "...", element.classList.add("...")
   ========================================================= */

let currentUser = null;        // the logged-in student (filled in by start() below)


/* ---------------------------------------------------------
   0. START  -  who is logged in?
   Nobody -> go to the login page.  Staff account -> go to the staff page.
   The page stays invisible (class "checking") until we know.
   --------------------------------------------------------- */
(async function start() {
  try {
    currentUser = await getCurrentUser();
  } catch (err) {
    currentUser = null;                        // server not reachable: login.html explains why
  }

  if (!currentUser) {
    location.replace("login.html?next=index.html");
    return;
  }
  if (currentUser.role === "admin") {
    location.replace("admin.html");
    return;
  }

  // Show the person's name in the header and the welcome line
  document.querySelector("#userName").textContent = currentUser.name;
  document.querySelector("#welcomeName").textContent = currentUser.name;
  document.body.classList.remove("checking");  // reveal the page

  roomInput.value = loadFromBrowser("mcc_room_" + currentUser.id, "");   // remember the last room
  cart = JSON.parse(loadFromBrowser("mcc_cart_" + currentUser.id, "[]")) || [];
  updateCart();
  syncMenuWithServer();
  loadPromo();                                  // does this student get 10% off? (section 7)
  if (typeof initPanels === "function") initPanels();   // favorites hearts, notification dot (panels.js)
})();

// Tiny helpers: browser storage can be blocked, so every use is wrapped in try/catch
function loadFromBrowser(key, fallback) {
  try { return localStorage.getItem(key) ?? fallback; } catch (err) { return fallback; }
}
function saveToBrowser(key, value) {
  try { localStorage.setItem(key, value); } catch (err) { /* ignore */ }
}


/* ---------------------------------------------------------
   1. SIDEBAR TOGGLE  (hamburger button)
   Adds/removes the class "toggled" on <body>. The CSS does the
   actual hiding/showing, JS only flips the class.
   --------------------------------------------------------- */
const menuBtn = document.querySelector("#menuBtn");

menuBtn.addEventListener("click", function () {
  document.body.classList.toggle("toggled");
});


// The logo is a link to this home page: scroll back to the top instead of reloading
document.querySelector("#logoLink").addEventListener("click", function (event) {
  event.preventDefault();
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (typeof closePanel === "function") closePanel();
  if (!ordersModal.hidden) closeOrders();
});


/* ---------------------------------------------------------
   2. USER MENU  (the name chip in the header)
   --------------------------------------------------------- */
const userChip = document.querySelector("#userChip");
const userDropdown = document.querySelector("#userDropdown");

function toggleUserMenu(open) {
  userDropdown.hidden = !open;
  userChip.setAttribute("aria-expanded", open);
}

userChip.addEventListener("click", function (event) {
  event.stopPropagation();                     // so the "click anywhere" code below does not close it at once
  toggleUserMenu(userDropdown.hidden);
});
document.addEventListener("click", function () { toggleUserMenu(false); });

document.querySelector("#logoutBtn").addEventListener("click", logOut);      // logOut() is in common.js
document.querySelector("#myOrdersBtn").addEventListener("click", function () { openOrders(); });


/* ---------------------------------------------------------
   3. SIDEBAR LINKS
   Each link in index.html says what it does:
     data-action="orders"   -> do something on this page
     data-href="profile.html" -> go to another page
     data-toast="..."       -> show a message (feature not built yet)
   --------------------------------------------------------- */
const navLinks = document.querySelectorAll(".nav-link");
const homeLink = document.querySelector('.nav-link[data-action="home"]');

function setActive(link) {
  navLinks.forEach(function (other) { other.classList.remove("active"); });
  link.classList.add("active");
}

navLinks.forEach(function (link) {
  link.addEventListener("click", function (event) {
    event.preventDefault();                    // stops "#" from jumping the page

    if (link.dataset.href) { location.href = link.dataset.href; return; }
    if (link.dataset.toast) { showToast(link.dataset.toast); return; }

    // Delivery, Favorites, Messages, Notification, Help Center open a window (panels.js)
    if (link.dataset.panel) {
      setActive(link);
      openPanel(link.dataset.panel);
      if (window.innerWidth <= 800) document.body.classList.remove("toggled");
      return;
    }

    setActive(link);
    const action = link.dataset.action;
    if (action === "home") window.scrollTo({ top: 0, behavior: "smooth" });
    if (action === "categories") document.querySelector("#students-choice").scrollIntoView({ behavior: "smooth" });
    if (action === "orders") openOrders();

    // On phones the sidebar covers the page, so close it after choosing
    if (window.innerWidth <= 800) document.body.classList.remove("toggled");
  });
});


/* ---------------------------------------------------------
   4. BANNER CAROUSEL  (slides + dots)
   --------------------------------------------------------- */
const slides = document.querySelectorAll(".slide");
const dotsBox = document.querySelector("#dots");
let currentSlide = 0;                          // which slide is showing (0 = first)

function showSlide(number) {
  currentSlide = number;
  slides.forEach(function (slide, index) {
    slide.classList.toggle("active", index === number);   // toggle(name, true/false) adds or removes
  });
  document.querySelectorAll(".dot").forEach(function (dot, index) {
    dot.classList.toggle("active", index === number);
  });
}

if (slides.length > 0) {
  slides.forEach(function (slide, index) {     // one dot per slide
    const dot = document.createElement("button");
    dot.className = "dot";
    dot.setAttribute("aria-label", "Show slide " + (index + 1));
    dot.addEventListener("click", function () { showSlide(index); });
    dotsBox.appendChild(dot);
  });
  showSlide(0);

  // Every 4 seconds go to the next slide (the % wraps back to 0 at the end)
  setInterval(function () {
    showSlide((currentSlide + 1) % slides.length);
  }, 4000);
}

// "Order Now" on the banner scrolls down to the food
document.querySelector("#orderNowBtn").addEventListener("click", function () {
  document.querySelector("#students-choice").scrollIntoView({ behavior: "smooth" });
});


/* ---------------------------------------------------------
   5. SEARCH  (filters the food as you type)
   --------------------------------------------------------- */
const searchInput = document.querySelector("#searchInput");
const foodItems = document.querySelectorAll(".food");

searchInput.addEventListener("input", function () {
  const text = searchInput.value.trim().toLowerCase();   // lowercase so "Coke" = "coke"

  foodItems.forEach(function (food) {
    // includes() is true when the name contains what was typed
    food.hidden = !food.dataset.name.toLowerCase().includes(text);
  });
});


/* ---------------------------------------------------------
   6. MENU CHECK
   The server (api.php) is the one that knows the real prices.
   When the page opens we copy them onto the food buttons, and
   switch off any food the server does not know about.
   --------------------------------------------------------- */
async function syncMenuWithServer() {
  try {
    const { menu } = await api("menu");

    const byId = {};
    menu.forEach(function (item) { byId[item.id] = item; });

    foodItems.forEach(function (food) {
      const item = byId[Number(food.dataset.id)];
      if (item) {
        food.dataset.name = item.name;
        food.dataset.price = item.price;
        food.title = item.name + " · " + formatPrice(item.price);   // shows when you hover
      } else {
        food.disabled = true;                                        // not in api.php: cannot be ordered
        food.classList.add("unavailable");
        food.title = "Not available for ordering yet";
      }
    });

    // Refresh the cart with the server's prices and drop anything that is gone
    cart = cart.filter(function (line) { return byId[line.id]; });
    cart.forEach(function (line) {
      line.name = byId[line.id].name;
      line.price = byId[line.id].price;
    });
    updateCart();
  } catch (err) {
    showToast(err.message);
  }
}


/* ---------------------------------------------------------
   7. CART  (click a food to add it, the right-side panel updates)
   --------------------------------------------------------- */
const subtotalEl = document.querySelector("#subtotal");
const totalEl = document.querySelector("#total");
const confirmBtn = document.querySelector("#confirmBtn");
const orderMoreBtn = document.querySelector("#orderMoreBtn");
const cancelBtn = document.querySelector("#cancelBtn");
const cartItemsEl = document.querySelector("#cartItems");
const cartEmptyEl = document.querySelector("#cartEmpty");
const itemCountEl = document.querySelector("#itemCount");
const fabCountEl = document.querySelector("#fabCount");
const cartFab = document.querySelector("#cartFab");
const cartClose = document.querySelector("#cartClose");
const roomInput = document.querySelector("#roomInput");
const noteInput = document.querySelector("#noteInput");
const discountRow = document.querySelector("#discountRow");
const discountAmt = document.querySelector("#discountAmt");
const discountLabel = document.querySelector("#discountLabel");
const promoHint = document.querySelector("#promoHint");

const MAX_QTY = 20;            // the same limit as api.php

// The 10% first-order promo. api.php decides (promo_status):
//   eligible = still a first-time customer       claimed = passed the check on offers.html
// Only "claimed" students see the discount; the SERVER works out the real amount.
let promo = { percent: 10, eligible: false, claimed: false };

async function loadPromo() {
  try { promo = await api("promo_status"); } catch (err) { /* keep "no discount" */ }
  updateCart();
  if (typeof checkNotificationDot === "function") checkNotificationDot();   // panels.js
}

// Each line is one kind of food, e.g. [{ id: 1, name: "Kwek-kwek", price: 5, qty: 2 }, ...]
let cart = [];
let placingOrder = false;      // true while we wait for the server

// Re-draws the whole panel using whatever is currently in the cart
function updateCart() {
  let sum = 0;
  let count = 0;

  cartItemsEl.innerHTML = "";                  // empty the list first

  cart.forEach(function (line, index) {
    sum += line.price * line.qty;
    count += line.qty;

    // Build one <li> row: name + quantity buttons | price | remove button
    const li = document.createElement("li");
    li.innerHTML =
      '<div><span class="item-name"></span>' +
      '<span class="item-qty"><span class="item-unit"></span>' +
      '<button type="button" class="qty-btn minus" aria-label="One less">-</button>' +
      '<b class="qty"></b>' +
      '<button type="button" class="qty-btn plus" aria-label="One more">+</button></span></div>' +
      '<span class="item-price"></span>' +
      '<button type="button" class="remove-btn" aria-label="Remove"><img src="img/icons/x.svg" alt=""></button>';

    // textContent puts plain text into the empty spans
    li.querySelector(".item-name").textContent = line.name;
    li.querySelector(".item-unit").textContent = formatPrice(line.price) + " ×";
    li.querySelector(".qty").textContent = line.qty;
    li.querySelector(".item-price").textContent = formatPrice(line.price * line.qty);

    li.querySelector(".minus").addEventListener("click", function () {
      line.qty -= 1;
      if (line.qty < 1) cart.splice(index, 1);       // 0 left -> remove the line
      updateCart();
    });
    li.querySelector(".plus").addEventListener("click", function () {
      if (line.qty >= MAX_QTY) { showToast("Maximum " + MAX_QTY + " of each item."); return; }
      line.qty += 1;
      updateCart();
    });
    li.querySelector(".remove-btn").addEventListener("click", function () {
      cart.splice(index, 1);                         // splice(position, 1) removes 1 line
      updateCart();
    });

    cartItemsEl.appendChild(li);
  });

  // First-order discount (only for a verified first-time customer with something in the cart)
  const discount = (promo.claimed && sum > 0) ? Math.round(sum * promo.percent) / 100 : 0;
  subtotalEl.textContent = formatPrice(sum);
  discountRow.hidden = discount === 0;
  discountLabel.textContent = "First-order discount (" + promo.percent + "%)";
  discountAmt.textContent = "-" + formatPrice(discount);
  promoHint.hidden = !(promo.eligible && !promo.claimed);   // first-timer who has not verified yet
  totalEl.textContent = formatPrice(sum - discount);

  itemCountEl.textContent = "(" + count + ")";
  fabCountEl.textContent = count;

  // Empty cart: show the message, hide the list, gray out the buttons
  const isEmpty = cart.length === 0;
  cartEmptyEl.hidden = !isEmpty;
  cartItemsEl.hidden = isEmpty;
  confirmBtn.disabled = isEmpty || placingOrder;
  cancelBtn.disabled = isEmpty || placingOrder;

  // Keep the cart if the page is refreshed
  if (currentUser) saveToBrowser("mcc_cart_" + currentUser.id, JSON.stringify(cart));
}

// Click a food -> add it (or add +1 if it is already in the cart)
foodItems.forEach(function (food) {
  food.addEventListener("click", function () {
    const id = Number(food.dataset.id);

    // find() looks for a line with the same food id
    const existing = cart.find(function (line) { return line.id === id; });

    if (existing) {
      if (existing.qty >= MAX_QTY) { showToast("Maximum " + MAX_QTY + " of each item."); return; }
      existing.qty += 1;
    } else {
      cart.push({
        id: id,
        name: food.dataset.name,
        price: Number(food.dataset.price),             // data-* values are text, so convert to a number
        qty: 1
      });
    }
    updateCart();
  });
});

// "Order More" goes back to the top to keep browsing (and closes the panel on phones)
orderMoreBtn.addEventListener("click", function () {
  document.body.classList.remove("cart-open");
  window.scrollTo({ top: 0, behavior: "smooth" });
});

// CANCEL THE WHOLE CART: ask first, then empty it
cancelBtn.addEventListener("click", function () {
  if (confirm("Remove everything from your order?")) {   // confirm() is true if they press OK
    cart = [];
    updateCart();
  }
});

// Phones: the round button opens the panel, the close button hides it
cartFab.addEventListener("click", function () { document.body.classList.add("cart-open"); });
cartClose.addEventListener("click", function () { document.body.classList.remove("cart-open"); });


/* ---------------------------------------------------------
   8. CONFIRM ORDER  -> sends the order to the server (api.php)
   The server checks the room, uses ITS OWN prices and saves the order.
   --------------------------------------------------------- */
confirmBtn.addEventListener("click", async function () {
  const room = roomInput.value.trim();
  if (room === "") {
    showToast("Type the room to deliver to, for example MB 101.");
    roomInput.focus();
    return;
  }

  placingOrder = true;
  confirmBtn.textContent = "Placing order...";
  updateCart();                                          // disables the buttons while we wait

  try {
    const { order } = await api("order", {
      // the server only needs the id and how many of each
      items: cart.map(function (line) { return { id: line.id, qty: line.qty }; }),
      room: room,
      note: noteInput.value.trim()
    });

    saveToBrowser("mcc_room_" + currentUser.id, order.room);   // remember the room (as the server tidied it: "MB 101")
    cart = [];
    noteInput.value = "";
    document.body.classList.remove("cart-open");
    const saved = order.discount > 0 ? " " + promo.percent + "% first-order discount applied (-" + formatPrice(order.discount) + ")." : "";
    showToast("Order #" + order.id + " placed! We will bring it to " + order.room + "." + saved);
    loadPromo();                                         // the promo can only be used once
  } catch (err) {
    showToast(err.message);                              // e.g. "Enter a valid room..."
  } finally {
    placingOrder = false;
    confirmBtn.textContent = "Confirm Order";
    updateCart();
  }
});


/* ---------------------------------------------------------
   9. MY ORDERS  (a window listing this student's orders)
   --------------------------------------------------------- */
const ordersModal = document.querySelector("#ordersModal");
const ordersList = document.querySelector("#ordersList");
const ordersEmpty = document.querySelector("#ordersEmpty");

async function openOrders() {
  ordersModal.hidden = false;
  await loadOrders();
}

function closeOrders() {
  ordersModal.hidden = true;
  setActive(homeLink);                         // the highlight goes back to Home
}

// Builds one row of the list. textContent is used for everything that comes from
// the database, so nothing typed by a user can ever be run as code.
function buildOrderRow(order) {
  const li = document.createElement("li");

  const head = document.createElement("div");
  head.className = "order-head";
  const title = document.createElement("strong");
  title.textContent = "Order #" + order.id;
  const badge = document.createElement("span");
  badge.className = "badge " + order.status;             // colours come from common.css
  badge.textContent = order.status;
  head.append(title, badge);

  const items = document.createElement("div");
  items.className = "order-items";
  items.textContent = order.items.map(function (i) { return i.qty + " × " + i.name; }).join(", ");

  const meta = document.createElement("div");
  meta.className = "order-meta";
  meta.textContent = "Room " + order.room + " · " + formatPrice(order.total) + " · " + formatDate(order.created_at);

  li.append(head, items, meta);

  if (order.discount > 0) {
    const off = document.createElement("div");
    off.className = "order-meta";
    off.textContent = "First-order discount: -" + formatPrice(order.discount) + " (Subtotal " + formatPrice(order.subtotal) + ")";
    li.append(off);
  }

  if (order.note) {
    const note = document.createElement("div");
    note.className = "order-meta";
    note.textContent = "Note: " + order.note;
    li.append(note);
  }

  // A student can cancel only while the kitchen has not started yet
  if (order.status === "Preparing") {
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "order-cancel";
    cancel.textContent = "Cancel this order";
    cancel.addEventListener("click", async function () {
      if (!confirm("Cancel order #" + order.id + "?")) return;
      try {
        await api("cancel_order", { id: order.id });
        showToast("Order #" + order.id + " cancelled.");
        loadPromo();                                     // a cancelled first order gives the promo back
      } catch (err) {
        showToast(err.message);
      }
      loadOrders();                                      // refresh the list either way
    });
    li.append(cancel);
  }
  return li;
}

async function loadOrders() {
  try {
    const { orders } = await api("my_orders");
    ordersList.innerHTML = "";
    orders.forEach(function (order) { ordersList.appendChild(buildOrderRow(order)); });
    ordersEmpty.hidden = orders.length > 0;
  } catch (err) {
    showToast(err.message);
  }
}

document.querySelector("#ordersClose").addEventListener("click", closeOrders);
ordersModal.addEventListener("click", function (event) {
  if (event.target === ordersModal) closeOrders();       // clicking the dark area closes it
});
document.addEventListener("keydown", function (event) {
  if (event.key === "Escape") {
    toggleUserMenu(false);
    if (!ordersModal.hidden) closeOrders();
  }
});
