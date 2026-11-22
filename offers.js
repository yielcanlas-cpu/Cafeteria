/* =========================================================
   offers.js  -  the offers page (offers.html)

   Two views on one page:
     offers.html                -> all the offers (3 cards)
     offers.html#first-time     -> one offer (the card you pressed)

   The "10% off for new customers" offer has a CHECK: the server (api.php)
   looks at the account's order history, so only a real first-time customer
   can get the discount. Nobody can switch it on just by saying "yes".
   ========================================================= */


/* ---------------------------------------------------------
   1. THE OFFERS  -  edit the text and pictures here
   --------------------------------------------------------- */
const OFFERS = {
  "first-time": {
    title: "10% off for new customers",
    image: "img/offer-first-time.jpg",
    text: "New to MCC Canteen? Enjoy 10% OFF on your first purchase!",
    extra: "Sign up, press Submit below to confirm that you are a first-time customer, then place your order. The discount is taken off the total for you.",
    note: "Note: Promo is valid for new customers only and can be redeemed once.",
    firstTime: true
  },
  "pasko": {
    title: "Pasko Deals",
    image: "img/offer-pasko.jpg",
    text: "Celebrate the holiday season with our special Pasko Promo! From December 1–4, students can enjoy exclusive discounts on delivery services whenever they place an order. Make your favorite cafeteria meals more affordable and convenient this Christmas season. Don't miss out on this limited-time holiday offer!",
    extra: "Find it under Bundle on the main menu. Perfect for sharing with a classmate between lectures."
  },
  "people-power": {
    title: "People power promo",
    image: "img/offer-people-power.jpg",
    text: "Join the movement by raising awareness about current political issues in the Philippines. Share an informative post on your social media, send us proof of your participation, and receive 20% OFF your purchase!",
    extra: "Find it under Bundle on the main menu.",
    note: "Note: Promo is valid for new customers only and can be redeemed once."
  }
};

const offerList = document.querySelector("#offerList");
const offerDetail = document.querySelector("#offerDetail");

setupPublicHeader();                                 // logo + Back button (common.js)


/* ---------------------------------------------------------
   2. THE 3 CARDS
   --------------------------------------------------------- */
const grid = document.querySelector("#offerGrid");
Object.keys(OFFERS).forEach(function (key) {
  const offer = OFFERS[key];
  const card = document.createElement("a");
  card.className = "offer-card";
  card.href = "#" + key;
  const img = document.createElement("img");
  img.src = offer.image;
  img.alt = offer.title;
  const label = document.createElement("span");
  label.textContent = offer.title;
  card.append(img, label);
  grid.append(card);
});


/* ---------------------------------------------------------
   3. SHOW THE LIST OR ONE OFFER  (depends on the # in the address)
   --------------------------------------------------------- */
function showPage() {
  const key = location.hash.slice(1);
  const offer = OFFERS[key];

  offerList.hidden = !!offer;
  offerDetail.hidden = !offer;
  if (!offer) return;

  document.title = offer.title + " · MCC Canteen";
  document.querySelector("#offerImg").src = offer.image;
  document.querySelector("#offerImg").alt = offer.title;
  document.querySelector("#offerTitle").textContent = offer.title;
  document.querySelector("#offerText").textContent = offer.text;
  document.querySelector("#offerExtra").textContent = offer.extra || "";

  const action = document.querySelector("#offerAction");
  action.innerHTML = "";
  if (offer.firstTime) buildFirstTimeCheck(action, offer);
  else {
    action.append(orderButton());
    if (offer.note) {
      const note = document.createElement("p");
      note.className = "offer-note";
      note.textContent = offer.note;
      action.append(note);
    }
  }
}

window.addEventListener("hashchange", showPage);
document.querySelector("#offerBack").addEventListener("click", function (event) {
  event.preventDefault();
  history.pushState(null, "", location.pathname + location.search);   // drop the #
  showPage();
});
showPage();


/* ---------------------------------------------------------
   4. "Order now" button (for offers that are just bundles)
   --------------------------------------------------------- */
function orderButton() {
  const link = document.createElement("a");
  link.className = "red-btn";
  link.href = "index.html";
  link.textContent = "Send us the proof";
  
  return link;
}


/* ---------------------------------------------------------
   5. THE FIRST-TIME CUSTOMER CHECK
   Not logged in -> asks you to log in first.
   Logged in     -> asks the server where this account stands (api.php: promo_status):
        claimed  -> "You are verified"
        eligible -> the Yes / No question + Submit
        neither  -> "this promo is for first-time customers only"
   --------------------------------------------------------- */
async function buildFirstTimeCheck(box, offer) {
  const note = document.createElement("p");
  note.className = "offer-note";
  note.textContent = offer.note;

  function showMessage(kind, html) {                 // a green or gray box (html = our own text only)
    box.innerHTML = '<div class="status-box ' + kind + '">' + html + "</div>";
    box.append(note);
  }

  // Is anybody logged in?
  let user = null;
  try { user = await getCurrentUser(); } catch (err) { /* handled below */ }

  if (!user) {
    box.innerHTML = '<h3>First-Time Customer?</h3>';
    const login = document.createElement("a");
    login.className = "red-btn";
    login.href = "login.html?tab=signup&next=offers.html";
    login.textContent = "Sign up or log in to claim";
    box.append(login, note);
    return;
  }
  if (user.role !== "student") { showMessage("bad", "This promo is for student accounts."); return; }

  let promo;
  try { promo = await api("promo_status"); } catch (err) { showMessage("bad", "Could not check your account. Please try again."); return; }

  if (promo.claimed) {
    showMessage("good", "&#10003; You are verified as a first-time customer! " + promo.percent + "% off will be taken off your first order.<br><a href=\"index.html\">Order now &rarr;</a>");
    return;
  }
  if (!promo.eligible) {
    showMessage("bad", "This promo is for first-time customers only, and your account already has an order. Check out our other offers!");
    return;
  }

  // Eligible but has not pressed Submit yet: show the question
  box.innerHTML =
    "<h3>First-Time Customer?</h3>" +
    '<div class="yesno">' +
      '<label><input type="radio" name="firstTime" value="yes" checked><span>Yes</span></label>' +
      '<label><input type="radio" name="firstTime" value="no"><span>No</span></label>' +
    "</div>";
  const submit = document.createElement("button");
  submit.type = "button";
  submit.className = "red-btn";
  submit.textContent = "Submit";
  box.append(submit, note);

  submit.addEventListener("click", async function () {
    const answer = box.querySelector("input[name=firstTime]:checked").value;
    if (answer === "no") {
      showToast("No problem! This promo is only for first-time customers.");
      return;
    }
    submit.disabled = true;
    try {
      const result = await api("promo_claim");       // the server checks the order history
      showMessage("good", "&#10003; Verified! " + result.percent + "% off will be taken off your first order.<br><a href=\"index.html\">Order now &rarr;</a>");
    } catch (err) {
      showMessage("bad", "");                        // replace the question with the server's reason
      box.querySelector(".status-box").textContent = err.message;
      box.append(note);
    }
  });
}
