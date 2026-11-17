/* =========================================================
   login.js  -  the login / create account page

   After a successful login each account goes to its own home:
     student  ->  index.html  (the main menu / dashboard)
     staff    ->  admin.html  (all orders)
   ========================================================= */

const tabLogin = document.querySelector("#tabLogin");
const tabSignup = document.querySelector("#tabSignup");
const loginForm = document.querySelector("#loginForm");
const signupForm = document.querySelector("#signupForm");
const authError = document.querySelector("#authError");


/* ---------------------------------------------------------
   1. WHERE TO GO AFTER LOGGING IN
   If a page sent you here (login.html?next=profile.html) we go back to it,
   but only if it looks like a plain page name. Anything else is ignored,
   so nobody can use this page to send you to another website.
   --------------------------------------------------------- */
function destinationFor(user) {
  if (user.role === "admin") return "admin.html";

  const next = new URLSearchParams(location.search).get("next") || "";
  const looksSafe = /^[A-Za-z0-9_-]+\.html(#[A-Za-z0-9_-]+)?$/.test(next) && !next.startsWith("login.html") && !next.startsWith("admin.html");
  return looksSafe ? next : "index.html";
}


/* ---------------------------------------------------------
   2. TABS  (Log in / Create account)
   --------------------------------------------------------- */
function showTab(which) {
  const isLogin = which === "login";
  tabLogin.classList.toggle("active", isLogin);        // toggle(name, true/false) adds or removes
  tabSignup.classList.toggle("active", !isLogin);
  loginForm.hidden = !isLogin;
  signupForm.hidden = isLogin;
  authError.textContent = "";                          // clear the old message
}

tabLogin.addEventListener("click", function () { showTab("login"); });
tabSignup.addEventListener("click", function () { showTab("signup"); });


/* ---------------------------------------------------------
   2b. THE EYE  (show / hide the password)
   Each eye button sits next to its password box.
   --------------------------------------------------------- */
document.querySelectorAll(".eye").forEach(function (eye) {
  const input = eye.parentElement.querySelector("input");   // the box next to this eye
  const picture = eye.querySelector("img");

  eye.addEventListener("click", function () {
    const showIt = input.type === "password";       // is the password hidden right now?
    input.type = showIt ? "text" : "password";      // switch between hidden and visible
    picture.src = showIt ? "img/icons/eye-off.svg" : "img/icons/eye.svg";
    eye.setAttribute("aria-label", showIt ? "Hide password" : "Show password");
  });
});

// "Forgot password?" has no reset by email yet, so tell the person what to do
document.querySelector("#forgotLink").addEventListener("click", function (event) {
  event.preventDefault();
  showToast("Forgot your password? Please ask the canteen staff to help you.");
});


/* ---------------------------------------------------------
   3. SUBMITTING THE FORMS
   --------------------------------------------------------- */
function handleForm(form, action) {
  form.addEventListener("submit", async function (event) {
    event.preventDefault();                            // stop the page from reloading
    authError.textContent = "";

    const button = form.querySelector("button[type=submit]");
    button.disabled = true;                            // no double clicks while we wait

    try {
      // FormData reads every input that has a name="..." in the form
      const data = Object.fromEntries(new FormData(form));
      const { user } = await api(action, data);
      location.replace(destinationFor(user));          // go to the right home page
    } catch (err) {
      authError.textContent = err.message;
      button.disabled = false;
    }
  });
}

handleForm(loginForm, "login");
handleForm(signupForm, "register");


// login.html?tab=signup opens the Sign up tab straight away
if (new URLSearchParams(location.search).get("tab") === "signup") showTab("signup");


/* ---------------------------------------------------------
   4. ALREADY LOGGED IN?  Skip this page.
   If the server cannot be reached, show why instead of a blank form.
   --------------------------------------------------------- */
(async function init() {
  try {
    const user = await getCurrentUser();
    if (user) location.replace(destinationFor(user));
  } catch (err) {
    authError.textContent = err.message;
  }
})();
