/* =========================================================
   script.js  -  used by BOTH index.html and profile.html

   How JavaScript works with HTML, in 3 steps:
   1. FIND an element      -> document.querySelector("#id")
   2. LISTEN for an event  -> element.addEventListener("click", function)
   3. CHANGE something     -> element.textContent = "...", element.classList.add("...")

   Because this file is shared, each block first checks that its
   element exists (e.g. "if (menuBtn)") so it doesn't crash on
   the page that doesn't have it.
   ========================================================= */


/* ---------------------------------------------------------
   1. SIDEBAR TOGGLE  (hamburger button)
   Adds/removes the class "toggled" on <body>. The CSS does the
   actual hiding/showing, JS only flips the class.
   --------------------------------------------------------- */
const menuBtn = document.querySelector("#menuBtn");

if (menuBtn) {
  menuBtn.addEventListener("click", function () {
    document.body.classList.toggle("toggled");
  });
}


/* ---------------------------------------------------------
   2. SIDEBAR HIGHLIGHT
   Clicking a sidebar link moves the red "active" pill to it.
   --------------------------------------------------------- */
const navLinks = document.querySelectorAll(".nav-link"); // finds ALL matches

navLinks.forEach(function (link) {
  link.addEventListener("click", function (event) {
    event.preventDefault();                  // stops "#" from jumping the page

    navLinks.forEach(function (other) {
      other.classList.remove("active");      // clear the old highlight
    });
    link.classList.add("active");            // highlight the one clicked
  });
});


/* ---------------------------------------------------------
   3. BANNER CAROUSEL  (slides + dots)
   --------------------------------------------------------- */
const slides = document.querySelectorAll(".slide");
const dotsBox = document.querySelector("#dots");
let currentSlide = 0;                        // which slide is showing (0 = first)

// Shows the slide with the given number
function showSlide(number) {
  currentSlide = number;

  slides.forEach(function (slide, index) {
    // classList.toggle(name, true/false) adds the class if true, removes if false
    slide.classList.toggle("active", index === number);
  });

  document.querySelectorAll(".dot").forEach(function (dot, index) {
    dot.classList.toggle("active", index === number);
  });
}

if (dotsBox && slides.length > 0) {
  // Make one dot per slide
  slides.forEach(function (slide, index) {
    const dot = document.createElement("button");   // create a new <button>
    dot.className = "dot";
    dot.setAttribute("aria-label", "Show slide " + (index + 1));
    dot.addEventListener("click", function () {
      showSlide(index);
    });
    dotsBox.appendChild(dot);                       // put it on the page
  });

  showSlide(0);

  // Every 4 seconds, go to the next slide (the % wraps back to 0 at the end)
  setInterval(function () {
    showSlide((currentSlide + 1) % slides.length);
  }, 4000);
}

// "Order Now" button scrolls down to the Students Choice section
const orderNowBtn = document.querySelector("#orderNowBtn");
if (orderNowBtn) {
  orderNowBtn.addEventListener("click", function () {
    document.querySelector("#students-choice").scrollIntoView({ behavior: "smooth" });
  });
}


/* ---------------------------------------------------------
   4. SEARCH  (filters the food items as you type)
   --------------------------------------------------------- */
const searchInput = document.querySelector("#searchInput");
const foodItems = document.querySelectorAll(".food");

if (searchInput) {
  searchInput.addEventListener("input", function () {
    const text = searchInput.value.toLowerCase();   // lowercase so "Coke" = "coke"

    foodItems.forEach(function (food) {
      const name = food.dataset.name.toLowerCase(); // reads data-name="..." from HTML
      // includes() is true if the name contains what was typed
      food.hidden = !name.includes(text);           // hidden = true hides the element
    });
  });
}


/* ---------------------------------------------------------
   5. CART  (click a food to add it, the right-side panel updates)
   --------------------------------------------------------- */
const subtotalEl = document.querySelector("#subtotal");
const totalEl = document.querySelector("#total");
const confirmBtn = document.querySelector("#confirmBtn");
const orderMoreBtn = document.querySelector("#orderMoreBtn");
const cancelBtn = document.querySelector("#cancelBtn");
const cartItemsEl = document.querySelector("#cartItems");
const cartEmptyEl = document.querySelector("#cartEmpty");
const itemCountEl = document.querySelector("#itemCount");
const fabCountEl = document.querySelector("#fabCount");
const cartFab = document.querySelector("#cartFab");
const cartClose = document.querySelector("#cartClose");

// Each line is one kind of food, e.g. [{ name: "Fishballs", price: 20, qty: 2 }, ...]
let cart = [];

// Turns 85 into "Php85.00"
function formatPrice(amount) {
  return "Php" + amount.toFixed(2);   // toFixed(2) = always 2 decimal places
}

// Re-draws the whole panel using whatever is currently in the cart
function updateCart() {
  let sum = 0;
  let count = 0;

  cartItemsEl.innerHTML = "";                  // empty the list first

  cart.forEach(function (line, index) {
    sum += line.price * line.qty;
    count += line.qty;

    // Build one <li> row: name + quantity | price | remove button
    const li = document.createElement("li");
    li.innerHTML =
      '<div><span class="item-name"></span><span class="item-qty"></span></div>' +
      '<span class="item-price"></span>' +
      '<button class="remove-btn" aria-label="Remove"><img src="img/icons/x.svg" alt=""></button>';

    // textContent puts plain text into the empty spans
    li.querySelector(".item-name").textContent = line.name;
    li.querySelector(".item-qty").textContent = formatPrice(line.price) + " × " + line.qty;
    li.querySelector(".item-price").textContent = formatPrice(line.price * line.qty);

    // DELETE ONE FOOD from the order
    li.querySelector(".remove-btn").addEventListener("click", function () {
      cart.splice(index, 1);                   // splice(position, 1) removes 1 line
      updateCart();
    });

    cartItemsEl.appendChild(li);
  });

  subtotalEl.textContent = formatPrice(sum);
  // Total = subtotal for now. Add a delivery fee or discount here later.
  totalEl.textContent = formatPrice(sum);

  itemCountEl.textContent = "(" + count + ")";
  fabCountEl.textContent = count;

  // Empty cart: show the message, hide the list, gray out the buttons
  const isEmpty = cart.length === 0;
  cartEmptyEl.hidden = !isEmpty;
  cartItemsEl.hidden = isEmpty;
  confirmBtn.disabled = isEmpty;
  cancelBtn.disabled = isEmpty;
}

if (subtotalEl) {
  // Click a food -> add it (or add +1 if it is already in the cart)
  foodItems.forEach(function (food) {
    food.addEventListener("click", function () {
      const name = food.dataset.name;
      const price = Number(food.dataset.price);   // data-* values are text, so convert to a number

      // find() looks for a line with the same name
      const existing = cart.find(function (line) { return line.name === name; });

      if (existing) {
        existing.qty += 1;
      } else {
        cart.push({ name: name, price: price, qty: 1 });
      }
      updateCart();
    });
  });

  // "Order More" goes back to the top to keep browsing (and closes the panel on phones)
  orderMoreBtn.addEventListener("click", function () {
    document.body.classList.remove("cart-open");
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  // CANCEL WHOLE ORDER: ask first, then empty the cart
  cancelBtn.addEventListener("click", function () {
    if (confirm("Cancel your whole order?")) {   // confirm() is true if they press OK
      cart = [];
      updateCart();
    }
  });

  // "Confirm Order" shows a summary, then empties the cart
  confirmBtn.addEventListener("click", function () {
    const lines = cart.map(function (line) { return line.name + " × " + line.qty; });
    alert("Order confirmed!\n\n" + lines.join("\n") + "\n\nTotal: " + totalEl.textContent);
    cart = [];
    document.body.classList.remove("cart-open");
    updateCart();
  });

  // Phones: the round button opens the panel, the close button hides it
  cartFab.addEventListener("click", function () {
    document.body.classList.add("cart-open");
  });
  cartClose.addEventListener("click", function () {
    document.body.classList.remove("cart-open");
  });

  updateCart();   // draw the empty state when the page first loads
}


/* ---------------------------------------------------------
   6. PROFILE "EDIT" BUTTONS
   First click: makes the text editable and changes button to "Save".
   Second click: locks the text again.
   --------------------------------------------------------- */
document.querySelectorAll(".edit-btn").forEach(function (button) {
  button.addEventListener("click", function () {
    // data-target="email" in the HTML -> find the element with id="email"
    const target = document.querySelector("#" + button.dataset.target);
    const isEditing = target.isContentEditable;   // true if currently editable

    if (isEditing) {
      // Finish editing
      target.contentEditable = "false";
      target.classList.remove("editing");
      button.textContent = "Edit";
    } else {
      // Start editing
      target.contentEditable = "true";
      target.classList.add("editing");
      target.focus();                             // put the cursor inside
      button.textContent = "Save";
    }
  });
});
