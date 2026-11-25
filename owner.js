/* =========================================================
   owner.js  -  the main admin page (owner.html)
   Only the main admin account (role "owner") can open it.
   Pages: Dashboard, Menu & prices, Offers & promo, Staff accounts, Student accounts.
   Needs common.js loaded first (api, formatPrice, formatDate, logOut...).
   ========================================================= */

const $ = (selector) => document.querySelector(selector);
const esc = (text) => String(text ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ICON = {
  edit: '<svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg>',
  key: '<svg viewBox="0 0 24 24"><circle cx="8" cy="15" r="4"/><path d="M10.8 12.2 20 3"/><path d="M16 7l3 3"/></svg>'
};

const state = { page: "dashboard", tab: "All", q: "", dash: null, menu: [], categories: [], offers: null, staff: [], students: [] };
let me = null;


/* ---------------------------------------------------------
   1. START: only the main admin may be here
   --------------------------------------------------------- */
(async function start() {
  let user = null;
  try { user = await getCurrentUser(); } catch (err) { user = null; }
  if (!user) { location.replace("login.html"); return; }
  if (user.role !== "owner") { location.replace(homeFor(user)); return; }

  me = user;
  $("#chipName").textContent = user.name;
  $("#av").textContent = initials(user.name);
  document.body.classList.remove("checking");

  const wanted = location.hash.replace("#", "");
  show(["dashboard", "menu", "offers", "staff", "students"].includes(wanted) ? wanted : "dashboard");
  setInterval(function () { if (!document.hidden && state.page === "dashboard") loadPage(); }, 20000);
})();

// "Mary Jane Cruz" -> "MJ"
function initials(name) {
  return String(name).trim().split(/\s+/).slice(0, 2).map((w) => w[0] || "").join("").toUpperCase() || "?";
}

function toast(message) {
  const t = $("#toast");
  t.textContent = message; t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, 3000);
}


/* ---------------------------------------------------------
   2. TOP BAR + SIDE MENU
   --------------------------------------------------------- */
$("#burger").addEventListener("click", () => document.body.classList.toggle("toggled"));
$("#logoutBtn").addEventListener("click", logOut);
$("#chip").addEventListener("click", function (event) {
  event.stopPropagation();
  const open = $("#dropdown").hidden;
  $("#dropdown").hidden = !open;
  $("#chip").setAttribute("aria-expanded", open);
});
document.addEventListener("click", () => { $("#dropdown").hidden = true; });

$("#nav").addEventListener("click", function (event) {
  const button = event.target.closest(".nav");
  if (!button) return;
  show(button.dataset.page);
  if (window.innerWidth <= 800) document.body.classList.remove("toggled");
});

$("#search").addEventListener("input", function () { state.q = this.value.trim().toLowerCase(); draw(); });

const TITLES = {
  dashboard: ["Dashboard", "How the canteen is doing."],
  menu: ["Menu & prices", "Change a price, rename a food, or mark it sold out. The student ordering page uses these at once."],
  offers: ["Offers & promo", "The first-order discount for new customers."],
  staff: ["Staff accounts", "People who handle orders and messages on the staff page."],
  students: ["Student accounts", "Everyone who signed up to order."]
};

function show(page) {
  state.page = page; state.tab = "All"; state.q = "";
  $("#search").value = "";
  document.querySelectorAll(".nav").forEach((n) => n.classList.toggle("active", n.dataset.page === page));
  $("#title").textContent = TITLES[page][0];
  $("#subtitle").textContent = TITLES[page][1];
  history.replaceState(null, "", "#" + page);
  $("#page").innerHTML = '<p class="empty">Loading…</p>';
  $("#headStats").innerHTML = "";
  loadPage();
}

async function loadPage() {
  const page = state.page;
  try {
    if (page === "dashboard") state.dash = await api("owner_dashboard");
    if (page === "menu") { const d = await api("owner_menu"); state.menu = d.menu; state.categories = d.categories; }
    if (page === "offers") state.offers = await api("owner_offers");
    if (page === "staff") state.staff = (await api("owner_users&role=staff")).users;
    if (page === "students") state.students = (await api("owner_users&role=student")).users;
  } catch (err) {
    if (page === state.page) $("#page").innerHTML = '<p class="problem">' + esc(err.message) + "</p>";
    return;
  }
  if (page === state.page) draw();
}

function draw() {
  ({ dashboard: drawDashboard, menu: drawMenu, offers: drawOffers, staff: drawStaff, students: drawStudents })[state.page]();
}

// small building blocks
const headStat = (value, label, brand) => '<div class="hs' + (brand ? " brand" : "") + '"><b>' + esc(value) + "</b><span>" + esc(label) + "</span></div>";
const icon = (name, act, id, title) => '<button class="icon-btn" type="button" data-act="' + act + '" data-id="' + id + '" title="' + title + '" aria-label="' + title + '">' + ICON[name] + "</button>";

function tabsHtml(names, counts) {
  return '<div class="tabs" id="tabs">' + names.map((n) =>
    '<button class="tab' + (n === state.tab ? " active" : "") + '" data-tab="' + esc(n) + '" type="button">' + esc(n) +
    "<small>" + (counts[n] ?? 0) + "</small></button>").join("") + "</div>";
}

// the row of tabs is the same on every table page
$("#page").addEventListener("click", function (event) {
  const tab = event.target.closest(".tab");
  if (tab) { state.tab = tab.dataset.tab; draw(); return; }
  const btn = event.target.closest("[data-act]");
  if (btn) actions[btn.dataset.act](Number(btn.dataset.id || 0), btn);
});


/* ---------------------------------------------------------
   3. DASHBOARD
   --------------------------------------------------------- */
function drawDashboard() {
  const d = state.dash;
  $("#headStats").innerHTML = headStat(formatPrice(d.sales_today), "Sales today", true) + headStat(d.orders_today, "Orders today");

  const max = Math.max(1, ...d.days.map((x) => x.sales));
  const bars = d.days.map((x) => {
    const label = new Date(x.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short" });
    return '<div class="bar"><b>' + (x.sales ? Math.round(x.sales) : "") + '</b><div style="height:' + Math.max(2, (x.sales / max) * 100) + '%"></div>' + label + "</div>";
  }).join("");

  const top = d.top_items.length ? d.top_items.map((t) =>
    "<tr><td>" + esc(t.name) + '</td><td class="num">' + t.qty + '</td><td class="num">' + formatPrice(t.revenue) + "</td></tr>").join("")
    : '<tr><td colspan="3" class="empty">No sales yet.</td></tr>';

  const recent = d.recent.length ? d.recent.map((o) =>
    "<tr><td>#" + o.id + "</td><td>" + esc(o.customer) + "</td><td>" + esc(o.room) + '</td><td class="num">' + formatPrice(o.total) +
    "</td><td>" + statusBadge(o.status) + "</td></tr>").join("")
    : '<tr><td colspan="5" class="empty">No orders yet.</td></tr>';

  $("#page").innerHTML =
    '<div class="grid cols-4">' +
      kpi(formatPrice(d.sales_week), "Sales, last 7 days") + kpi(formatPrice(d.sales_total), "All sales so far") +
      kpi(d.counts.Preparing + d.counts.Ready, "Orders still active") + kpi(d.counts.Delivered, "Delivered") +
      kpi(d.students, "Students") + kpi(d.staff, "Staff accounts") + kpi(d.unanswered, "Unanswered messages") +
    "</div>" +
    '<div class="grid cols-2">' +
      '<div class="card"><h2>Sales, last 7 days (Php)</h2><div class="bars">' + bars + "</div></div>" +
      '<div class="card"><h2>Best sellers</h2><div class="table-wrap"><table><thead><tr><th>Food</th><th class="num">Sold</th><th class="num">Sales</th></tr></thead><tbody>' + top + "</tbody></table></div></div>" +
    "</div>" +
    '<div class="card" style="margin-top:16px"><h2>Latest orders</h2><div class="table-wrap"><table><thead><tr><th>Order</th><th>Customer</th><th>Room</th><th class="num">Total</th><th>Status</th></tr></thead><tbody>' + recent + "</tbody></table></div>" +
    '<p class="bar-note">Staff move orders along on their own page.</p></div>';
}
const kpi = (value, label) => '<div class="card kpi"><b>' + esc(value) + "</b><span>" + esc(label) + "</span></div>";
function statusBadge(status) {
  const kind = { Preparing: "warn", Ready: "good", Delivered: "good", Cancelled: "bad" }[status] || "";
  return '<span class="badge ' + kind + '">' + esc(status) + "</span>";
}


/* ---------------------------------------------------------
   4. MENU & PRICES
   --------------------------------------------------------- */
function drawMenu() {
  const all = state.menu;
  $("#headStats").innerHTML = headStat(all.length, "Foods", true) + headStat(all.filter((f) => !f.available).length, "Sold out");

  const names = ["All", ...state.categories];
  const counts = { All: all.length };
  state.categories.forEach((c) => { counts[c] = all.filter((f) => f.category === c).length; });

  const rows = all.filter((f) => (state.tab === "All" || f.category === state.tab) && f.name.toLowerCase().includes(state.q));
  const body = rows.map((f) =>
    "<tr><td>" + esc(f.name) + "</td><td>" + esc(f.category) + '</td><td class="num">' + formatPrice(f.price) + "</td><td>" +
    (f.available ? '<span class="badge good">Available</span>' : '<span class="badge bad">Sold out</span>') + "</td><td>" +
    icon("edit", "editFood", f.id, "Edit") + icon("trash", "deleteFood", f.id, "Delete") + "</td><td>" +
    '<button class="btn ghost small" data-act="toggleFood" data-id="' + f.id + '" type="button">' + (f.available ? "Mark sold out" : "Make available") + "</button></td></tr>").join("");

  $("#page").innerHTML =
    '<div class="toolbar">' + tabsHtml(names, counts) + '<span>' + (all.some((f) => !f.available) ? '<button class="btn ghost" data-act="allAvailable" type="button">Make all available</button> ' : "") +
    '<button class="btn" data-act="addFood" type="button">+ Add food</button></span></div>' +
    '<div class="table-wrap"><table><thead><tr><th>Food</th><th>Category</th><th class="num">Price</th><th>Status</th><th>Operation</th><th>Action</th></tr></thead><tbody>' +
    (body || '<tr><td colspan="6" class="empty">No foods to show.</td></tr>') + "</tbody></table></div>" +
    '<p class="bar-note">Old orders keep the price they were bought at. A food added here is ordered from the student page only once it has a button in index.html (see README).</p>';
}

function foodForm(food) {
  const f = food || { name: "", price: "", category: state.categories[0], available: true };
  return '<label class="field"><span>Food name</span><input name="name" maxlength="80" value="' + esc(f.name) + '"></label>' +
    '<label class="field"><span>Price (Php)</span><input name="price" type="number" min="1" step="0.5" value="' + esc(f.price) + '"></label>' +
    '<label class="field"><span>Category</span><select name="category">' + state.categories.map((c) => '<option' + (c === f.category ? " selected" : "") + ">" + esc(c) + "</option>").join("") + "</select></label>" +
    '<label class="check"><input type="checkbox" name="available"' + (f.available ? " checked" : "") + "> Available to order</label>";
}


/* ---------------------------------------------------------
   5. OFFERS & PROMO
   --------------------------------------------------------- */
function drawOffers() {
  const o = state.offers;
  $("#headStats").innerHTML = headStat(o.claimed, "Students verified", true) + headStat(o.used, "Discounted orders");
  $("#page").innerHTML =
    '<div class="grid cols-2" style="margin-top:0">' +
      '<form class="card" id="promoForm" novalidate><h2>10% off for new customers</h2>' +
        '<div class="switch-row"><label class="switch"><input type="checkbox" id="promoOn"' + (o.enabled ? " checked" : "") + '><span></span></label>' +
        '<strong id="promoLabel">' + (o.enabled ? "Promo is ON" : "Promo is OFF") + "</strong></div>" +
        '<label class="field"><span>Discount on the first order (%)</span><input id="promoPercent" type="number" min="1" max="50" step="1" value="' + o.percent + '"></label>' +
        '<p class="dlg-error" id="promoError"></p><button class="btn" type="submit">Save</button>' +
      "</form>" +
      '<div class="card"><h2>So far</h2>' +
        '<p>' + o.claimed + " students passed the first-time customer check.</p>" +
        "<p>" + o.used + " orders got the discount.</p>" +
        "<p><strong>" + formatPrice(o.discount_total) + "</strong> given away in total.</p>" +
        '<p class="bar-note">When the promo is off, the Offers page tells new students it is not running and no order gets a discount. Students who already verified keep their place and get it if you switch it back on.</p></div>' +
    "</div>";

  $("#promoOn").addEventListener("change", function () { $("#promoLabel").textContent = this.checked ? "Promo is ON" : "Promo is OFF"; });
  $("#promoForm").addEventListener("submit", async function (event) {
    event.preventDefault();
    const button = this.querySelector("button");
    button.disabled = true; $("#promoError").textContent = "";
    try {
      await api("owner_offers_save", { enabled: $("#promoOn").checked, percent: Number($("#promoPercent").value) });
      toast("Promo saved."); state.offers = await api("owner_offers"); drawOffers();
    } catch (err) { $("#promoError").textContent = err.message; button.disabled = false; }
  });
}


/* ---------------------------------------------------------
   6. STAFF + STUDENT ACCOUNTS (same table, students have two more columns)
   --------------------------------------------------------- */
const drawStaff = () => drawUsers(state.staff, true);
const drawStudents = () => drawUsers(state.students, false);

function drawUsers(list, isStaff) {
  const suspended = list.filter((u) => !u.active).length;
  $("#headStats").innerHTML = headStat(list.length, isStaff ? "Staff accounts" : "Students", true) + headStat(suspended, "Suspended");

  const counts = { All: list.length, Active: list.length - suspended, Suspended: suspended };
  const rows = list.filter((u) =>
    (state.tab === "All" || (state.tab === "Active") === u.active) &&
    (u.name + " " + u.email).toLowerCase().includes(state.q));

  const body = rows.map((u) =>
    "<tr><td>" + esc(u.name) + "</td><td>" + esc(u.email) + "</td><td>" + esc(formatDate(u.created_at)) + "</td>" +
    (isStaff ? "" : '<td class="num">' + u.orders + '</td><td class="num">' + formatPrice(u.spent) + "</td>") +
    "<td>" + (u.active ? '<span class="badge good">Active</span>' : '<span class="badge bad">Suspended</span>') + "</td><td>" +
    icon("key", "resetPass", u.id, "Reset password") + icon("trash", "deleteUser", u.id, "Delete") + "</td><td>" +
    '<button class="btn ghost small" data-act="toggleUser" data-id="' + u.id + '" type="button">' + (u.active ? "Suspend" : "Activate") + "</button></td></tr>").join("");

  const cols = isStaff ? 6 : 8;
  $("#page").innerHTML =
    '<div class="toolbar">' + tabsHtml(["All", "Active", "Suspended"], counts) +
    (isStaff ? '<button class="btn" data-act="addStaff" type="button">+ Add staff</button>' : "") + "</div>" +
    '<div class="table-wrap"><table><thead><tr><th>Name</th><th>Email or number</th><th>Joined</th>' +
    (isStaff ? "" : '<th class="num">Orders</th><th class="num">Spent</th>') + "<th>Status</th><th>Operation</th><th>Action</th></tr></thead><tbody>" +
    (body || '<tr><td colspan="' + cols + '" class="empty">Nobody to show.</td></tr>') + "</tbody></table></div>" +
    '<p class="bar-note">A suspended account is logged out and cannot log in. An account that already has orders cannot be deleted (it would erase your sales history): suspend it instead.</p>';
}


/* ---------------------------------------------------------
   7. BUTTONS (every data-act in the tables lands here)
   --------------------------------------------------------- */
const findUser = (id) => state.staff.concat(state.students).find((u) => u.id === id);

const actions = {
  async allAvailable(id, btn) {
    if (!confirm("Make every food on the menu available again?")) return;
    await run(btn, () => api("owner_menu_all_available", {}), "Everything is available.");
  },
  addFood() {
    openDialog("Add food", foodForm(null), "Add", (f) => api("owner_menu_save", foodData(f)), "Food added.");
  },
  editFood(id) {
    const food = state.menu.find((x) => x.id === id);
    openDialog("Edit food", foodForm(food), "Save", (f) => api("owner_menu_save", { ...foodData(f), id }), "Saved.");
  },
  async toggleFood(id, btn) {
    const food = state.menu.find((x) => x.id === id);
    await run(btn, () => api("owner_menu_toggle", { id, available: !food.available }), food.available ? "Marked sold out." : "Available again.");
  },
  async deleteFood(id, btn) {
    const food = state.menu.find((x) => x.id === id);
    if (!confirm('Delete "' + food.name + '" from the menu? Old orders keep their record.')) return;
    await run(btn, () => api("owner_menu_delete", { id }), "Deleted.");
  },

  addStaff() {
    openDialog("Add staff", '<label class="field"><span>Name</span><input name="name" maxlength="60"></label>' +
      '<label class="field"><span>Email or mobile number</span><input name="email" maxlength="120"></label>' +
      '<label class="field"><span>Password (at least 8 characters)</span><input name="password" type="password"></label>',
      "Create", (f) => api("owner_staff_create", { name: field(f, "name").value, email: field(f, "email").value, password: field(f, "password").value }), "Staff account created.");
  },
  async toggleUser(id, btn) {
    const user = findUser(id);
    if (user.active && !confirm("Suspend " + user.name + "? They will be logged out and cannot log in.")) return;
    await run(btn, () => api("owner_user_active", { id, active: !user.active }), user.active ? "Suspended." : "Activated.");
  },
  resetPass(id) {
    const user = findUser(id);
    openDialog("Reset password", "<p>New password for <strong>" + esc(user.name) + '</strong>:</p><label class="field"><span>At least 8 characters</span><input name="password" type="password"></label>',
      "Reset", (f) => api("owner_user_password", { id, password: field(f, "password").value }), "Password changed.");
  },
  async deleteUser(id, btn) {
    const user = findUser(id);
    if (!confirm("Delete the account of " + user.name + "? This cannot be undone.")) return;
    await run(btn, () => api("owner_user_delete", { id }), "Account deleted.");
  }
};

const field = (form, name) => form.elements[name];          // (form.name would be the form's own name)
const foodData = (f) => ({ name: field(f, "name").value, price: field(f, "price").value, category: field(f, "category").value, available: field(f, "available").checked });

// runs one action, then reloads the page's data
async function run(button, job, doneMessage) {
  button.disabled = true;
  try { await job(); toast(doneMessage); await loadPage(); }
  catch (err) { toast(err.message); button.disabled = false; }
}


/* ---------------------------------------------------------
   8. THE DIALOG (add / edit / reset forms)
   --------------------------------------------------------- */
let dialogJob = null;
function openDialog(title, bodyHtml, okText, job, doneMessage) {
  $("#dlgTitle").textContent = title;
  $("#dlgBody").innerHTML = bodyHtml;
  $("#dlgOk").textContent = okText; $("#dlgOk").disabled = false;
  $("#dlgError").textContent = "";
  dialogJob = { job, doneMessage };
  $("#overlay").hidden = false;
  const first = $("#dlgBody input"); if (first) first.focus();
}
const closeDialog = () => { $("#overlay").hidden = true; dialogJob = null; };
$("#dlgCancel").addEventListener("click", closeDialog);
$("#overlay").addEventListener("mousedown", (e) => { if (e.target === $("#overlay")) closeDialog(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#overlay").hidden) closeDialog(); });

$("#dialog").addEventListener("submit", async function (event) {
  event.preventDefault();
  if (!dialogJob) return;
  $("#dlgOk").disabled = true; $("#dlgError").textContent = "";
  try {
    await dialogJob.job(this);
    toast(dialogJob.doneMessage);
    closeDialog();
    await loadPage();
  } catch (err) {
    $("#dlgError").textContent = err.message;
    $("#dlgOk").disabled = false;
  }
});
