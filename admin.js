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
  if (user.role !== "admin") { location.replace("index.html"); return; }

  document.querySelector("#adminName").textContent = user.name;
  document.body.classList.remove("checking");

  await loadOrders();
  loadMessages();
  setInterval(function () {                    // check for new orders every 15 seconds
    if (!document.hidden) { loadOrders(); loadMessages(); }
  }, 15000);
})();

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

    updatedEl.textContent = "Updated " + new Date().toLocaleTimeString("en-PH") + " · refreshes by itself every 15 seconds";
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

function buildCard(order) {
  const card = el("article", "order " + order.status);

  // top line: order number, status, room
  const top = el("div", "order-top");
  top.append(el("strong", "", "Order #" + order.id), el("span", "badge " + order.status, order.status));
  card.append(top);
  card.append(el("div", "order-room", "Deliver to: " + order.room));
  card.append(el("div", "order-who", order.customer + " · " + order.email));

  // the foods
  const list = el("ul", "order-items");
  order.items.forEach(function (item) {
    const li = el("li");
    li.append(el("span", "", item.qty + " × " + item.name), el("span", "", formatPrice(item.qty * item.price)));
    list.append(li);
  });
  card.append(list);

  if (order.note) card.append(el("div", "order-note", "Note: " + order.note));

  // total + time
  const foot = el("div", "order-foot");
  foot.append(el("span", "", formatDate(order.created_at)), el("strong", "", formatPrice(order.total)));
  if (order.discount > 0) {            // a first-time customer's 10% promo
    const off = el("div", "order-foot");
    off.append(el("span", "off", "First-order discount (subtotal " + formatPrice(order.subtotal) + ")"), el("span", "off", "-" + formatPrice(order.discount)));
    card.append(off);
  }
  card.append(foot);

  // buttons: which ones show depends on the status
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
    addButton("Mark ready", "main", function () { return setStatus(order, "Ready"); });
    addButton("Cancel", "danger", function () { return setStatus(order, "Cancelled", "Cancel order #" + order.id + "?"); });
  } else if (order.status === "Ready") {
    addButton("Mark delivered", "main", function () { return setStatus(order, "Delivered"); });
    addButton("Back to preparing", "", function () { return setStatus(order, "Preparing"); });
    addButton("Cancel", "danger", function () { return setStatus(order, "Cancelled", "Cancel order #" + order.id + "?"); });
  } else {
    addButton("Reopen", "", function () { return setStatus(order, order.status === "Delivered" ? "Ready" : "Preparing"); });
    addButton("Delete", "danger", function () { return deleteOrder(order); });
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
