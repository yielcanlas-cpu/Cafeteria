/* =========================================================
   landing.js  -  interactivity for landing.html

   3 steps used all through this file:
   1. FIND an element      -> document.querySelector("#id")
   2. LISTEN for an event  -> element.addEventListener("click", function)
   3. CHANGE something     -> classList / hidden / textContent
   ========================================================= */


/* ---------------------------------------------------------
   1. DROPDOWN MENU  (round button in the header)
   --------------------------------------------------------- */
const menuBtn = document.querySelector("#menuBtn");
const dropdown = document.querySelector("#dropdown");

// Opens or closes the dropdown
function toggleDropdown(open) {
  dropdown.hidden = !open;                         // hidden = true hides it
  menuBtn.setAttribute("aria-expanded", open);     // helps screen readers
}

menuBtn.addEventListener("click", function (event) {
  event.stopPropagation();   // stops this click from also reaching the "click anywhere" code below
  toggleDropdown(dropdown.hidden);                 // if hidden -> open, if open -> close
});

// Clicking anywhere else on the page closes the dropdown
document.addEventListener("click", function () {
  toggleDropdown(false);
});

// Pressing the Escape key closes it too
document.addEventListener("keydown", function (event) {
  if (event.key === "Escape") toggleDropdown(false);
});


/* ---------------------------------------------------------
   2. TOP LINKS  (Offers, Updates, ... highlight)
   Links that go to another page (like order.html) work normally.
   Links that start with "#" stay on this page: we move the
   highlight to them and scroll smoothly if the target exists.
   --------------------------------------------------------- */
const navLinks = document.querySelectorAll(".nav-link");

navLinks.forEach(function (link) {
  const target = link.getAttribute("href");

  if (!target.startsWith("#")) return;             // other page -> do nothing special

  link.addEventListener("click", function (event) {
    event.preventDefault();                        // stops the page jumping to the top

    navLinks.forEach(function (other) {
      other.classList.remove("active");            // clear the old highlight
    });
    link.classList.add("active");                  // highlight the clicked one

    // A plain "#" has no section name, so only look for a section if there is one
    if (target.length > 1) {
      const section = document.querySelector(target);   // e.g. "#overview"
      if (section) section.scrollIntoView({ behavior: "smooth" });
    }
  });
});


/* ---------------------------------------------------------
   3. SMOOTH SCROLL for other "#" links  (About Us card, dropdown)
   --------------------------------------------------------- */
document.querySelectorAll('.quick-card[href^="#"], .dropdown a[href^="#"]').forEach(function (link) {
  link.addEventListener("click", function (event) {
    event.preventDefault();
    const target = link.getAttribute("href");
    if (target.length > 1) {                        // skip a plain "#"
      const section = document.querySelector(target);
      if (section) section.scrollIntoView({ behavior: "smooth" });
    }
  });
});


/* ---------------------------------------------------------
   4. TOAST  (small message, used by the "Get app" button)
   Any element with data-toast="message" shows that message.
   --------------------------------------------------------- */
const toast = document.querySelector("#toast");
let toastTimer;                                    // remembers the timer so we can reset it

document.querySelectorAll("[data-toast]").forEach(function (item) {
  item.addEventListener("click", function () {
    toast.textContent = item.dataset.toast;        // reads data-toast="..." from the HTML
    toast.hidden = false;

    clearTimeout(toastTimer);                      // restart the timer if clicked again
    toastTimer = setTimeout(function () {
      toast.hidden = true;                         // hide again after 2.5 seconds
    }, 2500);
  });
});
