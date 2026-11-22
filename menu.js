/* =========================================================
   menu.js  -  the menu page (menu.html)
   Needs common.js loaded first.
   ========================================================= */

const dishes = document.querySelectorAll(".dish");
const tabs = document.querySelectorAll(".menu-tab");
const searchBox = document.querySelector("#menuSearch");
const emptyMsg = document.querySelector("#menuEmpty");

let category = "rice";                            // the tab that is open


/* ---------------------------------------------------------
   1. TABS + SEARCH
   With nothing typed, show the foods of the open tab.
   When something is typed, search ALL the foods (no tab is highlighted).
   --------------------------------------------------------- */
function showDishes() {
  const text = searchBox.value.trim().toLowerCase();
  let shown = 0;

  dishes.forEach(function (dish) {
    const name = dish.querySelector("figcaption").textContent.toLowerCase();
    const show = text ? name.includes(text) : dish.dataset.cat === category;
    dish.hidden = !show;
    if (show) shown++;
  });

  tabs.forEach(function (tab) { tab.classList.toggle("active", !text && tab.dataset.cat === category); });
  emptyMsg.hidden = shown > 0;
}

tabs.forEach(function (tab) {
  tab.addEventListener("click", function () {
    category = tab.dataset.cat;
    searchBox.value = "";
    showDishes();
  });
});
searchBox.addEventListener("input", showDishes);


/* ---------------------------------------------------------
   2. LOGO + BACK TO HOME  (common.js)
   Logged in -> the logo and "Back to Home" go to YOUR home page
   (student -> index.html, staff -> staff.html). A visitor goes to the landing page.
   --------------------------------------------------------- */
setupPublicHeader();
getCurrentUser().then(function (user) {
  if (user) document.querySelector("#backHome").href = homeFor(user);
}).catch(function () { /* server not reachable: keep the landing page link */ });
