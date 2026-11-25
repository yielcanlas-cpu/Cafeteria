/* =========================================================
   common.js  -  small helpers shared by every page that talks
   to the server (login, dashboard, profile, staff page).

   Load it BEFORE the page's own script:
     <script src="common.js"></script>
     <script src="script.js"></script>
   ========================================================= */


/* ---------------------------------------------------------
   api("action", data)  ->  talks to api.php and gives back its JSON reply.
     const { user } = await api("me");
     await api("login", { email: "...", password: "..." });
   If anything goes wrong it THROWS an Error with a readable message,
   so callers can use try { ... } catch (err) { show(err.message) }.
   --------------------------------------------------------- */
async function api(action, payload) {
  // 1. Send the request. This only fails if api.php cannot be reached at all
  //    (for example the page was opened by double-clicking the file).
  let res;
  try {
    res = await fetch("api.php?action=" + action, payload ? {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    } : undefined);
  } catch (err) {
    throw new Error("Cannot reach api.php. Open this page from Laragon: http://localhost/Mcc-Canteen/login.html");
  }

  // 2. Read the reply as text first, so we can show a useful message
  //    when it is not valid JSON.
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    console.error("api.php did not return JSON. It returned:", text);

    // Live Server or any plain file server does not run PHP: it either sends the
    // PHP source code back as-is, or refuses the request (404 / 405 / 501).
    if (text.trim().startsWith("<?php") || [404, 405, 501].includes(res.status)) {
      throw new Error("PHP is not running here (HTTP " + res.status + "). Open this page from Laragon: http://localhost/Mcc-Canteen/login.html, not Live Server.");
    }
    // Otherwise PHP printed a warning or error: show a short, readable piece of it
    const readable = text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);
    throw new Error("Server error: " + (readable || "api.php returned an empty reply (check the PHP error log)."));
  }

  // 3. api.php answered with JSON. If it reported a problem, show its message.
  if (!res.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}


/* ---------------------------------------------------------
   Account helpers
   --------------------------------------------------------- */

// Who is logged in?  -> the user object, or null when nobody is
async function getCurrentUser() {
  const data = await api("me");
  return data.user;
}

// Each kind of account has its own "home" page
function homeFor(user) {
  if (user.role === "owner") return "owner.html";
  return user.role === "admin" ? "admin.html" : "index.html";
}

// Log out, then go to the login page
async function logOut() {
  try { await api("logout"); } catch (err) { /* leaving anyway */ }
  location.replace("login.html");
}


/* ---------------------------------------------------------
   Formatting helpers
   --------------------------------------------------------- */

// 85 -> "Php85.00"
function formatPrice(amount) {
  return "Php" + Number(amount).toFixed(2);   // toFixed(2) = always 2 decimal places
}

// "2026-11-08 07:30:00" (from MySQL) -> "Nov 8, 7:30 AM"
function formatDate(text) {
  const date = new Date(String(text).replace(" ", "T"));
  if (isNaN(date)) return text;
  return date.toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}


/* ---------------------------------------------------------
   showToast("message")  ->  a small message at the bottom of the screen
   --------------------------------------------------------- */
let toastTimer;                                    // remembers the timer so we can restart it

function showToast(message) {
  let toast = document.querySelector("#toast");

  if (!toast) {                                    // create it the first time
    toast = document.createElement("div");
    toast.id = "toast";
    toast.setAttribute("role", "status");
    document.body.appendChild(toast);
  }

  toast.textContent = message;                     // textContent = plain text (safe)
  toast.hidden = false;

  clearTimeout(toastTimer);                        // restart the timer if called again
  toastTimer = setTimeout(function () {
    toast.hidden = true;
  }, 3500);
}


/* ---------------------------------------------------------
   setupPublicHeader()  -  the red bar of landing / menu / offers / contact

   1. THE LOGO: for someone who is logged in it goes to THEIR home
      (student -> index.html, staff -> admin.html), not to the landing page.
      A visitor who is not logged in still goes to the landing page.
   2. THE "Login/Sign up" LINK: pages mark it with data-auth-link="back" or "home".
        back -> a BACK button once you are logged in (or came from the dashboard)
        home -> a "Home" link once you are logged in
      Opening a page with ?from=app (the dashboard's "View all" does this) switches it
      at once, without waiting for the server, so Login/Sign up never flashes.
   --------------------------------------------------------- */
function setupPublicHeader() {
  const brand = document.querySelector(".brand");
  const authLinks = document.querySelectorAll("[data-auth-link]");
  const fromApp = new URLSearchParams(location.search).get("from") === "app";

  function apply(user) {
    const home = homeFor(user);
    if (brand) brand.setAttribute("href", home);

    authLinks.forEach(function (authLink) {
      // data-auth-link="hide": a link only guests need (like Sign up)
      if (authLink.dataset.authLink === "hide") { authLink.hidden = true; return; }
      authLink.setAttribute("href", home);
      if (authLink.dataset.authLink === "back") {
        authLink.classList.add("back-btn");
        authLink.innerHTML = '<img src="img/icons/arrow-left.svg" alt=""> Back';
        authLink.onclick = function (event) {
          // Same website before this page? Go back to exactly where the person was.
          let sameSite = false;
          try { sameSite = document.referrer !== "" && new URL(document.referrer).origin === location.origin; } catch (err) { /* ignore */ }
          if (sameSite && history.length > 1) {
            event.preventDefault();
            history.back();
          }                                    // otherwise the link goes to the home page
        };
      } else {
        authLink.textContent = "Home";
      }
    });
  }

  if (fromApp) apply({ role: "student" });     // instant: we know a student is logged in
  getCurrentUser().then(function (user) {
    if (user) apply(user);
  }).catch(function () { /* server not reachable: leave the header as it is */ });
}


/* ---------------------------------------------------------
   Browser storage + delivery floors
   Used by the dashboard (script.js) and the menu page (menu.js),
   which share the same cart.
   --------------------------------------------------------- */
// Tiny helpers: browser storage can be blocked, so every use is wrapped in try/catch
function loadFromBrowser(key, fallback) {
  try { return localStorage.getItem(key) ?? fallback; } catch (err) { return fallback; }
}
// Reads a saved list/object (cart, favorites) and never throws if the saved text is damaged
function loadJsonFromBrowser(key, fallback) {
  try {
    const value = JSON.parse(loadFromBrowser(key, "") || "null");
    return value === null || value === undefined ? fallback : value;
  } catch (err) { return fallback; }
}
function saveToBrowser(key, value) {
  try { localStorage.setItem(key, value); } catch (err) { /* ignore */ }
}

// Where the order goes. The fee for each floor comes from api.php ("menu" action),
// because the server is the one that charges it.
const FLOOR_NAMES = { 1: "First Floor", 2: "Second Floor" };

// Fills a floor <select> with "First Floor (Php5.00)", "Second Floor (Php10.00)" and keeps the choice
function fillFloorSelect(select, fees) {
  const chosen = select.value;
  select.innerHTML = '<option value="">Select floor</option>';
  Object.keys(fees || {}).forEach(function (floor) {
    const option = document.createElement("option");
    option.value = floor;
    option.textContent = (FLOOR_NAMES[floor] || "Floor " + floor) + " (" + formatPrice(fees[floor]) + ")";
    select.append(option);
  });
  select.value = chosen;
}
