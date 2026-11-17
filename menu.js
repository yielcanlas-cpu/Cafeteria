/* =========================================================
   menu.js  -  the menu page (menu.html)
   ========================================================= */


/* ---------------------------------------------------------
   1. THE < AND > ARROWS
   Every row has two arrows. Pressing one scrolls that row sideways
   by one "page" (the width of the row). An arrow turns pale when
   there is nothing more to scroll in that direction.
   --------------------------------------------------------- */
document.querySelectorAll(".carousel-row").forEach(function (row) {
  const track = row.querySelector(".track");
  const arrows = row.querySelectorAll(".arrow");

  // Switch an arrow off when the row is already at that end
  function updateArrows() {
    const atStart = track.scrollLeft <= 1;
    const atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 1;
    arrows[0].disabled = atStart;
    arrows[1].disabled = atEnd;
  }

  arrows.forEach(function (arrow) {
    arrow.addEventListener("click", function () {
      const direction = Number(arrow.dataset.dir);      // -1 = left, 1 = right
      track.scrollBy({ left: direction * track.clientWidth, behavior: "smooth" });
    });
  });

  track.addEventListener("scroll", updateArrows);       // runs while the row moves
  window.addEventListener("resize", updateArrows);      // and when the window changes size
  updateArrows();                                       // and once at the start
});


/* ---------------------------------------------------------
   2. TOP LINKS  (Offers, Contact us)
   Links that start with "#" do not go anywhere yet, so we just move the
   highlight to the one you clicked. "Login/Sign up" is a real link.
   --------------------------------------------------------- */
const navLinks = document.querySelectorAll(".nav-link");

navLinks.forEach(function (link) {
  if (!link.getAttribute("href").startsWith("#")) return;     // a real page -> leave it alone

  link.addEventListener("click", function (event) {
    event.preventDefault();                                   // stops the page jumping to the top
    navLinks.forEach(function (other) { other.classList.remove("active"); });
    link.classList.add("active");
  });
});


/* ---------------------------------------------------------
   3. LOGO + BACK BUTTON  (common.js)
   When you come from the dashboard's "View all" (or you are logged in),
   "Login/Sign up" becomes a Back button and the logo goes to your home page.
   --------------------------------------------------------- */
setupPublicHeader();
