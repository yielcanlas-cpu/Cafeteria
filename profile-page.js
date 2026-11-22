/* =========================================================
   profile-page.js  -  the profile page (profile.html)
   Needs common.js loaded first.
   Name, bio, location and birthdate are saved to the database (api.php).
   The two photos are kept in THIS browser only (see section 4).
   Everything from the database goes in with textContent, so nothing
   a person typed can ever run as code.
   ========================================================= */

const $ = function (selector) { return document.querySelector(selector); };

let user = null;          // the logged-in account (from common.js getCurrentUser)
let profile = null;       // what the database currently holds
let photos = {};          // saved photos: { avatar: "data:image/...", banner: "..." }
let pending = {};         // photos picked while editing, not saved yet


/* ---------------------------------------------------------
   1. START: load the logged-in person's profile
   --------------------------------------------------------- */
(async function start() {
  try { user = await getCurrentUser(); } catch (err) { user = null; }

  if (!user) {
    location.replace("login.html?next=profile.html");
    return;
  }

  $("#backLink").href = homeFor(user);            // staff go back to their own page
  $("#fBirthdate").max = new Date().toLocaleDateString("en-CA");   // no birthdays in the future
  document.body.classList.remove("checking");

  ["avatar", "banner"].forEach(function (kind) { photos[kind] = loadPhoto(kind); });
  showPhotos(photos);

  try {
    profile = (await api("profile")).profile;
    showProfile();
  } catch (err) {
    showToast(err.message);
  }
  showTab("favorites");
})();

function showProfile() {
  $("#profileName").textContent = profile.name;
  $("#email").textContent = profile.email;
  $("#email").hidden = !profile.email.includes("@");          // signed up with a number
  $("#bio").textContent = profile.bio;
  $("#location").textContent = profile.location || "No location yet";

  // "2026-11-08 07:30:00" -> "Joined in November 2026"
  const joined = new Date(profile.created_at.replace(" ", "T"));
  $("#joined").textContent = isNaN(joined)
    ? "Joined"
    : "Joined in " + joined.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

$("#logoutBtn").addEventListener("click", logOut);               // logOut() is in common.js


/* ---------------------------------------------------------
   2. TABS: Favorites / My orders
   --------------------------------------------------------- */
let activeTab = "";

function el(tag, className, text) {
  const item = document.createElement(tag);
  if (className) item.className = className;
  if (text !== undefined) item.textContent = text;
  return item;
}

function listRow(title, detail, badge) {
  const row = el("div", "pf-row");
  const head = el("div", "pf-row-head");
  head.append(el("span", "", title));
  if (badge) head.append(el("span", "badge " + badge, badge));
  row.append(head);
  detail.forEach(function (line) { row.append(el("small", "", line)); });
  return row;
}

const TABS = {
  // The hearts on the menu are kept in this browser (see panels.js), so read them from there
  favorites: async function () {
    let ids = [];
    try { ids = JSON.parse(localStorage.getItem("mcc_fav_" + user.id) || "[]") || []; } catch (err) { /* none */ }
    const foods = (await api("menu")).menu.filter(function (food) { return ids.includes(food.id); });
    if (!foods.length) return [el("p", "pf-empty", "No favorites yet. Tap the heart on any food in the menu.")];
    return foods.map(function (food) { return listRow(food.name, [formatPrice(food.price)]); });
  },

  orders: async function () {
    const orders = (await api("my_orders")).orders;
    if (!orders.length) return [el("p", "pf-empty", "No orders yet.")];
    return orders.map(function (order) {
      return listRow("Order #" + order.id, [
        order.items.map(function (item) { return item.qty + "× " + item.name; }).join(", "),
        formatDate(order.created_at) + " · " + formatPrice(order.total)
      ], order.status);
    });
  }
};

async function showTab(name) {
  activeTab = name;
  document.querySelectorAll("[data-tab]").forEach(function (button) {
    button.classList.toggle("on", button.dataset.tab === name);
  });
  $("#tabBody").replaceChildren(el("p", "pf-empty", "Loading..."));

  let rows;
  try { rows = await TABS[name](); } catch (err) { rows = [el("p", "pf-empty", err.message)]; }
  if (activeTab === name) $("#tabBody").replaceChildren(...rows);   // ignore a slow reply from a tab you left
}

document.querySelectorAll("[data-tab]").forEach(function (button) {
  button.addEventListener("click", function () { showTab(button.dataset.tab); });
});


/* ---------------------------------------------------------
   3. EDIT PROFILE: Name, Bio, Location, Birthdate
   --------------------------------------------------------- */
function setEditing(on) {
  $("#editForm").hidden = !on;
  $("#viewBox").hidden = on;
  $("#editBtn").hidden = on;
  document.querySelectorAll(".pf-photo-btn").forEach(function (button) { button.hidden = !on; });
}

function countLetters() {
  $("#nameCount").textContent = $("#fName").value.length;
  $("#bioCount").textContent = $("#fBio").value.length;
}
$("#fName").addEventListener("input", countLetters);
$("#fBio").addEventListener("input", countLetters);

$("#editBtn").addEventListener("click", function () {
  if (!profile) return;                           // still loading
  $("#fName").value = profile.name;
  $("#fBio").value = profile.bio;
  $("#fLocation").value = profile.location;
  $("#fBirthdate").value = profile.birthdate || "";
  countLetters();
  setEditing(true);
});

$("#cancelBtn").addEventListener("click", function () {
  pending = {};
  showPhotos(photos);                             // throw away photos picked but not saved
  setEditing(false);
});

$("#editForm").addEventListener("submit", async function (event) {
  event.preventDefault();
  const saveBtn = $("#saveBtn");
  saveBtn.disabled = true;
  try {
    const result = await api("update_profile", {
      name: $("#fName").value,
      bio: $("#fBio").value,
      location: $("#fLocation").value,
      birthdate: $("#fBirthdate").value
    });
    Object.assign(profile, result);               // the server sends back the tidied values

    let photoOk = true;
    Object.keys(pending).forEach(function (kind) {
      if (savePhoto(kind, pending[kind])) photos[kind] = pending[kind]; else photoOk = false;
    });
    pending = {};
    showPhotos(photos);

    showProfile();
    setEditing(false);
    showToast(photoOk ? "Saved." : "Saved, but the photo could not be kept in this browser.");
  } catch (err) {
    showToast(err.message);                       // stay in edit mode so nothing typed is lost
  } finally {
    saveBtn.disabled = false;
  }
});


/* ---------------------------------------------------------
   4. PHOTOS (avatar + banner)
   shortcut: photos live in this browser's localStorage, per account, so they do not
   follow you to another device. Upgrade: upload to the server (api.php) when needed.
   --------------------------------------------------------- */
const PHOTO_MAX = { avatar: 400, banner: 1200 };   // longest side in pixels, keeps the saved size small

function loadPhoto(kind) {
  try { return localStorage.getItem("mcc_" + kind + "_" + user.id) || ""; } catch (err) { return ""; }
}
function savePhoto(kind, dataUrl) {
  try { localStorage.setItem("mcc_" + kind + "_" + user.id, dataUrl); return true; } catch (err) { return false; }
}

function showPhotos(set) {
  $("#avatarImg").src = set.avatar || "img/avatar.svg";
  $("#banner").style.backgroundImage = set.banner ? 'url("' + set.banner + '")' : "";
}

// File -> a smaller JPEG as a data: address (rejects when the file is not a picture)
function shrinkPhoto(file, longestSide) {
  return new Promise(function (resolve, reject) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = function () {
      const scale = Math.min(1, longestSide / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.8));
    };
    img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("Please choose a picture file.")); };
    img.src = url;
  });
}

document.querySelectorAll(".pf-photo-btn").forEach(function (button) {
  button.addEventListener("click", function () {
    $("#photoInput").dataset.kind = button.dataset.photo;
    $("#photoInput").click();
  });
});

$("#photoInput").addEventListener("change", async function () {
  const file = this.files[0];
  const kind = this.dataset.kind;
  this.value = "";                                 // so picking the same file again still fires
  if (!file) return;
  try {
    pending[kind] = await shrinkPhoto(file, PHOTO_MAX[kind]);
    showPhotos(Object.assign({}, photos, pending)); // preview now, saved when you press Save
  } catch (err) {
    showToast(err.message);
  }
});
