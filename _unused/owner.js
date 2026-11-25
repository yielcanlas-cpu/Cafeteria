/* =========================================================
   owner.js  -  the owner page (owner.html)
   Only the owner account can open it. The owner manages the
   whole website: dashboard, menu & prices, offers & promo,
   staff accounts and student accounts.
   (Staff handle orders and messages on staff.html.)
   Needs common.js loaded first.
   ========================================================= */

const view = document.querySelector("#view");
const headStats = document.querySelector("#headStats");
const notice = document.querySelector("#notice");
const searchBox = document.querySelector("#search");

const TITLES = { dashboard: "Dashboard", menu: "Menu & prices", offers: "Offers & promo", staff: "Staff accounts", students: "Student accounts" };
const CATEGORIES = ["Snacks", "Meals", "Drinks", "Bundle", "Other"];
const REFRESH_SECONDS = 15;

let tab = "dashboard";
const data = {};                                   // what the server last sent, per page
const filters = { menu: "All", students: "All" };  // the filter buttons of each page

// Small icons for the Operation column (they take the button's color)
const ICON = {
  edit:  '<svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>',
  key:   '<svg viewBox="0 0 24 24"><circle cx="8" cy="15" r="4"/><path d="M10.8 12.2L20 3M16 7l3 3"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M10 9v6M14 9v6"/></svg>',
  play:  '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M10 8.5l6 3.5-6 3.5z"/></svg>',
  out:   '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/></svg>',
};


/* ---------------------------------------------------------
   Tiny helper: el("button", { className: "x", onclick: fn }, "text", childNode)
   Text is always added as plain text, so a name like <b>x</b> can never run as HTML.
   --------------------------------------------------------- */
function el(tag, props, ...children) {
  const node = document.createElement(tag);
  Object.entries(props || {}).forEach(function ([key, value]) {
    if (key === "html") node.innerHTML = value;                // only used for our own icons
    else if (key.startsWith("on")) node[key] = value;
    else if (key in node) node[key] = value;
    else node.setAttribute(key, value);
  });
  children.flat().forEach(function (child) {
    if (child === null || child === undefined || child === false) return;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  });
  return node;
}

function iconButton(icon, label, onclick, danger) {
  return el("button", { type: "button", className: "icon-btn" + (danger ? " danger" : ""), title: label, "aria-label": label, html: ICON[icon], onclick: onclick });
}

function badge(text, kind) { return el("span", { className: "badge" + (kind ? " " + kind : "") }, text); }

// Builds a table. cols = [{ label, num }], rows = [{ cells: [...], off: true/false }]
function makeTable(cols, rows, emptyText) {
  if (!rows.length) return el("p", { className: "empty card" }, emptyText);
  const head = el("tr", {}, cols.map(function (c) { return el("th", { className: c.num ? "num" : "" }, c.label); }));
  const body = rows.map(function (row) {
    return el("tr", { className: row.off ? "off" : "" },
      row.cells.map(function (cell, i) { return el("td", { className: cols[i].num ? "num" : "" }, cell); }));
  });
  return el("div", { className: "table-wrap" }, el("table", {}, el("thead", {}, head), el("tbody", {}, body)));
}

function filterBar(names, current, onPick, extra) {
  return el("div", { className: "toolbar" },
    el("div", { className: "filters" }, names.map(function (name) {
      return el("button", { type: "button", className: "filter" + (name === current ? " active" : ""), onclick: function () { onPick(name); } }, name);
    })),
    extra || null);
}

function chip(value, label, accent) {
  return el("div", { className: "chip" + (accent ? " accent" : "") }, el("b", {}, value), el("span", {}, label));
}

function matchesSearch(...texts) {
  const q = searchBox.value.trim().toLowerCase();
  return q === "" || texts.join(" ").toLowerCase().includes(q);
}

function when(text) { return text ? formatDate(text) : "Never"; }


/* ---------------------------------------------------------
   1. START: only the owner account may be here
   --------------------------------------------------------- */
(async function start() {
  let user = null;
  try { user = await getCurrentUser(); } catch (err) { user = null; }

  if (!user) { location.replace("login.html"); return; }
  if (user.role !== "owner") { location.replace(homeFor(user)); return; }

  document.querySelector("#ownerName").textContent = user.name;
  document.querySelector("#ownerInitial").textContent = (user.name.match(/\b\w/g) || ["O"]).slice(0, 2).join("").toUpperCase();
  document.querySelector("#today").textContent = new Date().toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  document.body.classList.remove("checking");

  const fromHash = location.hash.slice(1);
  if (TITLES[fromHash]) tab = fromHash;
  showTab(tab);
  // the offers form is never refreshed under your hands
  setInterval(function () { if (!document.hidden && modal.hidden && tab !== "offers") load(); }, REFRESH_SECONDS * 1000);
})();

document.querySelector("#logoutBtn").addEventListener("click", logOut);
document.querySelector("#menuBtn").addEventListener("click", function () { document.body.classList.toggle("toggled"); });

const userChip = document.querySelector("#userChip");
const userDropdown = document.querySelector("#userDropdown");
userChip.addEventListener("click", function (event) {
  event.stopPropagation();
  userDropdown.hidden = !userDropdown.hidden;
  userChip.setAttribute("aria-expanded", String(!userDropdown.hidden));
});
document.addEventListener("click", function () { userDropdown.hidden = true; });


/* ---------------------------------------------------------
   2. SIDE MENU + LOADING
   --------------------------------------------------------- */
document.querySelectorAll(".tab").forEach(function (button) {
  button.addEventListener("click", function () {
    showTab(button.dataset.tab);
    if (window.innerWidth <= 800) document.body.classList.remove("toggled");
  });
});

function showTab(name) {
  tab = name;
  searchBox.value = "";
  document.querySelectorAll(".tab").forEach(function (b) { b.classList.toggle("active", b.dataset.tab === name); });
  document.querySelector("#pageTitle").textContent = TITLES[name];
  document.title = TITLES[name] + " · MCC Canteen Owner";
  history.replaceState(null, "", "#" + name);
  view.innerHTML = "";
  headStats.innerHTML = "";
  load();
}

const ACTIONS = { dashboard: "owner_dashboard", menu: "owner_menu", offers: "owner_promo", staff: "owner_users&kind=staff", students: "owner_users&kind=student" };

async function load() {
  const name = tab;                                // the page may change while we wait
  try {
    const res = await api(ACTIONS[name]);
    data[name] = res;
    notice.hidden = true;
    if (name === tab) render();
  } catch (err) {
    notice.hidden = false;
    notice.className = "updated problem";
    notice.textContent = "Could not load: " + err.message;
  }
}

function render() {
  if (!data[tab]) return;
  const draw = { dashboard: drawDashboard, menu: drawMenu, offers: drawOffers, staff: drawStaff, students: drawStudents }[tab];
  draw(data[tab]);
}

searchBox.addEventListener("input", function () { if (tab === "menu" || tab === "staff" || tab === "students") render(); });

// Runs a change on the server, shows the problem if there is one, then reloads the page's data
async function change(action, payload, okMessage) {
  try {
    await api(action, payload);
    if (okMessage) showToast(okMessage);
    await load();
  } catch (err) {
    showToast(err.message);
  }
}


/* ---------------------------------------------------------
   3. THE POP-UP FORM (add / edit / reset password)
   --------------------------------------------------------- */
const modal = document.querySelector("#modal");
const modalForm = document.querySelector("#modalForm");
const modalError = document.querySelector("#modalError");
let modalSubmit = null;

function openForm(title, fields, okText, onSubmit) {
  document.querySelector("#modalTitle").textContent = title;
  document.querySelector("#modalOk").textContent = okText;
  modalError.textContent = "";
  const box = document.querySelector("#modalFields");
  box.innerHTML = "";

  fields.forEach(function (f) {
    const id = "f_" + f.name;
    let input;
    if (f.type === "select") {
      input = el("select", { id: id, name: f.name }, f.options.map(function (o) { return el("option", { value: o, selected: o === f.value }, o); }));
    } else {
      input = el("input", { id: id, name: f.name, type: f.type || "text", value: f.value ?? "", required: !!f.required, maxLength: f.max || 120, autocomplete: "off" });
      if (f.type === "number") { input.min = f.min; input.max = f.max_value; input.step = f.step || "1"; }
      if (f.type === "checkbox") input.checked = !!f.value;
    }
    box.append(f.type === "checkbox"
      ? el("div", { className: "field inline" }, input, el("label", { htmlFor: id }, f.label))
      : el("div", { className: "field" }, el("label", { htmlFor: id }, f.label), input, f.hint ? el("span", { className: "hint" }, f.hint) : null));
  });

  modalSubmit = async function () {
    const values = {};
    fields.forEach(function (f) {
      const input = modalForm.elements[f.name];
      values[f.name] = f.type === "checkbox" ? input.checked : input.value;
    });
    await onSubmit(values);
  };
  modal.hidden = false;
  const first = box.querySelector("input, select");
  if (first) first.focus();
}

function closeForm() { modal.hidden = true; modalSubmit = null; }
document.querySelector("#modalCancel").addEventListener("click", closeForm);
modal.addEventListener("mousedown", function (event) { if (event.target === modal) closeForm(); });
document.addEventListener("keydown", function (event) { if (event.key === "Escape" && !modal.hidden) closeForm(); });

modalForm.addEventListener("submit", async function (event) {
  event.preventDefault();
  if (!modalSubmit) return;
  const ok = document.querySelector("#modalOk");
  ok.disabled = true;
  modalError.textContent = "";
  try {
    await modalSubmit();
    closeForm();
    await load();
  } catch (err) {
    modalError.textContent = err.message;
  } finally {
    ok.disabled = false;
  }
});


/* ---------------------------------------------------------
   4. DASHBOARD
   --------------------------------------------------------- */
function drawDashboard(d) {
  headStats.replaceChildren(chip(formatPrice(d.sales.today), "Sales today", true), chip(d.unanswered, "Unanswered messages"));

  const stat = function (value, label, accent) {
    return el("div", { className: "card stat" + (accent ? " accent" : "") }, el("b", {}, value), el("span", {}, label));
  };
  const cards = el("div", { className: "grid cols-4" },
    stat(formatPrice(d.sales.today), "Sales today", true),
    stat(formatPrice(d.sales.week), "Last 7 days"),
    stat(formatPrice(d.sales.all), "All time"),
    stat(d.counts.Preparing + d.counts.Ready, "Active orders (" + d.counts.Preparing + " preparing, " + d.counts.Ready + " ready)"),
    stat(d.counts.Delivered, "Delivered"),
    stat(d.counts.Cancelled, "Cancelled"),
    stat(d.people.students, "Students (" + d.people.students_active + " active)"),
    stat(d.people.staff, "Staff accounts"));

  const best = makeTable([{ label: "Food" }, { label: "Sold", num: true }, { label: "Sales", num: true }],
    d.best.map(function (b) { return { cells: [b.name, b.qty, formatPrice(b.revenue)] }; }), "No sales yet.");
  const latest = makeTable([{ label: "Order" }, { label: "Customer" }, { label: "Total", num: true }, { label: "Status" }],
    d.latest.map(function (o) {
      return { cells: [el("span", {}, "#" + o.id, el("small", {}, formatDate(o.created_at) + " · Room " + o.room)), o.customer, formatPrice(o.total),
        badge(o.status, o.status === "Cancelled" ? "bad" : o.status === "Delivered" ? "" : "gray")] };
    }), "No orders yet.");

  view.replaceChildren(cards,
    el("div", { className: "grid cols-2" },
      el("div", {}, el("h2", { style: "margin:0 0 10px;font-family:var(--font-title);font-weight:normal" }, "Best sellers"), best),
      el("div", {}, el("h2", { style: "margin:0 0 10px;font-family:var(--font-title);font-weight:normal" }, "Latest orders"), latest)));
}


/* ---------------------------------------------------------
   5. MENU & PRICES
   --------------------------------------------------------- */
function foodFields(food) {
  return [
    { name: "name", label: "Food name", value: food.name, required: true, max: 60 },
    { name: "price", label: "Price (Php)", type: "number", value: food.price, required: true, min: 1, max_value: 9999, step: "0.01" },
    { name: "category", label: "Category", type: "select", options: CATEGORIES, value: food.category },
    { name: "available", label: "Available to order (untick = sold out)", type: "checkbox", value: food.available },
  ];
}

function saveFood(id, v) {
  return api("owner_menu_save", { id: id, name: v.name, price: v.price, category: v.category, available: v.available });
}

function drawMenu(d) {
  const menu = d.menu;
  const soldOut = menu.filter(function (f) { return !f.available; }).length;
  headStats.replaceChildren(chip(menu.length, "Foods", true), chip(soldOut, "Sold out"));

  const addBtn = el("button", { type: "button", className: "btn solid", onclick: function () {
    openForm("Add a food", foodFields({ name: "", price: "", category: "Snacks", available: true }), "Add food", function (v) { return saveFood(0, v); });
  } }, "+ Add food");

  const shown = menu.filter(function (f) {
    const pass = filters.menu === "All" || (filters.menu === "Sold out" ? !f.available : f.category === filters.menu);
    return pass && matchesSearch(f.name, f.category);
  });

  const rows = shown.map(function (f) {
    return { off: !f.available, cells: [
      f.name, f.category, formatPrice(f.price),
      f.available ? badge("Available") : badge("Sold out", "bad"),
      el("div", { className: "ops" },
        iconButton("edit", "Edit", function () {
          openForm("Edit food", foodFields(f), "Save", function (v) { return saveFood(f.id, v); });
        }),
        iconButton(f.available ? "out" : "play", f.available ? "Mark sold out" : "Mark available", function () {
          change("owner_menu_save", { id: f.id, name: f.name, price: f.price, category: f.category, available: !f.available },
                 f.name + (f.available ? " is now sold out." : " is available again."));
        }),
        iconButton("trash", "Delete", function () {
          if (confirm('Delete "' + f.name + '" from the menu?\nOld orders keep their name and price.')) change("owner_menu_delete", { id: f.id }, f.name + " was deleted.");
        }, true)),
    ] };
  });

  view.replaceChildren(
    filterBar(["All"].concat(CATEGORIES, ["Sold out"]), filters.menu, function (name) { filters.menu = name; render(); }, addBtn),
    makeTable([{ label: "Food" }, { label: "Category" }, { label: "Price", num: true }, { label: "Status" }, { label: "Operation" }], rows, "No foods to show."),
    el("p", { className: "hint", style: "margin-top:12px" }, "Prices here are the ones students are charged. Foods that are not on the student page yet appear there under “New on the menu”."));
}


/* ---------------------------------------------------------
   6. OFFERS & PROMO
   --------------------------------------------------------- */
function drawOffers(d) {
  headStats.replaceChildren(chip(d.enabled ? "On" : "Off", "First-order promo", true), chip(d.percent + "%", "Discount"));

  const toggle = el("input", { type: "checkbox", checked: d.enabled, id: "promoOn" });
  const percent = el("input", { type: "number", id: "promoPercent", min: 1, max: 50, step: 1, value: d.percent });
  const error = el("p", { className: "form-error" });
  const save = el("button", { type: "button", className: "btn solid", onclick: async function () {
    save.disabled = true;
    error.textContent = "";
    try {
      await api("owner_promo_save", { enabled: toggle.checked, percent: Number(percent.value) });
      showToast("Promo saved.");
      await load();
    } catch (err) { error.textContent = err.message; save.disabled = false; }
  } }, "Save changes");

  const form = el("div", { className: "card" },
    el("h2", {}, "First-order discount"),
    el("div", { className: "switch-row" },
      el("label", { className: "switch" }, toggle, el("span")),
      el("div", {}, el("b", {}, "Promo is " + (d.enabled ? "running" : "switched off")),
        el("p", { className: "hint" }, "When it is off, nobody can claim it and no order gets a discount."))),
    el("div", { className: "field", style: "max-width:200px" }, el("label", { htmlFor: "promoPercent" }, "Percent off the first order (1–50)"), percent),
    error, save);

  const stat = function (value, label) { return el("div", { className: "card stat" }, el("b", {}, value), el("span", {}, label)); };
  const numbers = el("div", { className: "grid cols-4", style: "margin-top:16px" },
    stat(d.claimed, "Students who claimed it"), stat(d.used, "Orders that got the discount"), stat(formatPrice(d.given), "Total discount given"));

  view.replaceChildren(form, numbers,
    el("p", { className: "hint", style: "margin-top:12px" }, "The percent and the on/off switch change the Offers page, the cart and the real price charged. “Pasko Deals” and “People power promo” are fixed texts on the Offers page, so they are not managed here."));
}


/* ---------------------------------------------------------
   7. STAFF + STUDENT ACCOUNTS
   --------------------------------------------------------- */
function resetPassword(account) {
  openForm("New password for " + account.name, [
    { name: "password", label: "New password (at least 8 characters)", type: "password", required: true, max: 100 },
  ], "Set password", function (v) { return api("owner_user_password", { id: account.id, password: v.password }).then(function () { showToast("Password changed."); }); });
}

function accountOps(account, noun) {
  return el("div", { className: "ops" },
    iconButton("key", "Reset password", function () { resetPassword(account); }),
    iconButton(account.active ? "pause" : "play", account.active ? "Suspend" : "Activate", function () {
      change("owner_user_active", { id: account.id, active: !account.active }, account.name + (account.active ? " was suspended." : " is active again."));
    }),
    iconButton("trash", "Delete", function () {
      if (confirm("Delete the " + noun + " account of " + account.name + "?\nThis cannot be undone.")) change("owner_user_delete", { id: account.id }, "Account deleted.");
    }, true));
}

const statusBadge = function (active) { return active ? badge("Active") : badge("Suspended", "bad"); };

function drawStaff(d) {
  const list = d.users;
  headStats.replaceChildren(chip(list.length, "Staff accounts", true), chip(list.filter(function (u) { return u.active; }).length, "Active"));

  const addBtn = el("button", { type: "button", className: "btn solid", onclick: function () {
    openForm("Add a staff account", [
      { name: "name", label: "Name", required: true, max: 60 },
      { name: "email", label: "Email (used to log in)", type: "email", required: true, max: 120 },
      { name: "password", label: "Password (at least 8 characters)", type: "password", required: true, max: 100 },
    ], "Add staff", function (v) { return api("owner_staff_add", v); });
  } }, "+ Add staff");

  const rows = list.filter(function (u) { return matchesSearch(u.name, u.email); }).map(function (u) {
    return { off: !u.active, cells: [el("span", {}, u.name, el("small", {}, u.email)), when(u.last_login_at), statusBadge(u.active), accountOps(u, "staff")] };
  });
  view.replaceChildren(el("div", { className: "toolbar" }, el("p", { className: "hint" }, "Staff log in on the same login page and manage orders and messages."), addBtn),
    makeTable([{ label: "Staff" }, { label: "Last login" }, { label: "Status" }, { label: "Operation" }], rows, "No staff accounts to show."));
}

function drawStudents(d) {
  const list = d.users;
  headStats.replaceChildren(chip(list.length, "Students", true), chip(list.filter(function (u) { return u.active; }).length, "Active"));

  const shown = list.filter(function (u) {
    const pass = filters.students === "All" || (filters.students === "Active" ? u.active : !u.active);
    return pass && matchesSearch(u.name, u.email, u.phone);
  });
  const rows = shown.map(function (u) {
    return { off: !u.active, cells: [u.name, u.email, u.orders, when(u.last_login_at), statusBadge(u.active), accountOps(u, "student")] };
  });
  view.replaceChildren(
    filterBar(["All", "Active", "Suspended"], filters.students, function (name) { filters.students = name; render(); }),
    makeTable([{ label: "Student" }, { label: "Email / number" }, { label: "Orders", num: true }, { label: "Last login" }, { label: "Status" }, { label: "Operation" }], rows, "No students to show."),
    el("p", { className: "hint", style: "margin-top:12px" }, "A student who already has orders cannot be deleted. Suspend the account instead."));
}
