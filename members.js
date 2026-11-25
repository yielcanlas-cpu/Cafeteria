/* members.js - the manager's Members page (members.html). Needs common.js first.
   Only the manager account can open it. */
const $ = (s) => document.querySelector(s);
let tab = "members";
let rows = [];
const initials = (name) => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0].toUpperCase()).join("");   // "Kim Minjeong" -> "KM"

(async function start() {
  let user = null;
  try { user = await getCurrentUser(); } catch (err) { user = null; }
  if (!user) { location.replace("login.html"); return; }
  if (user.role !== "manager") { location.replace(homeFor(user)); return; }
  $("#adminName").textContent = user.name;
  $("#avatar").textContent = initials(user.name);
  document.body.classList.remove("checking");
  load();
})();

$("#logoutBtn").addEventListener("click", logOut);

async function load() {
  try {
    const data = await api("manager_members", { tab, q: $("#search").value, status: $("#statusFilter").value });
    rows = data.members;
    $("#total").textContent = data.total;
    $("#activeCount").textContent = data.active;
    $("#error").textContent = "";
    render();
  } catch (err) { $("#error").textContent = err.message; }
}

function render() {
  const canEdit = tab === "members";                       // admin accounts are read-only here
  $("#rows").replaceChildren(...rows.map(function (m) {
    const tr = document.createElement("tr");
    const cell = (text) => { const td = document.createElement("td"); td.textContent = text; return td; };
    const pic = cell(""); pic.append(Object.assign(document.createElement("span"), { className: "pic", textContent: initials(m.name) }));
    const badge = Object.assign(document.createElement("span"), { className: "badge" + (m.active ? "" : " off"), textContent: m.active ? "Active" : "Inactive" });
    const status = cell(""); status.append(badge);
    const op = cell(""); op.className = "op";
    const icon = (label, path, onClick, className) => {      // static SVG only: no user text goes into innerHTML
      const b = Object.assign(document.createElement("button"), { type: "button", title: label, className: className || "" });
      b.setAttribute("aria-label", label + " " + m.name);
      b.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + path + "</svg>";
      b.onclick = onClick;
      return b;
    };
    op.append(icon("View", '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/>', () => openView(m.id)));
    if (canEdit) {
      op.append(icon("Edit", '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/>', () => openForm(m)));
      op.append(icon("Delete", '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>', () => remove(m), "del"));
    }
    tr.append(pic, cell(m.name), cell(m.phone), cell(m.email.includes("@") ? m.email : ""), status, cell(fmtDate(m.last_login_at) || "Never"), op);
    return tr;
  }));
  $("#empty").hidden = rows.length > 0;
  $("#addBtn").hidden = !canEdit;
}

document.querySelectorAll(".tab").forEach(function (b) {
  b.onclick = function () {
    tab = b.dataset.tab;
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t === b));
    load();
  };
});
$("#statusFilter").onchange = load;
let timer;
$("#search").oninput = function () { clearTimeout(timer); timer = setTimeout(load, 250); };

/* ----- monitor one account: profile, orders, messages ----- */
const fmtDate = (d) => d ? new Date(d.replace(" ", "T")).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "";
const peso = (n) => "₱" + Number(n).toFixed(2);
function entry(title, lines) {
  const d = document.createElement("div"); d.className = "entry";
  const b = document.createElement("b"); b.textContent = title; d.append(b);
  lines.forEach(function (t) { const s = document.createElement("small"); s.textContent = t; d.append(s); });
  return d;
}
async function openView(id) {
  try {
    const d = await api("manager_member_detail", { id });
    const u = d.user;
    $("#vName").textContent = u.name + (u.active ? "" : " (inactive)");
    $("#vInfo").textContent = [u.role, u.email, u.phone, u.location, u.bio].filter(Boolean).join(" · ");
    $("#vOrders").textContent = d.order_count;
    $("#vSpent").textContent = peso(d.spent);
    $("#vJoined").textContent = fmtDate(u.created_at).split(",").slice(0, 2).join(",");
    $("#vLast").textContent = fmtDate(u.last_login_at) || "Never";
    $("#vOrderList").replaceChildren(...(d.orders.length ? d.orders.map((o) => entry(
      "#" + o.id + " · " + o.status + " · " + peso(o.total) + " · " + fmtDate(o.created_at),
      [o.items.map((i) => i.qty + " × " + i.name).join(", "), "Room " + o.room + (o.note ? " · Note: " + o.note : "")]
    )) : [entry("No orders yet", [])]));
    $("#vMsgList").replaceChildren(...(d.messages.length ? d.messages.map((m) => entry(
      (m.subject || "(no subject)") + " · " + fmtDate(m.created_at), [m.message].concat(m.reply ? ["Reply: " + m.reply] : ["No reply yet"])
    )) : [entry("No messages", [])]));
    $("#viewDlg").showModal();
  } catch (err) { $("#error").textContent = err.message; }
}
$("#vClose").onclick = () => $("#viewDlg").close();

/* ----- add / edit ----- */
const dlg = $("#dlg"), form = $("#form");
let editingId = 0;
function openForm(m) {
  editingId = m ? m.id : 0;
  form.reset();
  $("#dlgTitle").textContent = m ? "Edit member" : "Add member";
  $("#passHint").textContent = m ? "(leave blank to keep the old one)" : "(at least 8 characters)";
  $("#formError").textContent = "";
  if (m) {
    form.name.value = m.name; form.email.value = m.email; form.phone.value = m.phone; form.active.checked = m.active;
  }
  dlg.showModal();
}
$("#addBtn").onclick = () => openForm(null);
$("#cancelBtn").onclick = () => dlg.close();
form.addEventListener("submit", async function (e) {
  e.preventDefault();
  try {
    await api("manager_save_member", {
      id: editingId, name: form.name.value, email: form.email.value, phone: form.phone.value,
      password: form.password.value, active: form.active.checked
    });
    dlg.close();
    load();
  } catch (err) { $("#formError").textContent = err.message; }
});

async function remove(m) {
  if (!confirm("Delete " + m.name + "? This cannot be undone.")) return;
  try { await api("manager_delete_member", { id: m.id }); load(); }
  catch (err) { $("#error").textContent = err.message; }
}

/* ----- export: a CSV file, which Excel opens ----- */
$("#exportBtn").onclick = function () {
  const q = (v) => '"' + String(v).replace(/"/g, '""').replace(/^([=+\-@])/, "'$1") + '"';   // the ' stops Excel running formulas
  const lines = [["Name", "Mobile", "Email", "Status"].join(",")].concat(rows.map((m) =>
    [m.name, m.phone, m.email.includes("@") ? m.email : "", m.active ? "Active" : "Inactive"].map(q).join(",")));
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv" })), download: "members.csv"
  });
  a.click();
  URL.revokeObjectURL(a.href);
};
