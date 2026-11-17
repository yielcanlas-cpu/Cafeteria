/* =========================================================
   panels.js  -  the windows opened from the sidebar of the dashboard (index.html)

     Delivery       follow your order: Preparing -> Ready -> Delivered
     Favorites      foods you saved with the heart
     Messages       write to the canteen staff and read their replies
     Notification   order updates, replies and your promo
     Help Center    questions and answers + contact details

   Needs common.js and script.js loaded first (currentUser, promo, cart, foodItems...).
   Everything that comes from the database is put in with textContent, so nothing a
   person typed can ever run as code.
   ========================================================= */

const panelModal = document.querySelector("#panelModal");
const panelTitle = document.querySelector("#panelTitle");
const panelBody = document.querySelector("#panelBody");
let panelTimer = null;          // refreshes Delivery / Notification while they are open
let openPanelName = "";         // which panel is open right now ("" = none)


// Small helper: make an element in one line  ->  node("p", "muted", "Hello")
function node(tag, className, text) {
  const item = document.createElement(tag);
  if (className) item.className = className;
  if (text !== undefined) item.textContent = text;
  return item;
}

// A friendly "nothing here" message
function emptyNote(text) { return node("p", "panel-empty", text); }


/* ---------------------------------------------------------
   1. OPEN / CLOSE
   --------------------------------------------------------- */
const PANELS = {
  delivery:      { title: "Delivery",      build: buildDelivery,      refresh: true },
  favorites:     { title: "Favorites",     build: buildFavorites },
  messages:      { title: "Messages",      build: buildMessages },
  notifications: { title: "Notification",  build: buildNotifications, refresh: true },
  help:          { title: "Help Center",   build: buildHelp }
};

async function openPanel(name) {
  const panel = PANELS[name];
  if (!panel) return;

  openPanelName = name;
  panelTitle.textContent = panel.title;
  panelBody.innerHTML = "";
  panelBody.append(emptyNote("Loading..."));
  panelModal.hidden = false;

  await renderPanel();

  clearInterval(panelTimer);
  if (panel.refresh) {                                   // keep it fresh while it is open
    panelTimer = setInterval(function () { if (!document.hidden) renderPanel(); }, 15000);
  }
}

// Builds the panel into a fresh box, then swaps it in (so the window never flickers empty)
async function renderPanel() {
  const panel = PANELS[openPanelName];
  if (!panel) return;
  const box = document.createElement("div");
  try {
    await panel.build(box);
  } catch (err) {
    box.innerHTML = "";
    box.append(emptyNote(err.message));
  }
  if (PANELS[openPanelName] === panel) panelBody.replaceChildren(box);
}

function closePanel() {
  panelModal.hidden = true;
  openPanelName = "";
  clearInterval(panelTimer);
  setActive(homeLink);                                   // the highlight goes back to Home
}

document.querySelector("#panelClose").addEventListener("click", closePanel);
panelModal.addEventListener("click", function (event) {
  if (event.target === panelModal) closePanel();         // clicking the dark area closes it
});
document.addEventListener("keydown", function (event) {
  if (event.key === "Escape" && !panelModal.hidden) closePanel();
});


/* ---------------------------------------------------------
   2. DELIVERY  -  where is my order?
   --------------------------------------------------------- */
const STEPS = ["Preparing", "Ready", "Delivered"];

const STEP_TEXT = {
  Preparing: "The kitchen is preparing your food.",
  Ready: "Your order is ready and on its way to your room."
};

async function buildDelivery(box) {
  const { orders } = await api("my_orders");
  const active = orders.filter(function (o) { return o.status === "Preparing" || o.status === "Ready"; });
  const done = orders.filter(function (o) { return o.status === "Delivered"; }).slice(0, 3);

  if (active.length === 0) {
    box.append(emptyNote("No orders on the way right now. Tap a food on the main menu to order!"));
  }

  active.forEach(function (order) {
    const card = node("div", "track-card");
    const head = node("div", "order-head");
    head.append(node("strong", "", "Order #" + order.id), node("span", "badge " + order.status, order.status));

    // The 3 steps: the ones already reached are filled in
    const reached = STEPS.indexOf(order.status);
    const steps = node("ol", "steps");
    STEPS.forEach(function (name, index) {
      const step = node("li", index <= reached ? "reached" : "", name);
      if (index === reached) step.classList.add("current");
      steps.append(step);
    });

    card.append(head, steps, node("p", "track-text", STEP_TEXT[order.status]));
    card.append(node("div", "order-meta", "Room " + order.room + " · " + formatPrice(order.total) + " · ordered " + formatDate(order.created_at)));
    box.append(card);
  });

  if (done.length > 0) {
    box.append(node("h3", "panel-sub", "Recently delivered"));
    done.forEach(function (order) {
      const row = node("div", "mini-row");
      row.append(
        node("span", "", "Order #" + order.id + " · " + order.items.map(function (i) { return i.qty + " × " + i.name; }).join(", ")),
        node("span", "order-meta", formatDate(order.created_at))
      );
      box.append(row);
    });
  }
}


/* ---------------------------------------------------------
   3. FAVORITES  -  the heart on every food
   The list is kept in this browser, per account (like the cart).
   --------------------------------------------------------- */
let favorites = [];             // food ids, e.g. [1, 5, 9]

function saveFavorites() { saveToBrowser("mcc_fav_" + currentUser.id, JSON.stringify(favorites)); }

function paintHearts() {
  foodItems.forEach(function (food) {
    const heart = food.querySelector(".fav");
    const saved = favorites.includes(Number(food.dataset.id));
    heart.textContent = saved ? "\u2665" : "\u2661";        // filled heart / empty heart
    heart.classList.toggle("on", saved);
    heart.setAttribute("aria-pressed", saved);
  });
}

function toggleFavorite(food) {
  const id = Number(food.dataset.id);
  if (favorites.includes(id)) {
    favorites = favorites.filter(function (other) { return other !== id; });
    showToast(food.dataset.name + " removed from favorites.");
  } else {
    favorites.push(id);
    showToast(food.dataset.name + " added to favorites.");
  }
  saveFavorites();
  paintHearts();
  if (openPanelName === "favorites") renderPanel();
}

function addHearts() {
  foodItems.forEach(function (food) {
    const heart = node("span", "fav");
    heart.setAttribute("role", "button");
    heart.tabIndex = 0;
    heart.setAttribute("aria-label", "Favorite " + food.dataset.name);
    food.append(heart);

    // The heart sits INSIDE the food button, so stop the click from adding the food to the cart
    heart.addEventListener("click", function (event) {
      event.stopPropagation();
      event.preventDefault();
      toggleFavorite(food);
    });
    heart.addEventListener("keydown", function (event) {
      if (event.key === "Enter" || event.key === " ") {
        event.stopPropagation();
        event.preventDefault();
        toggleFavorite(food);
      }
    });
  });
  paintHearts();
}

function buildFavorites(box) {
  // The same food can appear in two rows: list each id once
  const seen = new Set();
  const foods = Array.from(foodItems).filter(function (food) {
    const id = Number(food.dataset.id);
    if (!favorites.includes(id) || seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  if (foods.length === 0) {
    box.append(emptyNote("No favorites yet. Tap the heart on any food to save it here."));
    return;
  }

  foods.forEach(function (food) {
    const row = node("div", "fav-row");
    const picture = document.createElement("img");
    picture.src = food.querySelector("img").getAttribute("src");
    picture.alt = "";

    const info = node("div", "fav-info");
    info.append(node("strong", "", food.dataset.name), node("span", "order-meta", formatPrice(food.dataset.price)));

    const add = node("button", "mini-btn", "Add to order");
    add.type = "button";
    add.disabled = food.disabled;
    add.addEventListener("click", function () {
      food.click();                                      // same as tapping the food on the menu
      closePanel();
    });

    const remove = node("button", "mini-btn ghost", "Remove");
    remove.type = "button";
    remove.addEventListener("click", function () { toggleFavorite(food); });

    row.append(picture, info, add, remove);
    box.append(row);
  });
}


/* ---------------------------------------------------------
   4. MESSAGES  -  write to the canteen, read the replies
   --------------------------------------------------------- */
async function buildMessages(box) {
  // The form (kept out of the 15-second refresh: Messages does not refresh by itself)
  const form = node("form", "msg-form");
  form.innerHTML =
    '<label>Subject<input name="subject" maxlength="100" placeholder="e.g. Question about my order"></label>' +
    '<label>Message<textarea name="message" maxlength="1000" placeholder="Write your message here"></textarea></label>' +
    '<button class="mini-btn send-btn" type="submit">Send message</button>';
  box.append(form);

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    const button = form.querySelector("button");
    button.disabled = true;
    try {
      await api("contact", { subject: form.subject.value.trim(), message: form.message.value.trim() });
      showToast("Message sent! The staff will reply here.");
      renderPanel();                                     // redraw: the new message shows below
    } catch (err) {
      showToast(err.message);
      button.disabled = false;
    }
  });

  box.append(node("h3", "panel-sub", "Your messages"));
  const { messages } = await api("my_messages");
  if (messages.length === 0) box.append(emptyNote("You have not sent a message yet."));

  messages.forEach(function (m) {
    const card = node("div", "msg-card");
    card.append(node("strong", "", m.subject || "(no subject)"), node("div", "order-meta", formatDate(m.created_at)), node("p", "", m.message));
    if (m.reply) {
      const reply = node("div", "msg-reply");
      reply.append(node("b", "", "Staff reply"), node("p", "", m.reply));
      card.append(reply);
    } else {
      card.append(node("div", "msg-wait", "Waiting for a reply"));
    }
    box.append(card);
  });
}


/* ---------------------------------------------------------
   5. NOTIFICATION  -  built from your orders, replies and promo
   --------------------------------------------------------- */
const ORDER_NOTE = {
  Preparing: function (o) { return "Order #" + o.id + " is being prepared."; },
  Ready:     function (o) { return "Order #" + o.id + " is ready! It is on its way to " + o.room + "."; },
  Delivered: function (o) { return "Order #" + o.id + " was delivered. Enjoy your meal!"; },
  Cancelled: function (o) { return "Order #" + o.id + " was cancelled."; }
};

// Returns a list of { text, when, link } (newest first, the promo on top)
async function collectNotifications() {
  const list = [];

  if (promo.eligible && !promo.claimed) {
    list.push({ text: "You get " + promo.percent + "% off your first order! Verify that you are a first-time customer on the Offers page.", link: "offers.html?from=app#first-time", linkText: "Get the offer" });
  } else if (promo.claimed) {
    list.push({ text: "Your " + promo.percent + "% first-order discount is ready. It is taken off your next order automatically." });
  }

  const [{ orders }, { messages }] = await Promise.all([api("my_orders"), api("my_messages")]);
  orders.slice(0, 8).forEach(function (o) { list.push({ text: ORDER_NOTE[o.status](o), when: o.created_at }); });
  messages.filter(function (m) { return m.reply; }).slice(0, 5).forEach(function (m) {
    list.push({ text: "Staff replied to your message" + (m.subject ? ' "' + m.subject + '"' : "") + ".", when: m.replied_at });
  });

  // newest first; the ones without a date (the promo) stay on top
  list.sort(function (a, b) { return String(b.when || "9").localeCompare(String(a.when || "9")); });
  return list;
}

async function buildNotifications(box) {
  const list = await collectNotifications();
  if (list.length === 0) { box.append(emptyNote("Nothing new yet.")); return; }

  list.forEach(function (item) {
    const row = node("div", "notif");
    const text = node("div", "");
    text.append(node("span", "", item.text));
    if (item.link) {
      const go = node("a", "notif-link", item.linkText);
      go.href = item.link;
      text.append(document.createTextNode(" "), go);
    }
    row.append(text);
    if (item.when) row.append(node("div", "order-meta", formatDate(item.when)));
    box.append(row);
  });
}

// A red dot next to "Notification" when there is an order that is Ready or a staff reply
async function checkNotificationDot() {
  try {
    const [{ orders }, { messages }] = await Promise.all([api("my_orders"), api("my_messages")]);
    const news = orders.some(function (o) { return o.status === "Ready"; }) ||
                 messages.some(function (m) { return m.reply; });
    document.querySelector("#notifDot").hidden = !(news || (promo.eligible && !promo.claimed));
  } catch (err) { /* the dot is just a hint */ }
}


/* ---------------------------------------------------------
   6. HELP CENTER
   --------------------------------------------------------- */
const FAQ = [
  ["How do I place an order?", "Tap the foods you want on the main menu. In the Your Order panel type your room (for example MB 101), then press Confirm Order."],
  ["How do I get the 10% first-order discount?", "Open Offers, choose 10% off for new customers, answer Yes to First-Time Customer and press Submit. We check your account: it only works if you have no order yet. The discount is then taken off your first order automatically."],
  ["Can I cancel my order?", "Yes, while it is still Preparing. Open My Orders and press Cancel this order. Once the kitchen marks it Ready it can no longer be cancelled."],
  ["How do I know my order is ready?", "Open Delivery to follow your order step by step: Preparing, Ready, Delivered. Notification also tells you when something changes."],
  ["How do I save my favorite foods?", "Tap the heart on a food. Your saved foods are listed under Favorites, where you can add them to your order again with one tap."],
  ["I forgot my password.", "There is no reset by email yet. Please ask the canteen staff to help you."]
];

function buildHelp(box) {
  FAQ.forEach(function (pair) {
    const item = node("details", "faq");
    item.append(node("summary", "", pair[0]), node("p", "", pair[1]));
    box.append(item);
  });

  const contact = node("div", "help-contact");
  contact.append(
    node("strong", "", "Still need help?"),
    node("div", "", "Email: mcccanteen@gmail.com"),
    node("div", "", "Phone: 09123344556"),
    node("div", "", "Dolores, Mabalacat City, Pampanga.")
  );
  const write = node("button", "mini-btn", "Send us a message");
  write.type = "button";
  write.addEventListener("click", function () { openPanel("messages"); });
  contact.append(write);
  box.append(contact);
}


/* ---------------------------------------------------------
   7. START  (script.js calls this once it knows who is logged in)
   --------------------------------------------------------- */
function initPanels() {
  favorites = JSON.parse(loadFromBrowser("mcc_fav_" + currentUser.id, "[]")) || [];
  addHearts();
}
