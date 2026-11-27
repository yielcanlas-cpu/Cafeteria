/* =========================================================
   admin.js  -  the staff page (admin.html)
   Only the staff account can open it. It shows EVERY order
   from every student and lets staff move them along:
       Preparing  ->  Ready  ->  Delivered     (or Cancelled)
   Needs common.js loaded first.
   ========================================================= */

const ordersBox = document.querySelector("#orders");
const emptyMsg = document.querySelector("#empty");
const updatedEl = document.querySelector("#updated");
const searchBox = document.querySelector("#searchOrders");
const filterButtons = document.querySelectorAll(".filter");

let allOrders = [];            // every order we got from the server
let activeFilter = "Active";   // which filter button is on
let knownIds = null;           // ids we have already seen (to spot NEW orders)


/* ---------------------------------------------------------
   1. START: only the staff account may be here
   --------------------------------------------------------- */
(async function start() {
  let user = null;
  try { user = await getCurrentUser(); } catch (err) { user = null; }

  if (!user) { location.replace("login.html"); return; }
  if (user.role !== "admin") { location.replace(homeFor(user)); return; }

  document.querySelector("#adminName").textContent = user.name;
  document.querySelector("#adminInitial").textContent = initials(user.name);
  document.querySelector("#today").textContent = new Date().toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  document.body.classList.remove("checking");

  await loadOrders();
  loadMessages();
  setInterval(refreshAll, REFRESH_SECONDS * 1000);
  document.addEventListener("visibilitychange", refreshAll);     // refresh the moment staff come back to this tab
})();

const REFRESH_SECONDS = 5;                     // lower = more "live", but more requests to the server

function refreshAll() {
  if (!document.hidden) { loadOrders(); loadMessages(); }
}

document.querySelector("#logoutBtn").addEventListener("click", logOut);   // logOut() is in common.js


/* ---------------------------------------------------------
   2. LOADING ORDERS FROM THE SERVER
   --------------------------------------------------------- */
async function loadOrders() {
  try {
    const data = await api("admin_orders");
    allOrders = data.orders;

    // The numbers at the top
    ["Preparing", "Ready", "Delivered", "Cancelled"].forEach(function (status) {
      document.querySelector("#count" + status).textContent = data.counts[status] || 0;
    });
    document.querySelector("#salesToday").textContent = formatPrice(data.sales_today);

    // Tell staff when a NEW order arrives (not on the very first load)
    const ids = allOrders.map(function (o) { return o.id; });
    if (knownIds) {
      allOrders.filter(function (o) { return !knownIds.has(o.id) && o.status === "Preparing"; })
               .forEach(function (o) { showToast("New order #" + o.id + " from " + o.customer + " (Room " + o.room + ")"); });
    }
    knownIds = new Set(ids);

    updatedEl.textContent = "Updated " + new Date().toLocaleTimeString("en-PH") + " · refreshes by itself every " + REFRESH_SECONDS + " seconds";
    updatedEl.classList.remove("problem");
    render();
  } catch (err) {
    updatedEl.textContent = "Could not refresh: " + err.message;
    updatedEl.classList.add("problem");
  }
}


/* ---------------------------------------------------------
   3. FILTERS + SEARCH
   --------------------------------------------------------- */
filterButtons.forEach(function (button) {
  button.addEventListener("click", function () {
    activeFilter = button.dataset.filter;
    filterButtons.forEach(function (other) { other.classList.toggle("active", other === button); });
    render();
  });
});
searchBox.addEventListener("input", render);

// Does this order pass the filter button and the search box?
function matches(order) {
  if (activeFilter === "Active") {
    if (order.status !== "Preparing" && order.status !== "Ready") return false;
  } else if (activeFilter !== "All" && order.status !== activeFilter) {
    return false;
  }

  const text = searchBox.value.trim().toLowerCase();
  if (text === "") return true;

  const haystack = [
    "#" + order.id, order.customer, order.email, order.room, order.note,
    order.items.map(function (i) { return i.name; }).join(" ")
  ].join(" ").toLowerCase();
  return haystack.includes(text);
}


/* ---------------------------------------------------------
   4. DRAWING THE ORDER CARDS
   Everything that comes from the database is put in with textContent,
   so nothing a student types can ever run as code.
   --------------------------------------------------------- */
function el(tag, className, text) {            // small helper: make an element in one line
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function render() {
  const shown = allOrders.filter(matches);

  // Work still to do: oldest first (like a queue). Everything else: newest first.
  const queue = activeFilter === "Active" || activeFilter === "Preparing" || activeFilter === "Ready";
  shown.sort(function (a, b) { return queue ? a.id - b.id : b.id - a.id; });

  ordersBox.innerHTML = "";
  shown.forEach(function (order) { ordersBox.appendChild(buildCard(order)); });
  emptyMsg.hidden = shown.length > 0;
}

const ITEMS_SHOWN = 4;                         // a long order shows this many foods, the rest hide behind "+N more"

function initials(name) {                      // "Kim Minjeong" -> "KM"
  return String(name).trim().split(/\s+/).slice(0, 2).map(function (word) { return word[0]; }).join("").toUpperCase();
}

function buildCard(order) {
  const card = el("article", "order " + order.status);

  // top: avatar, customer, order number + room, status
  const who = el("div", "oc-who");
  who.append(el("strong", "", order.customer), el("small", "", "Order #" + order.id + " / Room " + order.room), el("small", "", order.email));
  const head = el("div", "oc-head");
  head.append(el("span", "oc-av", initials(order.customer)), who, el("span", "badge " + order.status, order.status));
  card.append(head);

  // date on the left, time on the right
  const placed = new Date(order.created_at.replace(" ", "T"));
  const when = el("div", "oc-when");
  when.append(
    el("span", "", isNaN(placed) ? order.created_at : placed.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })),
    el("span", "", isNaN(placed) ? "" : placed.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }))
  );
  card.append(when);

  // the foods: Items | Qty | Price
  const heading = el("div", "oc-row oc-th");
  heading.append(el("span", "", "Items"), el("span", "", "Qty"), el("span", "", "Price"));
  const list = el("ul", "order-items");
  order.items.forEach(function (item, i) {
    const li = el("li", "oc-row");
    li.append(el("span", "", item.name), el("span", "", item.qty), el("span", "", formatPrice(item.qty * item.price)));
    li.hidden = i >= ITEMS_SHOWN;
    list.append(li);
  });
  card.append(heading, list);

  const extra = order.items.length - ITEMS_SHOWN;
  if (extra > 0) {
    let open = false;
    const more = el("button", "oc-more", "+" + extra + " more");
    more.type = "button";
    more.addEventListener("click", function () {
      open = !open;
      list.querySelectorAll("li").forEach(function (li, i) { li.hidden = !open && i >= ITEMS_SHOWN; });
      more.textContent = open ? "Show less" : "+" + extra + " more";
    });
    card.append(more);
  }

  if (order.note) card.append(el("div", "order-note", "Note: " + order.note));

  // total (+ a first-time customer's 10% promo)
  const total = el("div", "oc-total");
  total.append(el("span", "", "Total"), el("strong", "", formatPrice(order.total)));
  if (order.discount > 0) {
    const off = el("div", "oc-line off");
    off.append(el("span", "", "First-order discount (subtotal " + formatPrice(order.subtotal) + ")"), el("span", "", "-" + formatPrice(order.discount)));
    card.append(off);
  }
  card.append(total);

  // buttons: which ones show depends on the status. The main one goes last (bottom right).
  const actions = el("div", "actions");
  function addButton(label, className, onClick) {
    const button = el("button", "act " + className, label);
    button.type = "button";
    button.addEventListener("click", async function () {
      button.disabled = true;
      await onClick();
      button.disabled = false;
    });
    actions.append(button);
  }

  if (order.status === "Preparing") {
    addButton("Cancel", "danger", function () { return setStatus(order, "Cancelled", "Cancel order #" + order.id + "?"); });
    addButton("Mark ready", "main", function () { return setStatus(order, "Ready"); });
  } else if (order.status === "Ready") {
    addButton("Back to preparing", "", function () { return setStatus(order, "Preparing"); });
    addButton("Cancel", "danger", function () { return setStatus(order, "Cancelled", "Cancel order #" + order.id + "?"); });
    addButton("Mark delivered", "main", function () { return setStatus(order, "Delivered"); });
  } else {
    addButton("Delete", "danger", function () { return deleteOrder(order); });
    addButton("Reopen", "", function () { return setStatus(order, order.status === "Delivered" ? "Ready" : "Preparing"); });
  }
  card.append(actions);
  return card;
}


/* ---------------------------------------------------------
   5. CHANGING AN ORDER
   --------------------------------------------------------- */
async function setStatus(order, status, question) {
  if (question && !confirm(question)) return;      // confirm() is true if they press OK
  try {
    await api("admin_set_status", { id: order.id, status: status });
    showToast("Order #" + order.id + " is now " + status + ".");
  } catch (err) {
    showToast(err.message);
  }
  await loadOrders();                              // refresh the list either way
}

async function deleteOrder(order) {
  if (!confirm("Delete order #" + order.id + " for good? This cannot be undone.")) return;
  try {
    await api("admin_delete_order", { id: order.id });
    showToast("Order #" + order.id + " deleted.");
  } catch (err) {
    showToast(err.message);
  }
  await loadOrders();
}


/* ---------------------------------------------------------
   6. TABS  (Orders | Messages)
   --------------------------------------------------------- */
document.querySelectorAll("#tabs .tab").forEach(function (tab) {
  tab.addEventListener("click", function () {
    document.querySelectorAll("#tabs .tab").forEach(function (other) { other.classList.toggle("active", other === tab); });
    document.querySelector("#ordersTab").hidden = tab.dataset.tab !== "orders";
    document.querySelector("#messagesTab").hidden = tab.dataset.tab !== "messages";
    document.querySelector("#pageTitle").textContent = tab.dataset.title;
  });
});


/* ---------------------------------------------------------
   7. MESSAGES FROM STUDENTS  +  REPLIES
   A reply shows up in the student's Messages window on the main menu.
   --------------------------------------------------------- */
const messagesBox = document.querySelector("#messages");
const emptyMessages = document.querySelector("#emptyMessages");
const msgCount = document.querySelector("#msgCount");

async function loadMessages() {
  // Do not redraw while staff is typing a reply (it would erase the text)
  if (messagesBox.contains(document.activeElement) && document.activeElement.tagName === "TEXTAREA") return;
  try {
    const { messages } = await api("admin_messages");
    messagesBox.innerHTML = "";
    messages.forEach(function (m) { messagesBox.appendChild(buildMessageCard(m)); });
    emptyMessages.hidden = messages.length > 0;

    const waiting = messages.filter(function (m) { return !m.reply; }).length;   // not answered yet
    msgCount.textContent = waiting;
    msgCount.hidden = waiting === 0;
  } catch (err) {
    showToast(err.message);
  }
}

function buildMessageCard(m) {
  const card = el("article", "msg" + (m.reply ? " answered" : ""));
  card.append(el("strong", "", m.subject || "(no subject)"));
  card.append(el("div", "msg-meta", m.name + " · " + m.email + " · " + formatDate(m.created_at)));
  card.append(el("p", "msg-text", m.message));
  if (m.images && m.images.length) {
    const row = el("div", "msg-photos");
    m.images.forEach(function (src) {
      const link = el("a");
      link.href = src; link.target = "_blank"; link.rel = "noopener";
      const pic = el("img"); pic.src = src; pic.alt = "Proof photo";
      link.append(pic); row.append(link);
    });
    card.append(row);
  }

  if (m.reply) card.append(el("div", "msg-reply", "Your reply: " + m.reply));

  const box = el("textarea");
  box.maxLength = 1000;
  box.placeholder = m.reply ? "Write a new reply..." : "Write your reply...";
  box.setAttribute("aria-label", "Reply to " + m.name);

  const actions = el("div", "actions");
  const send = el("button", "act main", m.reply ? "Update reply" : "Send reply");
  send.type = "button";
  send.addEventListener("click", async function () {
    send.disabled = true;
    try {
      await api("admin_reply_message", { id: m.id, reply: box.value.trim() });
      showToast("Reply sent to " + m.name + ".");
      box.blur();                                    // so loadMessages() may redraw
      await loadMessages();
    } catch (err) {
      showToast(err.message);
      send.disabled = false;
    }
  });
  actions.append(send);
  card.append(box, actions);
  return card;
}
